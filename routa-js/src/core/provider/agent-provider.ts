/**
 * AgentProvider - port of routa-core AgentProvider.kt
 *
 * Base interface for all agent execution providers.
 * Providers can be LLM-based, ACP-based, or any other implementation.
 */

import { AgentRole } from "../models/agent";

/**
 * Stream chunk types for real-time output
 */
export type StreamChunk =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "error"; message: string };

/**
 * Base interface for agent execution providers
 */
export interface AgentProvider {
  /**
   * Execute an agent with the given prompt (blocking).
   *
   * @param role The agent's role
   * @param agentId The agent's unique ID
   * @param prompt The prompt/instruction to execute
   * @returns The agent's final output
   */
  run(role: AgentRole, agentId: string, prompt: string): Promise<string>;

  /**
   * Execute an agent with streaming output.
   *
   * @param role The agent's role
   * @param agentId The agent's unique ID
   * @param prompt The prompt/instruction to execute
   * @param onChunk Callback for each output chunk
   * @returns The agent's final output
   */
  runStreaming(
    role: AgentRole,
    agentId: string,
    prompt: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<string>;

  /**
   * Check if an agent is healthy/running.
   *
   * @param agentId The agent's ID
   * @returns True if the agent is healthy
   */
  isHealthy(agentId: string): boolean;

  /**
   * Interrupt a running agent.
   *
   * @param agentId The agent's ID
   */
  interrupt(agentId: string): Promise<void>;

  /**
   * Declare what this provider can do.
   *
   * Used by CapabilityBasedRouter to select the best provider for a role.
   */
  capabilities(): ProviderCapabilities;

  /**
   * Clean up resources for a specific agent.
   *
   * @param agentId The agent's ID
   */
  cleanup(agentId: string): Promise<void>;

  /**
   * Clean up all resources managed by this provider.
   */
  shutdown(): Promise<void>;
}

/**
 * Declares what a provider can do.
 *
 * Modeled after Intent's resolveProviderCapabilities() pattern.
 */
export interface ProviderCapabilities {
  /** Human-readable provider name */
  name: string;

  /** Whether the provider supports streaming output */
  supportsStreaming: boolean;

  /** Whether the provider supports interrupt */
  supportsInterrupt: boolean;

  /** Whether isHealthy returns meaningful results */
  supportsHealthCheck: boolean;

  /** Whether the provider can edit files */
  supportsFileEditing: boolean;

  /** Whether the provider can run terminal commands */
  supportsTerminal: boolean;

  /** Whether the provider supports tool calling (for LLMs) */
  supportsToolCalling: boolean;

  /** Maximum concurrent agents this provider can handle */
  maxConcurrentAgents: number;

  /** Selection priority - higher wins when multiple providers match */
  priority: number;
}

/**
 * Requirements that a provider must satisfy for a given role.
 */
export interface ProviderRequirements {
  needsFileEditing?: boolean;
  needsTerminal?: boolean;
  needsToolCalling?: boolean;
  needsStreaming?: boolean;
}

/**
 * Get default provider requirements for a role.
 */
export function getRequirements(role: AgentRole): ProviderRequirements {
  switch (role) {
    case AgentRole.ROUTA:
      return {
        needsToolCalling: true, // Needs to call create_agent, delegate, etc.
      };
    case AgentRole.CRAFTER:
      return {
        needsFileEditing: true,
        needsTerminal: true,
      };
    case AgentRole.GATE:
      return {
        needsTerminal: true, // Needs to run verification commands
      };
    default:
      return {};
  }
}

/**
 * Check if capabilities satisfy requirements.
 */
export function satisfiesRequirements(
  capabilities: ProviderCapabilities,
  requirements: ProviderRequirements
): boolean {
  if (requirements.needsFileEditing && !capabilities.supportsFileEditing) {
    return false;
  }
  if (requirements.needsTerminal && !capabilities.supportsTerminal) {
    return false;
  }
  if (requirements.needsToolCalling && !capabilities.supportsToolCalling) {
    return false;
  }
  if (requirements.needsStreaming && !capabilities.supportsStreaming) {
    return false;
  }
  return true;
}

