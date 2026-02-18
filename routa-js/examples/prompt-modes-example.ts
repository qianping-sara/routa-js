/**
 * Example: Using Enhanced vs Minimal Prompt Modes
 * 
 * This example demonstrates the two prompt injection modes:
 * 1. Enhanced Mode (default) - Full ROUTA system prompt
 * 2. Minimal Mode - Basic prompt for providers with built-in role handling
 */

import { RoutaOrchestrator } from "../src/core/orchestrator/routa-orchestrator";
import { createInMemorySystem } from "../src/core/routa-system";
import { AcpAgentProvider } from "../src/core/provider/acp-agent-provider";

async function exampleEnhancedMode() {
  console.log("=== Example 1: Enhanced Mode (Default) ===\n");

  const system = createInMemorySystem();
  const provider = new AcpAgentProvider({
    presetId: "opencode",
    cwd: process.cwd(),
  });

  // Enhanced mode: Injects full RouteDefinitions.ROUTA.systemPrompt
  const orchestrator = new RoutaOrchestrator({
    context: {
      agentStore: system.agentStore,
      conversationStore: system.conversationStore,
      taskStore: system.taskStore,
      eventBus: system.eventBus,
      agentTools: system.tools,
    },
    provider,
    workspaceId: process.cwd(),
    useEnhancedRoutaPrompt: true, // ← Explicit (this is the default)
    onPhaseChange: async (phase) => {
      console.log(`[Phase] ${phase.type}`);
    },
  });

  const result = await orchestrator.execute(
    "Add a login feature with email and password"
  );

  console.log("\nResult:", result);
  console.log("\n✅ Enhanced mode provides full ROUTA behavioral rules\n");
}

async function exampleMinimalMode() {
  console.log("=== Example 2: Minimal Mode ===\n");

  const system = createInMemorySystem();
  const provider = new AcpAgentProvider({
    presetId: "opencode",
    cwd: process.cwd(),
  });

  // Minimal mode: Basic prompt, relies on provider's role handling
  const orchestrator = new RoutaOrchestrator({
    context: {
      agentStore: system.agentStore,
      conversationStore: system.conversationStore,
      taskStore: system.taskStore,
      eventBus: system.eventBus,
      agentTools: system.tools,
    },
    provider,
    workspaceId: process.cwd(),
    useEnhancedRoutaPrompt: false, // ← Minimal mode
    onPhaseChange: async (phase) => {
      console.log(`[Phase] ${phase.type}`);
    },
  });

  const result = await orchestrator.execute(
    "Add a login feature with email and password"
  );

  console.log("\nResult:", result);
  console.log("\n✅ Minimal mode uses basic prompt\n");
}

async function exampleViaSessionManager() {
  console.log("=== Example 3: Via OrchestrationSessionManager ===\n");

  const { OrchestrationSessionManager } = await import(
    "../src/core/orchestrator/orchestration-session-manager"
  );

  const sessionManager = OrchestrationSessionManager.getInstance();

  // Create session with enhanced prompt (default)
  const session1 = await sessionManager.createSession(
    "session-enhanced",
    process.cwd(),
    "opencode",
    async (phase) => console.log(`[Enhanced] ${phase.type}`),
    undefined,
    true // ← Enhanced mode
  );

  console.log("✅ Session created with enhanced prompt");

  // Create session with minimal prompt
  const session2 = await sessionManager.createSession(
    "session-minimal",
    process.cwd(),
    "opencode",
    async (phase) => console.log(`[Minimal] ${phase.type}`),
    undefined,
    false // ← Minimal mode
  );

  console.log("✅ Session created with minimal prompt\n");
}

async function exampleDirectPipelineConfiguration() {
  console.log("=== Example 4: Direct Pipeline Configuration ===\n");

  const { OrchestrationPipeline } = await import(
    "../src/core/orchestrator/orchestration-pipeline"
  );
  const { PlanningStage } = await import(
    "../src/core/pipeline/stages/planning-stage"
  );

  // Create custom pipeline with explicit prompt mode
  const planningStage = new PlanningStage();
  planningStage.useEnhancedPrompt = true; // ← Set directly on stage

  console.log("✅ PlanningStage configured with enhanced prompt");
  console.log("   This gives fine-grained control over prompt injection\n");
}

// Run examples
async function main() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║  Routa-JS Prompt Injection Modes Examples             ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  try {
    await exampleEnhancedMode();
    await exampleMinimalMode();
    await exampleViaSessionManager();
    await exampleDirectPipelineConfiguration();

    console.log("╔════════════════════════════════════════════════════════╗");
    console.log("║  All examples completed successfully!                 ║");
    console.log("╚════════════════════════════════════════════════════════╝");
  } catch (error) {
    console.error("Error running examples:", error);
  }
}

if (require.main === module) {
  main();
}

