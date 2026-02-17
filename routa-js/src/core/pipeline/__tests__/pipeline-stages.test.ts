/**
 * Pipeline stages tests
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { PlanningStage } from "../stages/planning-stage";
import { TaskRegistrationStage } from "../stages/task-registration-stage";
import { CrafterExecutionStage } from "../stages/crafter-execution-stage";
import { GateVerificationStage } from "../stages/gate-verification-stage";
import { createPipelineContext, PipelineContext } from "../pipeline-context";
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

// ── Mock Provider ────────────────────────────────────────────────

class MockProvider implements AgentProvider {
  private agentStore: InMemoryAgentStore;
  responses = new Map<AgentRole, string>();

  constructor(agentStore: InMemoryAgentStore) {
    this.agentStore = agentStore;
    // Default responses
    this.responses.set(
      AgentRole.ROUTA,
      `
@@@task
# Test Task

## Objective
Test objective

## Definition of Done
- Criteria 1
- Criteria 2
@@@
    `.trim()
    );
    this.responses.set(AgentRole.CRAFTER, "Task completed successfully");
    this.responses.set(AgentRole.GATE, "✅ APPROVED");
  }

  async run(role: AgentRole, agentId: string, prompt: string): Promise<string> {
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

// ── Mock AgentTools ──────────────────────────────────────────────

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

// ── Tests ────────────────────────────────────────────────────────

describe("Pipeline Stages", () => {
  let context: PipelineContext;
  let executionContext: AgentExecutionContext;
  let provider: MockProvider;

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

    context = createPipelineContext({
      context: executionContext,
      provider,
      workspaceId: "test-workspace",
      userRequest: "Implement a new feature",
    });
  });

  it("PlanningStage should create ROUTA agent and generate plan", async () => {
    const stage = new PlanningStage();
    const result = await stage.execute(context);

    expect(result.type).toBe("continue");
    expect(context.routaAgentId).toBeTruthy();
    expect(context.planOutput).toContain("@@@task");
  });

  it("TaskRegistrationStage should parse and register tasks", async () => {
    // First run planning
    const planningStage = new PlanningStage();
    await planningStage.execute(context);

    // Then register tasks
    const registrationStage = new TaskRegistrationStage();
    const result = await registrationStage.execute(context);

    expect(result.type).toBe("continue");
    expect(context.taskIds.length).toBeGreaterThan(0);

    // Verify tasks were saved
    const tasks = await executionContext.taskStore.listByWorkspace(
      "test-workspace"
    );
    expect(tasks.length).toBeGreaterThan(0);
  });

  it("CrafterExecutionStage should execute ready tasks", async () => {
    // Setup: create tasks
    const planningStage = new PlanningStage();
    await planningStage.execute(context);

    const registrationStage = new TaskRegistrationStage();
    await registrationStage.execute(context);

    // Execute crafters
    const crafterStage = new CrafterExecutionStage();
    const result = await crafterStage.execute(context);

    expect(result.type).toBe("continue");
    expect(context.delegations.length).toBeGreaterThan(0);

    // Verify tasks are marked as REVIEW_REQUIRED
    const tasks = await executionContext.taskStore.listByWorkspace(
      "test-workspace"
    );
    expect(tasks.some((t) => t.status === TaskStatus.REVIEW_REQUIRED)).toBe(
      true
    );
  });

  it("GateVerificationStage should approve tasks", async () => {
    // Setup: create and execute tasks
    const planningStage = new PlanningStage();
    await planningStage.execute(context);

    const registrationStage = new TaskRegistrationStage();
    await registrationStage.execute(context);

    const crafterStage = new CrafterExecutionStage();
    await crafterStage.execute(context);

    // Verify with GATE
    const gateStage = new GateVerificationStage();
    const result = await gateStage.execute(context);

    expect(result.type).toBe("done");
    if (result.type === "done") {
      expect(result.result.type).toBe("success");
    }

    // Verify tasks are marked as COMPLETED
    const tasks = await executionContext.taskStore.listByWorkspace(
      "test-workspace"
    );
    expect(tasks.every((t) => t.status === TaskStatus.COMPLETED)).toBe(true);
  });

  it("GateVerificationStage should request fixes when not approved", async () => {
    // Setup
    const planningStage = new PlanningStage();
    await planningStage.execute(context);

    const registrationStage = new TaskRegistrationStage();
    await registrationStage.execute(context);

    const crafterStage = new CrafterExecutionStage();
    await crafterStage.execute(context);

    // Make GATE reject
    provider.responses.set(AgentRole.GATE, "❌ NEEDS FIX: Tests are failing");

    // Verify with GATE
    const gateStage = new GateVerificationStage();
    const result = await gateStage.execute(context);

    expect(result.type).toBe("repeat_pipeline");
    if (result.type === "repeat_pipeline") {
      expect(result.fromStageName).toBe("crafter-execution");
    }

    // Verify tasks are marked as NEEDS_FIX
    const tasks = await executionContext.taskStore.listByWorkspace(
      "test-workspace"
    );
    expect(tasks.some((t) => t.status === TaskStatus.NEEDS_FIX)).toBe(true);
  });
});

