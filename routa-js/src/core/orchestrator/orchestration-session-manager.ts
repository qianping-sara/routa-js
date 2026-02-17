/**
 * OrchestrationSessionManager - Redis-based manager for persistent orchestration sessions
 *
 * This is the equivalent of Kotlin's IdeaRoutaService.getInstance(project)
 * It maintains orchestration sessions across API requests using Redis for persistence.
 */

import Redis from "ioredis";
import { InMemoryAgentStore } from "../store/agent-store";
import { InMemoryConversationStore } from "../store/conversation-store";
import { InMemoryTaskStore } from "../store/task-store";
import { EventBus } from "../events/event-bus";
import { AgentTools } from "../tools/agent-tools";
import { CapabilityBasedRouter } from "../provider/capability-based-router";
import { RoutaOrchestrator } from "./routa-orchestrator";
import { AcpAgentProvider } from "../provider/acp-agent-provider";
import { OrchestratorPhase } from "../pipeline/pipeline-context";
import { StreamChunk } from "../provider/agent-provider";

export interface OrchestrationSession {
  sessionId: string;
  workspaceId: string;
  provider: string;
  status: "idle" | "running" | "completed" | "error";

  // Persistent components (reused across multiple execute() calls)
  agentStore: InMemoryAgentStore;
  conversationStore: InMemoryConversationStore;
  taskStore: InMemoryTaskStore;
  eventBus: EventBus;
  agentTools: AgentTools;
  router: CapabilityBasedRouter;
  orchestrator: RoutaOrchestrator;

  events: Array<{ type: string; data: unknown; timestamp: number }>;
  result?: unknown;
  error?: string;
}

/**
 * Redis client singleton
 */
let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL environment variable is not set");
    }
    console.log("[Redis] Connecting to Redis...");
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisClient.on("connect", () => {
      console.log("[Redis] Connected successfully");
    });

    redisClient.on("error", (err) => {
      console.error("[Redis] Connection error:", err);
    });
  }
  return redisClient;
}

/**
 * Global sessions map (persists across Next.js module reloads)
 */
declare global {
  var __orchestrationSessions: Map<string, OrchestrationSession> | undefined;
}

/**
 * Singleton manager for orchestration sessions.
 * Like Kotlin's IdeaRoutaService, this persists across requests.
 *
 * HYBRID APPROACH:
 * - Uses global object for in-memory session storage (fast access)
 * - Uses Redis for session metadata and cross-instance coordination
 */
class OrchestrationSessionManager {
  private redis: Redis;
  private sessions: Map<string, OrchestrationSession>;
  private readonly SESSION_PREFIX = "routa:session:";
  private readonly SESSION_TTL = 3600 * 24; // 24 hours

  constructor() {
    this.redis = getRedisClient();

    // Use global object to persist across Next.js hot reloads
    if (!global.__orchestrationSessions) {
      console.log("[SessionManager] Creating new global sessions Map");
      global.__orchestrationSessions = new Map();
    } else {
      console.log("[SessionManager] Reusing existing global sessions Map with", global.__orchestrationSessions.size, "sessions");
    }
    this.sessions = global.__orchestrationSessions;
  }

  static getInstance(): OrchestrationSessionManager {
    return new OrchestrationSessionManager();
  }

  /**
   * Create a new orchestration session (like Kotlin's RoutaViewModel.initialize())
   */
  async createSession(
    sessionId: string,
    workspaceId: string,
    provider: string,
    onPhaseChange?: (phase: OrchestratorPhase) => void | Promise<void>,
    onStreamChunk?: (agentId: string, chunk: StreamChunk) => void
  ): Promise<OrchestrationSession> {
    console.log(`[SessionManager] Creating session ${sessionId} with provider ${provider}`);

    // Create stores
    const agentStore = new InMemoryAgentStore();
    const conversationStore = new InMemoryConversationStore();
    const taskStore = new InMemoryTaskStore();
    const eventBus = new EventBus();

    // Create tools
    const agentTools = new AgentTools(
      agentStore,
      conversationStore,
      taskStore,
      eventBus
    );

    // Create provider
    const agentProvider = new AcpAgentProvider({
      presetId: provider,
      cwd: workspaceId,
    });

    // Create router
    const router = new CapabilityBasedRouter([agentProvider]);

    // Create orchestrator
    const orchestrator = new RoutaOrchestrator({
      context: {
        agentStore,
        conversationStore,
        taskStore,
        eventBus,
        agentTools,
        router,
      },
      provider: agentProvider,
      workspaceId,
      parallelCrafters: false,
      onPhaseChange,
      onStreamChunk,
    });

    const session: OrchestrationSession = {
      sessionId,
      workspaceId,
      provider,
      status: "idle",
      agentStore,
      conversationStore,
      taskStore,
      eventBus,
      agentTools,
      router,
      orchestrator,
      events: [],
    };

    // Store in memory (global object)
    this.sessions.set(sessionId, session);

    // Store metadata in Redis for cross-instance coordination
    const sessionKey = this.SESSION_PREFIX + sessionId;
    await this.redis.setex(
      sessionKey,
      this.SESSION_TTL,
      JSON.stringify({
        sessionId,
        workspaceId,
        provider,
        status: session.status,
        createdAt: Date.now(),
      })
    );

    console.log(`[SessionManager] Session ${sessionId} created. In-memory: ${this.sessions.size} sessions, Redis: stored`);

    return session;
  }

  /**
   * Get an existing session
   * First checks in-memory, then falls back to Redis metadata check
   */
  async getSession(sessionId: string): Promise<OrchestrationSession | undefined> {
    // Try in-memory first (fast path)
    const session = this.sessions.get(sessionId);
    if (session) {
      console.log(`[SessionManager] getSession(${sessionId}): found in memory`);
      return session;
    }

    // Check if session exists in Redis (slow path)
    const sessionKey = this.SESSION_PREFIX + sessionId;
    const exists = await this.redis.exists(sessionKey);

    if (exists) {
      console.warn(`[SessionManager] getSession(${sessionId}): exists in Redis but not in memory (possible server restart)`);
      // Session exists in Redis but not in memory - this happens after server restart
      // We can't reconstruct the session, so return undefined
      return undefined;
    }

    console.log(`[SessionManager] getSession(${sessionId}): not found. In-memory: ${this.sessions.size} sessions`);
    return undefined;
  }

  /**
   * Delete a session from both memory and Redis
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    // Delete from memory
    const deleted = this.sessions.delete(sessionId);

    // Delete from Redis
    const sessionKey = this.SESSION_PREFIX + sessionId;
    await this.redis.del(sessionKey);

    console.log(`[SessionManager] deleteSession(${sessionId}): ${deleted}. Remaining in-memory: ${this.sessions.size}`);
    return deleted;
  }

  /**
   * List all session IDs (from memory)
   */
  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * List all session IDs from Redis (for debugging)
   */
  async listSessionsFromRedis(): Promise<string[]> {
    const keys = await this.redis.keys(this.SESSION_PREFIX + "*");
    return keys.map((key) => key.replace(this.SESSION_PREFIX, ""));
  }
}

// Export singleton instance
export const orchestrationSessionManager = OrchestrationSessionManager.getInstance();

