/**
 * RoutaCoordinator tests
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  RoutaCoordinator,
  AgentExecutionContext,
} from "../routa-coordinator";
import { CoordinationPhase } from "../coordination-state";
import { InMemoryAgentStore } from "../../store/agent-store";
import { InMemoryConversationStore } from "../../store/conversation-store";
import { InMemoryTaskStore } from "../../store/task-store";
import { EventBus } from "../../events/event-bus";
import { AgentTools } from "../../tools/agent-tools";
import { AgentRole, AgentStatus } from "../../models/agent";
import { TaskStatus } from "../../models/task";

// Mock AgentTools
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

    // Actually save the agent to the store
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
  ): Promise<void> {
    // Mock implementation
  }
}

describe("RoutaCoordinator", () => {
  let coordinator: RoutaCoordinator;
  let context: AgentExecutionContext;

  beforeEach(() => {
    const agentStore = new InMemoryAgentStore();

    context = {
      agentStore,
      conversationStore: new InMemoryConversationStore(),
      taskStore: new InMemoryTaskStore(),
      eventBus: new EventBus(),
      agentTools: new MockAgentTools(agentStore),
    };

    coordinator = new RoutaCoordinator(context);
  });

  it("should initialize with PLANNING phase", async () => {
    const routaAgentId = await coordinator.initialize("test-workspace");

    expect(routaAgentId).toBeTruthy();

    const state = coordinator.getState();
    expect(state.workspaceId).toBe("test-workspace");
    expect(state.routaAgentId).toBe(routaAgentId);
    expect(state.phase).toBe(CoordinationPhase.PLANNING);
  });

  it("should register tasks and transition to READY", async () => {
    await coordinator.initialize("test-workspace");

    const planOutput = `
@@@task
# Implement authentication

## Objective
Add JWT authentication

## Definition of Done
- JWT middleware created
- Tests passing
@@@
    `.trim();

    const taskIds = await coordinator.registerTasks(planOutput);

    expect(taskIds).toHaveLength(1);

    const state = coordinator.getState();
    expect(state.phase).toBe(CoordinationPhase.READY);
    expect(state.taskIds).toEqual(taskIds);

    // Verify task was saved
    const tasks = await context.taskStore.listByWorkspace("test-workspace");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Implement authentication");
  });

  it("should execute next wave and create CRAFTER agents", async () => {
    await coordinator.initialize("test-workspace");

    const planOutput = `
@@@task
# Task 1

## Objective
First task
@@@

@@@task
# Task 2

## Objective
Second task
@@@
    `.trim();

    await coordinator.registerTasks(planOutput);

    const delegations = await coordinator.executeNextWave();

    expect(delegations.length).toBeGreaterThan(0);

    const state = coordinator.getState();
    expect(state.phase).toBe(CoordinationPhase.EXECUTING);
    expect(state.activeCrafterIds.length).toBeGreaterThan(0);
  });

  it("should transition to COMPLETED when all tasks are done", async () => {
    await coordinator.initialize("test-workspace");

    const planOutput = `
@@@task
# Simple task

## Objective
Do something
@@@
    `.trim();

    const taskIds = await coordinator.registerTasks(planOutput);

    // Mark task as completed
    const task = await context.taskStore.get(taskIds[0]);
    if (task) {
      await context.taskStore.save({
        ...task,
        status: TaskStatus.COMPLETED,
      });
    }

    // Execute next wave - should detect all tasks are done
    await coordinator.executeNextWave();

    const state = coordinator.getState();
    expect(state.phase).toBe(CoordinationPhase.COMPLETED);
  });
});

