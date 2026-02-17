/**
 * Integration tests for multi-agent orchestration
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { RoutaOrchestrator } from "../orchestrator/routa-orchestrator";
import { InMemoryAgentStore } from "../store/agent-store";
import { InMemoryConversationStore } from "../store/conversation-store";
import { InMemoryTaskStore } from "../store/task-store";
import { EventBus } from "../events/event-bus";
import { AgentTools } from "../tools/agent-tools";
import { CapabilityBasedRouter } from "../provider/capability-based-router";
import { AgentRole, AgentStatus } from "../models/agent";
import { TaskStatus } from "../models/task";
import {
  AgentProvider,
  ProviderCapabilities,
  StreamChunk,
} from "../provider/agent-provider";

// ── Mock Provider ────────────────────────────────────────────────────────────

class MockProvider implements AgentProvider {
  private agentStore: InMemoryAgentStore;
  responses = new Map<AgentRole, string>();
  callLog: Array<{ role: AgentRole; agentId: string; prompt: string }> = [];

  constructor(agentStore: InMemoryAgentStore) {
    this.agentStore = agentStore;
    // Default responses
    this.responses.set(
      AgentRole.ROUTA,
      `
@@@task
# Implement User Authentication

## Objective
Add JWT-based authentication to the API

## Scope
- src/auth/jwt.ts
- src/middleware/auth.ts

## Definition of Done
- JWT tokens are generated on login
- Protected routes require valid tokens
- Tests pass

## Verification
- npm test
@@@
    `.trim()
    );
    this.responses.set(
      AgentRole.CRAFTER,
      "Implementation completed successfully"
    );
    this.responses.set(AgentRole.GATE, "✅ APPROVED - All criteria met");
  }

  async run(role: AgentRole, agentId: string, prompt: string): Promise<string> {
    this.callLog.push({ role, agentId, prompt });
    return this.responses.get(role) || "Mock response";
  }

  async runStreaming(
    role: AgentRole,
    agentId: string,
    prompt: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<string> {
    const result = await this.run(role, agentId, prompt);
    onChunk({ type: "text", content: result });
    return result;
  }

  isHealthy(agentId: string): boolean {
    return true;
  }

  async interrupt(agentId: string): Promise<void> {}

  capabilities(): ProviderCapabilities {
    return {
      name: "MockProvider",
      supportsStreaming: true,
      supportsInterrupt: false,
      supportsHealthCheck: true,
      supportsFileEditing: true,
      supportsTerminal: true,
      supportsToolCalling: true,
      maxConcurrentAgents: 10,
      priority: 10,
    };
  }

  async cleanup(agentId: string): Promise<void> {}
  async shutdown(): Promise<void> {}
}

// ── Mock AgentTools ──────────────────────────────────────────────────────────

class MockAgentTools implements AgentTools {
  private agentCounter = 0;
  private agentStore: InMemoryAgentStore;

  constructor(agentStore: InMemoryAgentStore) {
    this.agentStore = agentStore;
  }

  async createAgent(params: {
    name: string;
    role: AgentRole;
    workspaceId: string;
    parentId?: string;
  }): Promise<{ success: boolean; data?: { agentId: string } }> {
    const agentId = `agent-${++this.agentCounter}`;

    await this.agentStore.save({
      id: agentId,
      name: params.name,
      role: params.role,
      workspaceId: params.workspaceId,
      status: AgentStatus.IDLE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      success: true,
      data: { agentId },
    };
  }

  async delegate(
    agentId: string,
    taskId: string,
    delegatorId: string
  ): Promise<void> {}
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Multi-Agent Integration", () => {
  it("should execute complete ROUTA → CRAFTER → GATE workflow", async () => {
    const agentStore = new InMemoryAgentStore();
    const provider = new MockProvider(agentStore);
    const router = new CapabilityBasedRouter();
    router.register(provider);

    const orchestrator = new RoutaOrchestrator({
      context: {
        agentStore,
        conversationStore: new InMemoryConversationStore(),
        taskStore: new InMemoryTaskStore(),
        eventBus: new EventBus(),
        agentTools: new MockAgentTools(agentStore),
      },
      provider: router,
      workspaceId: "integration-test",
    });

    const result = await orchestrator.execute(
      "Implement user authentication with JWT"
    );

    // Verify result
    expect(result.type).toBe("success");

    // Verify all three agent types were called
    const roles = provider.callLog.map((c) => c.role);
    expect(roles).toContain(AgentRole.ROUTA);
    expect(roles).toContain(AgentRole.CRAFTER);
    expect(roles).toContain(AgentRole.GATE);

    // Verify call order: ROUTA → CRAFTER → GATE
    expect(roles[0]).toBe(AgentRole.ROUTA);
    expect(roles[roles.length - 1]).toBe(AgentRole.GATE);
  }, 10000);

  it("should handle GATE rejection and retry workflow", async () => {
    const agentStore = new InMemoryAgentStore();
    const provider = new MockProvider(agentStore);
    const router = new CapabilityBasedRouter();
    router.register(provider);

    // First GATE call rejects, second approves
    let gateCallCount = 0;
    const originalRun = provider.run.bind(provider);
    provider.run = async (role, agentId, prompt) => {
      if (role === AgentRole.GATE) {
        gateCallCount++;
        if (gateCallCount === 1) {
          return "❌ NEEDS FIX: Tests are failing";
        }
      }
      return originalRun(role, agentId, prompt);
    };

    const orchestrator = new RoutaOrchestrator({
      context: {
        agentStore,
        conversationStore: new InMemoryConversationStore(),
        taskStore: new InMemoryTaskStore(),
        eventBus: new EventBus(),
        agentTools: new MockAgentTools(agentStore),
      },
      provider: router,
      workspaceId: "retry-test",
    });

    const result = await orchestrator.execute("Implement feature with bugs");

    // Verify result
    expect(result.type).toBe("success");

    // Verify GATE was called twice
    expect(gateCallCount).toBe(2);

    // Verify CRAFTER was called twice (initial + fix)
    const crafterCalls = provider.callLog.filter(
      (c) => c.role === AgentRole.CRAFTER
    );
    expect(crafterCalls.length).toBe(2);
  }, 10000);

  it("should handle multiple tasks in parallel", async () => {
    const agentStore = new InMemoryAgentStore();
    const provider = new MockProvider(agentStore);
    const router = new CapabilityBasedRouter();
    router.register(provider);

    // ROUTA returns multiple tasks
    provider.responses.set(
      AgentRole.ROUTA,
      `
@@@task
# Task 1: Frontend

## Objective
Build UI components

## Definition of Done
- Components created
@@@

@@@task
# Task 2: Backend

## Objective
Build API endpoints

## Definition of Done
- Endpoints created
@@@
    `.trim()
    );

    const taskStore = new InMemoryTaskStore();
    const orchestrator = new RoutaOrchestrator({
      context: {
        agentStore,
        conversationStore: new InMemoryConversationStore(),
        taskStore,
        eventBus: new EventBus(),
        agentTools: new MockAgentTools(agentStore),
      },
      provider: router,
      workspaceId: "parallel-test",
    });

    const result = await orchestrator.execute("Build full-stack app");

    // Verify result
    expect(result.type).toBe("success");

    // Verify two tasks were created
    const tasks = await taskStore.listByWorkspace("parallel-test");
    expect(tasks.length).toBe(2);

    // Verify both tasks are completed
    expect(tasks.every((t) => t.status === TaskStatus.COMPLETED)).toBe(true);
  }, 10000);

  it("should track phase changes during orchestration", async () => {
    const agentStore = new InMemoryAgentStore();
    const provider = new MockProvider(agentStore);
    const router = new CapabilityBasedRouter();
    router.register(provider);

    const phases: string[] = [];

    const orchestrator = new RoutaOrchestrator({
      context: {
        agentStore,
        conversationStore: new InMemoryConversationStore(),
        taskStore: new InMemoryTaskStore(),
        eventBus: new EventBus(),
        agentTools: new MockAgentTools(agentStore),
      },
      provider: router,
      workspaceId: "phase-test",
      onPhaseChange: (phase) => {
        phases.push(phase.type);
      },
    });

    await orchestrator.execute("Simple task");

    // Verify all expected phases occurred
    expect(phases).toContain("initializing");
    expect(phases).toContain("planning");
    expect(phases).toContain("tasks_registered");
    expect(phases).toContain("wave_starting");
    expect(phases).toContain("completed");
  }, 10000);

  it("should handle streaming chunks from agents", async () => {
    const agentStore = new InMemoryAgentStore();
    const provider = new MockProvider(agentStore);
    const router = new CapabilityBasedRouter();
    router.register(provider);

    const chunks: Array<{ agentId: string; content: string }> = [];

    const orchestrator = new RoutaOrchestrator({
      context: {
        agentStore,
        conversationStore: new InMemoryConversationStore(),
        taskStore: new InMemoryTaskStore(),
        eventBus: new EventBus(),
        agentTools: new MockAgentTools(agentStore),
      },
      provider: router,
      workspaceId: "streaming-test",
      onStreamChunk: (agentId, chunk) => {
        if (chunk.type === "text") {
          chunks.push({ agentId, content: chunk.content });
        }
      },
    });

    await orchestrator.execute("Task with streaming");

    // Verify chunks were received
    expect(chunks.length).toBeGreaterThan(0);

    // Verify chunks from different agent types
    const agentIds = chunks.map((c) => c.agentId);
    expect(new Set(agentIds).size).toBeGreaterThan(1);
  }, 10000);
});

