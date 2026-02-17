/**
 * RoutaCoordinator - port of routa-core RoutaCoordinator.kt
 *
 * The coordination state machine that implements the Routa→Crafter→Gate workflow.
 *
 * ## Workflow
 * ```
 * User Request
 *   → Routa plans (@@@task blocks)
 *     → Wave of Crafter agents (parallel)
 *       → Each Crafter reports to Routa
 *         → Gate verifies
 *           → APPROVED: next wave or done
 *           → NOT APPROVED: fix tasks → Crafter again
 * ```
 */

import { v4 as uuidv4 } from "uuid";
import { AgentStore } from "../store/agent-store";
import { ConversationStore } from "../store/conversation-store";
import { TaskStore } from "../store/task-store";
import { EventBus, AgentEvent } from "../events/event-bus";
import { AgentTools } from "../tools/agent-tools";
import { Agent, AgentRole, AgentStatus } from "../models/agent";
import { Task, TaskStatus } from "../models/task";
import {
  CoordinationState,
  CoordinationPhase,
  createCoordinationState,
} from "./coordination-state";
import { parseTaskBlocks } from "./task-parser";

/**
 * Agent execution context - holds all stores and tools.
 */
export interface AgentExecutionContext {
  agentStore: AgentStore;
  conversationStore: ConversationStore;
  taskStore: TaskStore;
  eventBus: EventBus;
  agentTools: AgentTools;
}

/**
 * Coordination state change callback.
 */
export type CoordinationStateListener = (state: CoordinationState) => void;

/**
 * The coordination state machine.
 */
export class RoutaCoordinator {
  private context: AgentExecutionContext;
  private state: CoordinationState;
  private listeners: Set<CoordinationStateListener> = new Set();
  private eventUnsubscribe?: () => void;

  constructor(context: AgentExecutionContext) {
    this.context = context;
    this.state = createCoordinationState("", "");
  }

  /**
   * Subscribe to coordination state changes.
   */
  onStateChange(listener: CoordinationStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get the current coordination state.
   */
  getState(): CoordinationState {
    return { ...this.state };
  }

  /**
   * Initialize a new coordination session.
   *
   * Creates the ROUTA (coordinator) agent and returns its ID.
   *
   * @param workspaceId The workspace to coordinate in
   * @returns The ROUTA agent's ID
   */
  async initialize(workspaceId: string): Promise<string> {
    const routaAgent = await this.createRouta(workspaceId);
    this.state = createCoordinationState(workspaceId, routaAgent.id);
    this.notifyListeners();
    this.startEventListener();
    return routaAgent.id;
  }

  /**
   * Register tasks from ROUTA's planning output.
   *
   * Parses `@@@task` blocks and stores them.
   *
   * @param planOutput The ROUTA agent's output containing task blocks
   * @returns List of created task IDs
   */
  async registerTasks(planOutput: string): Promise<string[]> {
    const tasks = parseTaskBlocks(planOutput, this.state.workspaceId);

    for (const task of tasks) {
      await this.context.taskStore.save(task);
    }

    this.state = {
      ...this.state,
      taskIds: tasks.map((t) => t.id),
      phase: CoordinationPhase.READY,
    };
    this.notifyListeners();

    return tasks.map((t) => t.id);
  }

  /**
   * Start executing the next wave of tasks.
   *
   * Creates CRAFTER agents for each ready task and delegates the work.
   *
   * @returns List of [agentId, taskId] pairs for the created CRAFTERs
   */
  async executeNextWave(): Promise<Array<[string, string]>> {
    const readyTasks = await this.context.taskStore.findReadyTasks(
      this.state.workspaceId
    );

    if (readyTasks.length === 0) {
      // Check if all tasks are done
      const allTasks = await this.context.taskStore.listByWorkspace(
        this.state.workspaceId
      );
      if (allTasks.every((t) => t.status === TaskStatus.COMPLETED)) {
        this.state = { ...this.state, phase: CoordinationPhase.COMPLETED };
        this.notifyListeners();
      }
      return [];
    }

    this.state = { ...this.state, phase: CoordinationPhase.EXECUTING };
    this.notifyListeners();

    const delegations: Array<[string, string]> = [];

    for (const task of readyTasks) {
      // Create a CRAFTER agent
      const crafterName = `crafter-${task.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`;

      const result = await this.context.agentTools.createAgent({
        name: crafterName,
        role: AgentRole.CRAFTER,
        workspaceId: this.state.workspaceId,
        parentId: this.state.routaAgentId,
      });

      if (result.success && result.data) {
        const agentId = this.extractAgentId(result.data);
        if (agentId) {
          // Delegate the task
          await this.context.agentTools.delegate(
            agentId,
            task.id,
            this.state.routaAgentId
          );
          delegations.push([agentId, task.id]);
        }
      }
    }

    this.state = {
      ...this.state,
      activeCrafterIds: delegations.map(([agentId]) => agentId),
    };
    this.notifyListeners();

    return delegations;
  }

  /**
   * Start verification for completed tasks.
   *
   * Creates a GATE agent for tasks in REVIEW_REQUIRED status.
   *
   * @returns The GATE agent ID, or null if no tasks need verification
   */
  async startVerification(): Promise<string | null> {
    const reviewTasks = await this.context.taskStore.listByStatus(
      this.state.workspaceId,
      TaskStatus.REVIEW_REQUIRED
    );

    if (reviewTasks.length === 0) return null;

    this.state = { ...this.state, phase: CoordinationPhase.VERIFYING };
    this.notifyListeners();

    // Create a single GATE agent for this verification wave
    const result = await this.context.agentTools.createAgent({
      name: `gate-wave-${Date.now()}`,
      role: AgentRole.GATE,
      workspaceId: this.state.workspaceId,
      parentId: this.state.routaAgentId,
    });

    if (!result.success || !result.data) return null;

    const gateAgentId = this.extractAgentId(result.data);
    if (!gateAgentId) return null;

    this.state = { ...this.state, gateAgentId };
    this.notifyListeners();

    return gateAgentId;
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.eventUnsubscribe) {
      this.eventUnsubscribe();
      this.eventUnsubscribe = undefined;
    }
    this.listeners.clear();
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private async createRouta(workspaceId: string): Promise<Agent> {
    const result = await this.context.agentTools.createAgent({
      name: `routa-${uuidv4().slice(0, 8)}`,
      role: AgentRole.ROUTA,
      workspaceId,
    });

    if (!result.success || !result.data) {
      throw new Error("Failed to create ROUTA agent");
    }

    const agentId = this.extractAgentId(result.data);
    if (!agentId) {
      throw new Error("Failed to extract ROUTA agent ID");
    }

    const agent = await this.context.agentStore.get(agentId);
    if (!agent) {
      throw new Error("ROUTA agent not found after creation");
    }

    // Set agent to ACTIVE immediately
    await this.context.agentStore.updateStatus(agentId, AgentStatus.ACTIVE);

    return agent;
  }

  private extractAgentId(data: unknown): string | null {
    if (typeof data === "object" && data !== null && "agentId" in data) {
      return (data as { agentId: string }).agentId;
    }
    return null;
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }

  private startEventListener(): void {
    // Subscribe to agent events
    this.eventUnsubscribe = this.context.eventBus.subscribe(
      async (event: AgentEvent) => {
        await this.handleEvent(event);
      }
    );
  }

  private async handleEvent(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case "agent_completed": {
        const agent = await this.context.agentStore.get(event.agentId);
        if (agent?.role === AgentRole.CRAFTER) {
          // Check if all CRAFTERs in this wave are done
          const allCompleted = await this.areAllCraftersComplete();
          if (allCompleted && this.state.activeCrafterIds.length > 0) {
            this.state = {
              ...this.state,
              phase: CoordinationPhase.WAVE_COMPLETE,
              activeCrafterIds: [],
            };
            this.notifyListeners();
          }
        }
        break;
      }
      case "agent_error": {
        this.state = {
          ...this.state,
          phase: CoordinationPhase.ERROR,
          error: event.error,
        };
        this.notifyListeners();
        break;
      }
    }
  }

  private async areAllCraftersComplete(): Promise<boolean> {
    for (const crafterId of this.state.activeCrafterIds) {
      const agent = await this.context.agentStore.get(crafterId);
      if (
        agent &&
        agent.status !== AgentStatus.COMPLETED &&
        agent.status !== AgentStatus.ERROR
      ) {
        return false;
      }
    }
    return true;
  }
}

