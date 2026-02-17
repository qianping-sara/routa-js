/**
 * CapabilityBasedRouter tests - port of routa-core CapabilityBasedRouterTest.kt
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  CapabilityBasedRouter,
  NoSuitableProviderError,
} from "../capability-based-router";
import { AgentRole } from "../../models/agent";
import {
  AgentProvider,
  ProviderCapabilities,
  StreamChunk,
} from "../agent-provider";

// ── Mock Providers ───────────────────────────────────────────────

class MockLlmProvider implements AgentProvider {
  runLog: Array<[AgentRole, string, string]> = [];

  async run(role: AgentRole, agentId: string, prompt: string): Promise<string> {
    this.runLog.push([role, agentId, prompt]);
    return `LLM response for ${role}`;
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
      name: "MockLLM",
      supportsStreaming: true,
      supportsInterrupt: false,
      supportsHealthCheck: true,
      supportsFileEditing: false,
      supportsTerminal: false,
      supportsToolCalling: true, // LLM supports tool calling
      maxConcurrentAgents: 10,
      priority: 5,
    };
  }

  async cleanup(agentId: string): Promise<void> {}
  async shutdown(): Promise<void> {}
}

class MockAcpProvider implements AgentProvider {
  runLog: Array<[AgentRole, string, string]> = [];

  async run(role: AgentRole, agentId: string, prompt: string): Promise<string> {
    this.runLog.push([role, agentId, prompt]);
    return `ACP response for ${role}`;
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
      name: "MockACP",
      supportsStreaming: true,
      supportsInterrupt: true,
      supportsHealthCheck: true,
      supportsFileEditing: true,
      supportsTerminal: true,
      supportsToolCalling: false, // ACP handles tools internally
      maxConcurrentAgents: 5,
      priority: 10, // Higher priority
    };
  }

  async cleanup(agentId: string): Promise<void> {}
  async shutdown(): Promise<void> {}
}

// ── Tests ────────────────────────────────────────────────────────

describe("CapabilityBasedRouter", () => {
  it("should select LLM provider for ROUTA (needs tool calling)", () => {
    const llm = new MockLlmProvider();
    const acp = new MockAcpProvider();
    const router = new CapabilityBasedRouter(llm, acp);

    const selected = router.selectProvider(AgentRole.ROUTA);
    expect(selected.capabilities().name).toBe("MockLLM");
  });

  it("should select ACP provider for CRAFTER (needs file editing + terminal)", () => {
    const llm = new MockLlmProvider();
    const acp = new MockAcpProvider();
    const router = new CapabilityBasedRouter(llm, acp);

    const selected = router.selectProvider(AgentRole.CRAFTER);
    expect(selected.capabilities().name).toBe("MockACP");
  });

  it("should select ACP provider for GATE (needs terminal)", () => {
    const llm = new MockLlmProvider();
    const acp = new MockAcpProvider();
    const router = new CapabilityBasedRouter(llm, acp);

    const selected = router.selectProvider(AgentRole.GATE);
    expect(selected.capabilities().name).toBe("MockACP");
  });

  it("should route to correct provider per role", async () => {
    const llm = new MockLlmProvider();
    const acp = new MockAcpProvider();
    const router = new CapabilityBasedRouter(llm, acp);

    await router.run(AgentRole.ROUTA, "routa-1", "plan");
    await router.run(AgentRole.CRAFTER, "crafter-1", "implement");
    await router.run(AgentRole.GATE, "gate-1", "verify");

    expect(llm.runLog).toHaveLength(1);
    expect(llm.runLog[0][0]).toBe(AgentRole.ROUTA);

    expect(acp.runLog).toHaveLength(2);
    expect(acp.runLog[0][0]).toBe(AgentRole.CRAFTER);
    expect(acp.runLog[1][0]).toBe(AgentRole.GATE);
  });

  it("should throw NoSuitableProviderError when no provider matches", () => {
    const llm = new MockLlmProvider();
    const router = new CapabilityBasedRouter(llm);

    // LLM can't handle CRAFTER (needs file editing)
    expect(() => router.selectProvider(AgentRole.CRAFTER)).toThrow(
      NoSuitableProviderError
    );
  });

  it("should register new providers", () => {
    const router = new CapabilityBasedRouter();
    expect(router.listProviders()).toHaveLength(0);

    const llm = new MockLlmProvider();
    router.register(llm);
    expect(router.listProviders()).toHaveLength(1);
    expect(router.listProviders()[0].name).toBe("MockLLM");
  });

  it("should unregister providers by name", () => {
    const llm = new MockLlmProvider();
    const acp = new MockAcpProvider();
    const router = new CapabilityBasedRouter(llm, acp);

    expect(router.listProviders()).toHaveLength(2);

    const removed = router.unregister("MockLLM");
    expect(removed).toBe(true);
    expect(router.listProviders()).toHaveLength(1);
    expect(router.listProviders()[0].name).toBe("MockACP");
  });

  it("should select provider with highest priority when multiple match", () => {
    // Create a low-priority ACP provider
    class LowPriorityAcp extends MockAcpProvider {
      capabilities(): ProviderCapabilities {
        return { ...super.capabilities(), priority: 3 };
      }
    }

    const lowAcp = new LowPriorityAcp();
    const highAcp = new MockAcpProvider(); // priority 10
    const router = new CapabilityBasedRouter(lowAcp, highAcp);

    const selected = router.selectProvider(AgentRole.CRAFTER);
    expect(selected.capabilities().priority).toBe(10);
  });

  it("should support streaming", async () => {
    const llm = new MockLlmProvider();
    const router = new CapabilityBasedRouter(llm);

    const chunks: StreamChunk[] = [];
    const result = await router.runStreaming(
      AgentRole.ROUTA,
      "routa-1",
      "plan",
      (chunk) => chunks.push(chunk)
    );

    expect(result).toContain("LLM response");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].type).toBe("text");
  });
});

