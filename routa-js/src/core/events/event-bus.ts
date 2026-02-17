/**
 * EventBus - port of routa-core EventBus.kt
 *
 * Publish/subscribe event system for inter-agent communication.
 */

export enum AgentEventType {
  AGENT_CREATED = "AGENT_CREATED",
  AGENT_ACTIVATED = "AGENT_ACTIVATED",
  AGENT_COMPLETED = "AGENT_COMPLETED",
  AGENT_ERROR = "AGENT_ERROR",
  TASK_ASSIGNED = "TASK_ASSIGNED",
  TASK_COMPLETED = "TASK_COMPLETED",
  TASK_FAILED = "TASK_FAILED",
  MESSAGE_SENT = "MESSAGE_SENT",
  REPORT_SUBMITTED = "REPORT_SUBMITTED",
}

export interface AgentEvent {
  type: "agent_completed" | "agent_error" | "agent_created" | "task_assigned" | "task_completed";
  agentId: string;
  workspaceId?: string;
  error?: string;
  data?: Record<string, unknown>;
  timestamp?: Date;
}

export interface EventSubscription {
  id: string;
  agentId: string;
  agentName: string;
  eventTypes: AgentEventType[];
  excludeSelf: boolean;
}

type EventHandler = (event: AgentEvent) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, EventHandler>();
  private subscriptions = new Map<string, EventSubscription>();
  private pendingEvents = new Map<string, AgentEvent[]>();

  /**
   * Subscribe to events with a handler function (simple API)
   * @returns Unsubscribe function
   */
  subscribe(handler: EventHandler): () => void {
    const key = `handler-${Date.now()}-${Math.random()}`;
    this.handlers.set(key, handler);
    return () => this.handlers.delete(key);
  }

  /**
   * Subscribe to events with a handler function (legacy API)
   */
  on(key: string, handler: EventHandler): void {
    this.handlers.set(key, handler);
  }

  /**
   * Unsubscribe a handler
   */
  off(key: string): void {
    this.handlers.delete(key);
  }

  /**
   * Publish an event to all subscribed handlers
   */
  emit(event: AgentEvent): void {
    // Deliver to direct handlers
    for (const handler of this.handlers.values()) {
      try {
        const result = handler(event);
        // Handle async handlers
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error("[EventBus] Async handler error:", err);
          });
        }
      } catch (err) {
        console.error("[EventBus] Handler error:", err);
      }
    }

    // Buffer for agent subscriptions
    for (const sub of this.subscriptions.values()) {
      if (sub.excludeSelf && event.agentId === sub.agentId) continue;
      if (!sub.eventTypes.includes(event.type)) continue;

      const pending = this.pendingEvents.get(sub.agentId) ?? [];
      pending.push(event);
      this.pendingEvents.set(sub.agentId, pending);
    }
  }

  /**
   * Register an agent event subscription
   */
  subscribe(subscription: EventSubscription): void {
    this.subscriptions.set(subscription.id, subscription);
  }

  /**
   * Remove an agent event subscription
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Drain all pending events for an agent
   */
  drainPendingEvents(agentId: string): AgentEvent[] {
    const events = this.pendingEvents.get(agentId) ?? [];
    this.pendingEvents.delete(agentId);
    return events;
  }
}
