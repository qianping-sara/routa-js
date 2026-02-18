# ROUTA Tools Reference

Complete reference for all 15 tools available in the ROUTA multi-agent system.

---

## 📋 Tool Categories

- **Core Coordination Tools** (6) - Multi-agent collaboration
- **Task-Agent Lifecycle Tools** (4) - Task and agent lifecycle management
- **Event Subscription Tools** (2) - Workspace event monitoring
- **File Operation Tools** (3) - Workspace file operations

---

## 🔧 Core Coordination Tools (6)

### 1. `list_agents`

**Description**: List all agents in a workspace.

**Parameters**:
```typescript
{
  workspaceId: string  // Workspace identifier
}
```

**Returns**: Array of agent summaries with ID, name, role, status, parentId.

**Used by**: ROUTA, CRAFTER, GATE

**Example**:
```typescript
const result = await agentTools.listAgents("workspace-123");
// Returns: [{ id: "agent-1", name: "routa-main", role: "ROUTA", status: "ACTIVE", parentId: null }, ...]
```

---

### 2. `read_agent_conversation`

**Description**: Read another agent's conversation history.

**Parameters**:
```typescript
{
  agentId: string           // Agent to read from
  lastN?: number            // Read last N messages (optional)
  startTurn?: number        // Start from turn number (optional)
  endTurn?: number          // End at turn number (optional)
  includeToolCalls?: boolean // Include tool call messages (default: false)
}
```

**Returns**: Conversation history with messages, roles, timestamps.

**Used by**: ROUTA (review work), CRAFTER (check conflicts), GATE (verify implementation)

**Example**:
```typescript
const result = await agentTools.readAgentConversation({
  agentId: "crafter-auth",
  lastN: 10,
  includeToolCalls: true
});
```

---

### 3. `create_agent`

**Description**: Create a new agent with specified role.

**Parameters**:
```typescript
{
  name: string              // Human-readable name (e.g., "crafter-auth-module")
  role: string              // "ROUTA" | "CRAFTER" | "GATE"
  workspaceId: string       // Workspace identifier
  parentId?: string         // Parent agent ID (optional)
  modelTier?: string        // "SMART" | "FAST" (optional, defaults to role's default)
}
```

**Returns**: Created agent with ID, name, role, status.

**Used by**: ROUTA (create CRAFTER/GATE agents)

**Example**:
```typescript
const result = await agentTools.createAgent({
  name: "crafter-login-feature",
  role: "CRAFTER",
  workspaceId: "workspace-123",
  parentId: "routa-main",
  modelTier: "FAST"
});
// Returns: { agentId: "agent-xyz", name: "crafter-login-feature", role: "CRAFTER", status: "PENDING" }
```

---

### 4. `delegate_task`

**Description**: Delegate a task to a specific agent.

**Parameters**:
```typescript
{
  agentId: string           // Agent to delegate to
  taskId: string            // Task to assign (must already exist)
  callerAgentId: string     // Agent performing delegation (for auditing)
}
```

**Returns**: Delegation confirmation with agentId, taskId, status.

**Used by**: ROUTA (assign tasks to CRAFTER agents)

**Example**:
```typescript
const result = await agentTools.delegate({
  agentId: "crafter-auth",
  taskId: "task-login-impl",
  callerAgentId: "routa-main"
});
```

---

### 5. `send_message_to_agent`

**Description**: Send a message to another agent.

**Parameters**:
```typescript
{
  fromAgentId: string       // Sender agent ID
  toAgentId: string         // Recipient agent ID
  message: string           // Message content
}
```

**Returns**: Delivery confirmation.

**Used by**: All agents (inter-agent communication)

**Example**:
```typescript
const result = await agentTools.messageAgent({
  fromAgentId: "gate-verify",
  toAgentId: "crafter-auth",
  message: "Please add error handling for invalid email format in login.ts:42"
});
```

---

### 6. `report_to_parent`

**Description**: Send completion report to parent agent. **REQUIRED** for all delegated agents.

**Parameters**:
```typescript
{
  agentId: string           // Reporting agent ID
  report: {
    taskId: string          // Completed task ID
    summary: string         // What was done (1-3 sentences)
    filesModified?: string[] // List of modified files (optional)
    success: boolean        // Whether task succeeded (default: true)
  }
}
```

**Returns**: Report delivery confirmation.

**Used by**: CRAFTER (completion report), GATE (verification verdict)

**Example**:
```typescript
const result = await agentTools.reportToParent({
  agentId: "crafter-auth",
  report: {
    taskId: "task-login-impl",
    summary: "Implemented login feature with email/password. All tests passing.",
    filesModified: ["src/auth/login.ts", "src/auth/login.test.ts"],
    success: true
  }
});
```

---

## 🔄 Task-Agent Lifecycle Tools (4)

### 7. `wake_or_create_task_agent`

**Description**: Wake existing agent or create new one for a task.

**Parameters**:
```typescript
{
  taskId: string            // Task identifier
  contextMessage: string    // Context/instructions for agent
  callerAgentId: string     // Caller agent ID
  agentName?: string        // Custom agent name (optional)
  modelTier?: string        // "SMART" | "FAST" (optional)
}
```

**Returns**: Agent info with action ("woken" or "created").

**Used by**: ROUTA (when task dependencies become ready)

---

### 8. `send_message_to_task_agent`

**Description**: Send message to the agent working on a task.

**Parameters**:
```typescript
{
  taskId: string            // Task identifier
  message: string           // Message content
  callerAgentId: string     // Caller agent ID
}
```

**Returns**: Delivery confirmation.

**Used by**: ROUTA, GATE (send fix requests)

---

### 9. `get_agent_status`

**Description**: Get detailed status of a specific agent.

**Parameters**:
```typescript
{
  agentId: string           // Agent identifier
}
```

**Returns**: Detailed status including role, status, message count, assigned tasks, timestamps.

**Used by**: ROUTA (check agent progress)

---

### 10. `get_agent_summary`

**Description**: Get summary of what an agent did.

**Parameters**:
```typescript
{
  agentId: string           // Agent identifier
}
```

**Returns**: Summary with status, last response, tool call counts, active tasks.

**Used by**: ROUTA (quick overview before reading full conversation)

---

## 📡 Event Subscription Tools (2)

### 11. `subscribe_to_events`

**Description**: Subscribe to workspace events.

**Parameters**:
```typescript
{
  agentId: string           // Subscriber agent ID
  agentName: string         // Subscriber agent name
  eventTypes: string[]      // Event types to subscribe to
  excludeSelf?: boolean     // Exclude own events (default: true)
}
```

**Event Types**:
- `"agent:*"` - All agent events
- `"agent:created"` - Agent creation
- `"agent:completed"` - Agent completion
- `"agent:status_changed"` - Agent status change
- `"agent:message"` - Agent message
- `"task:*"` - All task events
- `"task:status_changed"` - Task status change
- `"task:delegated"` - Task delegation
- `"*"` - All events

**Returns**: Subscription ID and subscribed event types.

**Used by**: ROUTA (monitor workspace activity)

---

### 12. `unsubscribe_from_events`

**Description**: Unsubscribe from workspace events.

**Parameters**:
```typescript
{
  subscriptionId: string    // Subscription ID from subscribe_to_events
}
```

**Returns**: Unsubscription confirmation.

**Used by**: Any agent that subscribed to events

---

## 📁 File Operation Tools (3)

### 13. `read_file`

**Description**: Read file contents from workspace.

**Parameters**:
```typescript
{
  path: string              // Relative path from workspace root (e.g., 'src/App.tsx')
}
```

**Returns**: File contents as string.

**Used by**: All agents (ROUTA for exploration, CRAFTER for implementation, GATE for verification)

**Example**:
```typescript
const result = await agentTools.readFile({ path: "src/auth/login.ts" });
```

---

### 14. `list_files`

**Description**: List files and directories in workspace.

**Parameters**:
```typescript
{
  path?: string             // Relative path from workspace root (default: ".")
}
```

**Returns**: Array of entries with name and type (file/directory).

**Used by**: All agents (explore workspace structure)

**Example**:
```typescript
const result = await agentTools.listFiles({ path: "src" });
// Returns: [{ name: "auth", type: "directory" }, { name: "App.tsx", type: "file" }, ...]
```

---

### 15. `write_file`

**Description**: Write/create file in workspace.

**Parameters**:
```typescript
{
  path: string              // Relative path from workspace root
  content: string           // File content to write
}
```

**Returns**: Success confirmation with file path and size.

**Used by**: **CRAFTER ONLY** (ROUTA and GATE cannot write files)

**Example**:
```typescript
const result = await agentTools.writeFile({
  path: "src/auth/login.ts",
  content: "export function login(email: string, password: string) { ... }"
});
```

---

## 🎯 Tool Availability by Role

| Tool | ROUTA | CRAFTER | GATE |
|------|-------|---------|------|
| `list_agents` | ✅ | ✅ | ✅ |
| `read_agent_conversation` | ✅ | ✅ | ✅ |
| `create_agent` | ✅ | ❌ | ❌ |
| `delegate_task` | ✅ | ❌ | ❌ |
| `send_message_to_agent` | ✅ | ✅ | ✅ |
| `report_to_parent` | ❌ | ✅ (REQUIRED) | ✅ (REQUIRED) |
| `wake_or_create_task_agent` | ✅ | ❌ | ❌ |
| `send_message_to_task_agent` | ✅ | ❌ | ✅ |
| `get_agent_status` | ✅ | ❌ | ❌ |
| `get_agent_summary` | ✅ | ❌ | ❌ |
| `subscribe_to_events` | ✅ | ❌ | ❌ |
| `unsubscribe_from_events` | ✅ | ❌ | ❌ |
| `read_file` | ✅ | ✅ | ✅ |
| `list_files` | ✅ | ✅ | ✅ |
| `write_file` | ❌ | ✅ | ❌ |

---

## 💡 Best Practices

### For ROUTA (Coordinator)
- ✅ Use `list_agents` to track active agents
- ✅ Use `read_agent_conversation` to review work
- ✅ Use `create_agent` + `delegate_task` to assign work
- ✅ Use `read_file`/`list_files` to explore codebase
- ❌ **NEVER** use `write_file` - delegate to CRAFTER

### For CRAFTER (Implementor)
- ✅ Use `read_file`/`write_file`/`list_files` for implementation
- ✅ Use `list_agents` + `read_agent_conversation` to avoid conflicts
- ✅ **ALWAYS** call `report_to_parent` when done
- ⚠️ Use `send_message_to_agent` only if blocked

### For GATE (Verifier)
- ✅ Use `read_file`/`list_files` to verify implementation
- ✅ Use `read_agent_conversation` to review CRAFTER's work
- ✅ Use `send_message_to_task_agent` to request fixes
- ✅ **ALWAYS** call `report_to_parent` with verdict
- ❌ **NEVER** use `write_file` - request fixes instead

