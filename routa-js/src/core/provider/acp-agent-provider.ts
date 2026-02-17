/**
 * AcpAgentProvider - port of routa-core AcpAgentProvider.kt
 *
 * ACP-based agent provider for CRAFTER and GATE roles.
 * Connects to ACP agents like opencode, codex, etc.
 *
 * This implementation:
 * - Connects to existing AcpProcessManager
 * - Creates separate sessions for each agent
 * - Uses session/set_mode to switch between 'plan' and 'build' modes
 * - Handles streaming via session/update notifications
 */

import { AgentRole } from "../models/agent";
import {
  AgentProvider,
  ProviderCapabilities,
  StreamChunk,
} from "./agent-provider";
import { AcpProcessManager } from "../acp/acp-process-manager";
import { JsonRpcMessage } from "../acp/processer";

/**
 * Configuration for ACP agent
 */
export interface AcpAgentConfig {
  /** Preset ID (e.g., "opencode", "codex") */
  presetId: string;

  /** Working directory */
  cwd: string;

  /** Environment variables */
  env?: Record<string, string>;

  /** Extra command-line arguments */
  extraArgs?: string[];
}

/**
 * Managed session info
 */
interface ManagedSession {
  /** Our internal session ID */
  sessionId: string;
  /** ACP session ID from the agent */
  acpSessionId: string;
  /** Agent role */
  role: AgentRole;
  /** Current mode (plan or build) */
  mode: string;
  /** Accumulated output */
  output: string;
  /** Creation timestamp */
  createdAt: Date;
}

/**
 * ACP-based agent provider.
 *
 * Connects to the existing AcpProcessManager and creates sessions
 * with appropriate modes based on agent role:
 * - ROUTA (planner) → 'plan' mode (read-only, no file editing)
 * - CRAFTER (implementer) → 'build' mode (full tools)
 * - GATE (reviewer) → 'plan' mode (read-only verification)
 */
export class AcpAgentProvider implements AgentProvider {
  private config: AcpAgentConfig;
  private processManager: AcpProcessManager;
  private activeSessions = new Map<string, ManagedSession>();

  constructor(config: AcpAgentConfig, processManager?: AcpProcessManager) {
    this.config = config;
    this.processManager = processManager ?? new AcpProcessManager();
  }

  async run(role: AgentRole, agentId: string, prompt: string): Promise<string> {
    return this.runStreaming(role, agentId, prompt, () => {});
  }

  async runStreaming(
    role: AgentRole,
    agentId: string,
    prompt: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<string> {
    try {
      // Determine the mode based on role
      const mode = this.getModeForRole(role);

      // Accumulated output
      let output = "";

      // Create notification handler for streaming
      const onNotification = (msg: JsonRpcMessage) => {
        if (msg.method === "session/update") {
          const params = msg.params as any;
          const update = params.update || params;
          const sessionUpdate = update.sessionUpdate;

          // Handle different update types (matching Kotlin's processSessionUpdateWithEvents)
          if (sessionUpdate === "agent_message_chunk") {
            // Extract text from content block
            const content = update.content;
            let text = "";
            if (content && content.type === "text") {
              text = content.text || "";
            }
            output += text;
            onChunk({ type: "text", content: text });
          } else if (sessionUpdate === "agent_thought_chunk") {
            // Extract thought text from content block
            const content = update.content;
            let thought = "";
            if (content && content.type === "text") {
              thought = content.text || "";
            }
            // Send as thinking chunk (not accumulated in output)
            onChunk({ type: "thinking", content: thought });
          } else if (sessionUpdate === "tool_call_update") {
            // Handle tool call updates
            const toolName = update.title || "tool";
            const rawInput = update.rawInput ? JSON.stringify(update.rawInput) : "";
            const rawOutput = update.rawOutput ? JSON.stringify(update.rawOutput) : "";

            // Send tool call start
            if (update.status?.toString().toLowerCase().includes("start")) {
              onChunk({ type: "tool_call", name: toolName, args: {} });
            }
            // Send tool result when completed
            else if (update.status?.toString().toLowerCase().includes("complet")) {
              onChunk({ type: "tool_result", name: toolName, result: rawOutput || "completed" });
            }
          } else if (params.type === "error") {
            onChunk({ type: "error", message: params.error || "Unknown error" });
          }
        }
      };

      // Create session with ACP process manager
      const acpSessionId = await this.processManager.createSession(
        agentId,
        this.config.cwd,
        onNotification,
        this.config.presetId,
        this.config.extraArgs,
        this.config.env
      );

      // Get the managed process
      const managed = this.processManager.getManagedProcess(agentId);
      if (!managed) {
        throw new Error(`Failed to get managed process for agent ${agentId}`);
      }

      // Set the appropriate mode using session/set_mode
      console.log(`[AcpAgentProvider] Setting mode to '${mode}' for ${role} (agent: ${agentId})`);
      await managed.process.sendRequest("session/set_mode", {
        sessionId: acpSessionId,
        modeId: mode,
      });

      // Store session info
      this.activeSessions.set(agentId, {
        sessionId: agentId,
        acpSessionId,
        role,
        mode,
        output: "",
        createdAt: new Date(),
      });

      // Send the prompt
      console.log(`[AcpAgentProvider] Sending prompt to ${role} (agent: ${agentId})`);
      const result = await managed.process.prompt(acpSessionId, prompt);

      // Update session output
      const session = this.activeSessions.get(agentId);
      if (session) {
        session.output = output;
      }

      console.log(`[AcpAgentProvider] ${role} completed with stopReason: ${result.stopReason}`);
      return output || result.stopReason;
    } catch (error) {
      console.error(`[AcpAgentProvider] Error running ${role}:`, error);
      throw error;
    }
  }

  isHealthy(agentId: string): boolean {
    const managed = this.processManager.getManagedProcess(agentId);
    return managed?.process.alive ?? false;
  }

  async interrupt(agentId: string): Promise<void> {
    const session = this.activeSessions.get(agentId);
    if (!session) {
      return;
    }

    const managed = this.processManager.getManagedProcess(agentId);
    if (managed) {
      await managed.process.cancel(session.acpSessionId);
    }
  }

  capabilities(): ProviderCapabilities {
    return {
      name: `ACP (${this.config.presetId})`,
      supportsStreaming: true,
      supportsInterrupt: true,
      supportsHealthCheck: true,
      supportsFileEditing: true,
      supportsTerminal: true,
      supportsToolCalling: false, // ACP agents handle tools internally
      maxConcurrentAgents: 5,
      priority: 10, // Higher priority for implementation tasks
    };
  }

  async cleanup(agentId: string): Promise<void> {
    await this.interrupt(agentId);
    this.processManager.killSession(agentId);
    this.activeSessions.delete(agentId);
  }

  async shutdown(): Promise<void> {
    const agents = Array.from(this.activeSessions.keys());
    await Promise.all(agents.map((id) => this.cleanup(id)));
  }

  /**
   * Determine the opencode agent mode based on the role.
   *
   * - ROUTA (planner): 'plan' mode - read-only, no file editing
   * - CRAFTER (implementer): 'build' mode - full tools enabled
   * - GATE (reviewer): 'plan' mode - read-only verification
   */
  private getModeForRole(role: AgentRole): string {
    switch (role) {
      case AgentRole.ROUTA:
        return "plan"; // Read-only planning mode
      case AgentRole.CRAFTER:
        return "build"; // Full implementation mode
      case AgentRole.GATE:
        return "plan"; // Read-only verification mode
      default:
        return "build"; // Default to build mode
    }
  }
}

