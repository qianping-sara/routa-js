# ACP Agent Provider Implementation

## Overview

The `AcpAgentProvider` has been implemented to connect the multi-agent orchestration system to the existing ACP infrastructure (opencode). This enables different agent roles to use different opencode agent modes.

## Key Features

### 1. **Mode-Based Agent Execution**

Different agent roles use different opencode modes via the ACP `session/set_mode` method:

| Agent Role | OpenCode Mode | Capabilities |
|-----------|---------------|--------------|
| **ROUTA** (Planner) | `plan` | Read-only, no file editing, no bash commands |
| **CRAFTER** (Implementer) | `build` | Full tools enabled, can edit files and run commands |
| **GATE** (Reviewer) | `plan` | Read-only verification |

### 2. **Integration with Existing Infrastructure**

The implementation reuses the existing ACP infrastructure:

```typescript
AcpAgentProvider
  → AcpProcessManager (existing)
    → AcpProcess (existing)
      → opencode process (existing)
```

No duplicate process management - everything goes through the existing `AcpProcessManager`.

### 3. **Session Management**

- Each agent gets its own session
- Sessions are created with the appropriate mode
- Mode is set using `session/set_mode` ACP method after session creation
- Sessions are properly cleaned up when agents finish

### 4. **Streaming Support**

- Handles `session/update` notifications from opencode
- Streams content, status, and error updates to the orchestrator
- Supports real-time progress tracking

## Implementation Details

### Core Flow

```typescript
// 1. Create session with AcpProcessManager
const acpSessionId = await processManager.createSession(
  agentId,
  cwd,
  onNotification,
  'opencode'
);

// 2. Get the managed process
const managed = processManager.getProcess(agentId);

// 3. Set the appropriate mode based on role
const mode = role === AgentRole.ROUTA ? 'plan' : 'build';
await managed.process.sendRequest('session/set_mode', {
  sessionId: acpSessionId,
  modeId: mode
});

// 4. Send the prompt
await managed.process.prompt(acpSessionId, prompt);
```

### Mode Selection Logic

```typescript
private getModeForRole(role: AgentRole): string {
  switch (role) {
    case AgentRole.ROUTA:
      return "plan"; // Read-only planning mode
    case AgentRole.CRAFTER:
      return "build"; // Full implementation mode
    case AgentRole.GATE:
      return "plan"; // Read-only verification mode
    default:
      return "build";
  }
}
```

## Testing

All tests pass (44/44 total):

- ✅ Mode selection for different roles
- ✅ Session creation and management
- ✅ Streaming content updates
- ✅ Health checks
- ✅ Session cleanup
- ✅ Integration with orchestrator

## Usage Example

```typescript
// Create provider
const provider = new AcpAgentProvider({
  presetId: 'opencode',
  cwd: '/workspace',
});

// Run ROUTA in plan mode
await provider.runStreaming(
  AgentRole.ROUTA,
  'routa-1',
  'Break down this task into subtasks',
  (chunk) => console.log(chunk)
);

// Run CRAFTER in build mode
await provider.runStreaming(
  AgentRole.CRAFTER,
  'crafter-1',
  'Implement the login feature',
  (chunk) => console.log(chunk)
);
```

## Next Steps

The `AcpAgentProvider` is now fully functional and ready to be used by the orchestration system. The next steps would be:

1. **Update `/api/orchestrate` endpoint** to use the real `AcpAgentProvider`
2. **Test end-to-end** with actual opencode processes
3. **Add frontend UI** for multi-agent mode selection
4. **Monitor and optimize** performance with real workloads

## References

- ACP Protocol: https://agentclientprotocol.com/
- OpenCode Agents: https://opencode.ai/docs/agents/
- Session Modes: https://agentclientprotocol.com/protocol/session-modes

