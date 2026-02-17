/**
 * CapabilityBasedRouter - port of routa-core CapabilityBasedRouter.kt
 *
 * Routes agent execution to the best provider based on capabilities.
 *
 * ## Selection Algorithm
 * 1. Filter providers that satisfy the role's requirements
 * 2. Among matching providers, pick the one with highest priority
 * 3. If no provider matches, throw NoSuitableProviderException
 *
 * ## Usage
 * ```typescript
 * const router = new CapabilityBasedRouter(
 *   llmProvider,      // For ROUTA (needs tool calling)
 *   acpProvider,      // For CRAFTER (needs file editing + terminal)
 * );
 *
 * // Automatically selects the right provider
 * await router.run(AgentRole.CRAFTER, crafterId, prompt);
 * ```
 */

import { AgentRole } from "../models/agent";
import {
  AgentProvider,
  ProviderCapabilities,
  ProviderRequirements,
  StreamChunk,
  getRequirements,
  satisfiesRequirements,
} from "./agent-provider";

/**
 * Exception thrown when no suitable provider is found for a role.
 */
export class NoSuitableProviderError extends Error {
  constructor(
    public role: AgentRole,
    public requirements: ProviderRequirements,
    public availableProviders: ProviderCapabilities[]
  ) {
    super(
      `No suitable provider found for role ${role}. ` +
        `Requirements: ${JSON.stringify(requirements)}. ` +
        `Available: ${availableProviders.map((p) => p.name).join(", ")}`
    );
    this.name = "NoSuitableProviderError";
  }
}

/**
 * Routes agent execution to the best provider based on capabilities.
 */
export class CapabilityBasedRouter implements AgentProvider {
  private providers: AgentProvider[] = [];

  constructor(...initialProviders: AgentProvider[]) {
    this.providers = [...initialProviders];
  }

  // ── Provider Management ──────────────────────────────────────────

  /**
   * Register a new provider.
   */
  register(provider: AgentProvider): void {
    this.providers.push(provider);
  }

  /**
   * Unregister a provider by name.
   */
  unregister(name: string): boolean {
    const index = this.providers.findIndex(
      (p) => p.capabilities().name === name
    );
    if (index !== -1) {
      this.providers.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * List all registered providers.
   */
  listProviders(): ProviderCapabilities[] {
    return this.providers.map((p) => p.capabilities());
  }

  // ── Routing ──────────────────────────────────────────────────────

  /**
   * Select the best provider for a given role.
   *
   * @throws NoSuitableProviderError if no provider satisfies the role's requirements
   */
  selectProvider(role: AgentRole): AgentProvider {
    const requirements = getRequirements(role);
    const candidates = this.providers.filter((p) =>
      satisfiesRequirements(p.capabilities(), requirements)
    );

    if (candidates.length === 0) {
      throw new NoSuitableProviderError(
        role,
        requirements,
        this.providers.map((p) => p.capabilities())
      );
    }

    // Pick the provider with the highest priority
    return candidates.reduce((best, current) =>
      current.capabilities().priority > best.capabilities().priority
        ? current
        : best
    );
  }

  // ── AgentProvider Implementation ─────────────────────────────────

  async run(role: AgentRole, agentId: string, prompt: string): Promise<string> {
    return this.selectProvider(role).run(role, agentId, prompt);
  }

  async runStreaming(
    role: AgentRole,
    agentId: string,
    prompt: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<string> {
    return this.selectProvider(role).runStreaming(
      role,
      agentId,
      prompt,
      onChunk
    );
  }

  isHealthy(agentId: string): boolean {
    // Check all providers — agent could be running on any of them
    return this.providers.every((p) => p.isHealthy(agentId));
  }

  async interrupt(agentId: string): Promise<void> {
    // Try to interrupt on all providers
    await Promise.all(this.providers.map((p) => p.interrupt(agentId)));
  }

  capabilities(): ProviderCapabilities {
    // Router itself doesn't have capabilities - it delegates
    return {
      name: "CapabilityBasedRouter",
      supportsStreaming: true,
      supportsInterrupt: true,
      supportsHealthCheck: true,
      supportsFileEditing: true,
      supportsTerminal: true,
      supportsToolCalling: true,
      maxConcurrentAgents: 100,
      priority: 0,
    };
  }

  async cleanup(agentId: string): Promise<void> {
    await Promise.all(this.providers.map((p) => p.cleanup(agentId)));
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.providers.map((p) => p.shutdown()));
  }
}

