/**
 * RoutaOrchestrator tests
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { RoutaOrchestrator } from "../routa-orchestrator";
import { AgentExecutionContext } from "../../coordinator/routa-coordinator";
import { InMemoryAgentStore } from "../../store/agent-store";
import { InMemoryConversationStore } from "../../store/conversation-store";
import { InMemoryTaskStore } from "../../store/task-store";
import { EventBus } from "../../events/event-bus";
import { AgentTools } from "../../tools/agent-tools";
import { AgentRole, AgentStatus } from "../../models/agent";
import { TaskStatus } from "../../models/task";
import {
  AgentProvider,
  ProviderCapabilities,
  StreamChunk,
} from "../../provider/agent-provider";

// ── Mock Provider ────────────────────────────────────────────────────────────

class MockProvider implements AgentProvider {
  private agentStore: InMemoryAgentStore;
  responses = new Map<AgentRole, string>();
  callCount = 0;

  constructor(agentStore: InMemoryAgentStore) {
    this.agentStore = agentStore;
    // Default responses
    this.responses.set(
      AgentRole.ROUTA,
      `
@@@task
# Implement Login Feature

## Objective
Add user login functionality

## Definition of Done
- Login form created
- Authentication works
@@@
    `.trim()
    );
    this.responses.set(AgentRole.CRAFTER, "Task completed successfully");
    this.responses.set(AgentRole.GATE, "✅ APPROVED");
  }

  async run(role: AgentRole, agentId: string, prompt: string): Promise<string> {
    this.callCount++;
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

describe("RoutaOrchestrator", () => {
  let executionContext: AgentExecutionContext;
  let provider: MockProvider;
  let orchestrator: RoutaOrchestrator;

  beforeEach(() => {
    const agentStore = new InMemoryAgentStore();
    provider = new MockProvider(agentStore);

    executionContext = {
      agentStore,
      conversationStore: new InMemoryConversationStore(),
      taskStore: new InMemoryTaskStore(),
      eventBus: new EventBus(),
      agentTools: new MockAgentTools(agentStore),
    };

    orchestrator = new RoutaOrchestrator({
      context: executionContext,
      provider,
      workspaceId: "test-workspace",
    });
  });

  it("should execute full ROUTA → CRAFTER → GATE workflow", async () => {
    const result = await orchestrator.execute("Implement login feature");

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.taskSummaries.length).toBeGreaterThan(0);
    }

    // Verify all tasks are completed
    const tasks = await executionContext.taskStore.listByWorkspace(
      "test-workspace"
    );
    expect(tasks.every((t) => t.status === TaskStatus.COMPLETED)).toBe(true);
  });

  it("should handle GATE rejection and retry", async () => {
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

    const result = await orchestrator.execute("Implement login feature");

    expect(result.type).toBe("success");
    expect(gateCallCount).toBe(2); // Should have called GATE twice
  });

  it("should handle no tasks scenario", async () => {
    // Make ROUTA return no tasks
    provider.responses.set(AgentRole.ROUTA, "No tasks needed");

    const result = await orchestrator.execute("Simple request");

    expect(result.type).toBe("no_tasks");
  });

  it("should invoke phase change callbacks", async () => {
    const phases: string[] = [];

    const orchestratorWithCallbacks = new RoutaOrchestrator({
      context: executionContext,
      provider,
      workspaceId: "test-workspace",
      onPhaseChange: (phase) => {
        phases.push(phase.type);
      },
    });

    await orchestratorWithCallbacks.execute("Implement login feature");

    expect(phases).toContain("initializing");
    expect(phases).toContain("planning");
    expect(phases).toContain("tasks_registered");
    expect(phases).toContain("wave_starting");
    expect(phases).toContain("completed");
  });

  it("should invoke streaming callbacks", async () => {
    const chunks: Array<{ agentId: string; content: string }> = [];

    const orchestratorWithCallbacks = new RoutaOrchestrator({
      context: executionContext,
      provider,
      workspaceId: "test-workspace",
      onStreamChunk: (agentId, chunk) => {
        if (chunk.type === "text") {
          chunks.push({ agentId, content: chunk.content });
        }
      },
    });

    await orchestratorWithCallbacks.execute("Implement login feature");

    expect(chunks.length).toBeGreaterThan(0);
  });
});

