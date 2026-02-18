# Prompt Injection Configuration

## Overview

routa-js now supports **two modes** for ROUTA agent prompt handling, matching the Kotlin implementation:

1. **Enhanced Mode** (default): Injects full `RouteDefinitions.ROUTA.systemPrompt`
2. **Minimal Mode**: Uses basic prompt, relies on provider's built-in role handling

This is controlled by the `useEnhancedRoutaPrompt` configuration option.

---

## Configuration Options

### Mode 1: Enhanced Prompt (Recommended for ACP Agents)

**When to use:**
- Using ACP agents (opencode, claude-code, etc.)
- Want full ROUTA behavioral rules and workflow
- Need consistent behavior across different providers

**How it works:**
- Injects complete `RouteDefinitions.ROUTA.systemPrompt` before user request
- Includes Hard Rules, Task Block Format, Workflow, and Available Tools
- Similar to Kotlin's `RoutaViewModel.buildRoutaEnhancedPrompt()`

**Configuration:**
```typescript
const orchestrator = new RoutaOrchestrator({
  context,
  provider,
  workspaceId,
  useEnhancedRoutaPrompt: true, // ← Default
});
```

**Or via OrchestrationSessionManager:**
```typescript
await sessionManager.createSession(
  sessionId,
  workspaceId,
  "opencode",
  onPhaseChange,
  onStreamChunk,
  true // ← useEnhancedRoutaPrompt
);
```

---

### Mode 2: Minimal Prompt

**When to use:**
- Provider has strong built-in role understanding
- Want to rely on provider's native planning capabilities
- Testing or debugging

**Configuration:**
```typescript
const orchestrator = new RoutaOrchestrator({
  context,
  provider,
  workspaceId,
  useEnhancedRoutaPrompt: false,
});
```

---

## How It Works

### Enhanced Mode Flow

```
User Request: "Add login feature"
  ↓
PlanningStage.buildPlanPrompt(userRequest)
  ↓
Injects RouteDefinitions.ROUTA.systemPrompt:
  "## Routa (Coordinator)
   You plan, delegate, and verify...
   ## Hard Rules (CRITICAL)
   1. NEVER edit code...
   ..."
  ↓
AcpAgentProvider.runStreaming()
  ↓
session/set_mode → "plan" (read-only)
  ↓
opencode receives:
  "# ROUTA Coordinator Instructions
   [full system prompt]
   ---
   # User Request
   Add login feature"
```

### Minimal Mode Flow

```
User Request: "Add login feature"
  ↓
PlanningStage.buildPlanPrompt(userRequest)
  ↓
Basic prompt:
  "You are ROUTA, the planning coordinator...
   Your role is to:
   1. Analyze the user's request
   2. Break it down into tasks
   3. Output @@@task blocks"
  ↓
opencode receives minimal prompt
```

---

## API Reference

### RoutaOrchestrator

```typescript
interface OrchestratorConfig {
  useEnhancedRoutaPrompt?: boolean; // Default: true
  // ... other options
}
```

### OrchestrationSessionManager

```typescript
async createSession(
  sessionId: string,
  workspaceId: string,
  provider: string,
  onPhaseChange?: (phase: OrchestratorPhase) => void,
  onStreamChunk?: (agentId: string, chunk: StreamChunk) => void,
  useEnhancedRoutaPrompt: boolean = true // ← New parameter
): Promise<OrchestrationSession>
```

### PlanningStage

```typescript
class PlanningStage {
  useEnhancedPrompt: boolean = true; // Can be set directly
}
```

---

## Comparison with Kotlin Implementation

| Feature | Kotlin (routa-core) | TypeScript (routa-js) |
|---------|---------------------|----------------------|
| **Enhanced prompt injection** | ✅ `RoutaViewModel.useEnhancedRoutaPrompt` | ✅ `OrchestratorConfig.useEnhancedRoutaPrompt` |
| **RouteDefinitions** | ✅ `RouteDefinitions.kt` | ✅ `route-definitions.ts` |
| **Default behavior** | ✅ Enhanced for ACP, minimal for Koog | ✅ Enhanced by default |
| **Configuration location** | `IdeaRoutaService.initialize()` | `OrchestrationSessionManager.createSession()` |

---

## Migration Guide

### Before (Simple Prompt)

```typescript
// Old: Only basic prompt
const orchestrator = new RoutaOrchestrator({
  context,
  provider,
  workspaceId,
});
```

### After (Enhanced Prompt - Default)

```typescript
// New: Full ROUTA instructions injected by default
const orchestrator = new RoutaOrchestrator({
  context,
  provider,
  workspaceId,
  // useEnhancedRoutaPrompt: true is the default
});
```

### Opt-out (Minimal Prompt)

```typescript
// Explicitly disable enhanced prompt
const orchestrator = new RoutaOrchestrator({
  context,
  provider,
  workspaceId,
  useEnhancedRoutaPrompt: false,
});
```

---

## Recommendations

✅ **Use Enhanced Mode when:**
- Working with ACP agents (opencode, claude-code)
- Need strict adherence to ROUTA workflow
- Want consistent multi-agent behavior

❌ **Use Minimal Mode when:**
- Provider has strong native planning
- Debugging prompt issues
- Custom provider with own role system

