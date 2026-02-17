# Routa JS - Multi-Agent Coordinator (Browser + Server)

TypeScript/Next.js implementation of the Routa multi-agent coordination system with MCP + ACP + A2A protocol support.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React)                                            │
│  ├─ ChatPanel      → ACP JSON-RPC → /api/acp               │
│  ├─ AgentPanel     → REST         → /api/agents             │
│  ├─ SkillPanel     → REST         → /api/skills             │
│  └─ BrowserAcpClient + SkillClient (SSE + HTTP)             │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP
┌──────────────────────▼──────────────────────────────────────┐
│  Next.js Server                                             │
│  ├─ /api/mcp    → MCP Server (SSE + JSON-RPC)               │
│  │   └─ RoutaMcpServer → RoutaMcpToolManager → AgentTools   │
│  ├─ /api/acp    → ACP Agent (JSON-RPC + SSE streaming)      │
│  │   └─ RoutaAcpAgent → AgentTools + SkillRegistry          │
│  ├─ /api/agents → REST API for agent management             │
│  └─ /api/skills → REST API for skill discovery              │
│                                                             │
│  Core Layer:                                                │
│  ├─ AgentTools (12 coordination tools)                      │
│  ├─ RoutaSystem (stores + event bus)                        │
│  ├─ SkillRegistry (SKILL.md discovery)                      │
│  └─ Models (Agent, Task, Message)                           │
└─────────────────────────────────────────────────────────────┘
          │                         │
          │ MCP (SSE/WS)            │ ACP (stdio/JSON-RPC)
          ▼                         ▼
   Claude Code / MCP         OpenCode / Codex
   Inspector / etc.          / external agents
```

## Protocols

### MCP (Model Context Protocol)
- **Server**: `@modelcontextprotocol/sdk` - Exposes 12 coordination tools
- **Endpoint**: `POST /api/mcp` (JSON-RPC), `GET /api/mcp` (SSE)
- **Tools**: list_agents, create_agent, delegate_task, send_message_to_agent, report_to_parent, wake_or_create_task_agent, get_agent_status, get_agent_summary, subscribe_to_events, etc.

### ACP (Agent Client Protocol)
- **Agent**: `@agentclientprotocol/sdk` - AgentSideConnection implementation
- **Endpoint**: `POST /api/acp` (JSON-RPC), `GET /api/acp?sessionId=x` (SSE)
- **Methods**: initialize, session/new, session/prompt, session/cancel, session/load, skills/list, skills/load, tools/call

### Skills (OpenCode Compatible)
- Discovers SKILL.md files from `.opencode/skills/`, `.claude/skills/`, `.agents/skills/`
- Dynamic loading via ACP slash commands or REST API
- Pattern-based permissions (allow/deny/ask)

## Agent Roles

| Role | Purpose |
|------|---------|
| **ROUTA** | Coordinator - plans, delegates, orchestrates |
| **CRAFTER** | Implementor - writes code, makes changes |
| **GATE** | Verifier - reviews and validates work |

## Quick Start

```bash
cd routa-js
npm install --legacy-peer-deps
npm run dev
```

Open http://localhost:3000 to use the browser UI.

### MCP Client Connection

Configure your MCP client (Claude Code, etc.) to connect to:
```
http://localhost:3000/api/mcp
```

**Where is MCP configured?**

- **In this project**: There is no MCP config file in the repo. The app exposes an MCP server at `/api/mcp`; any client that wants to use Routa’s coordination tools must point to that URL.
- **Claude Code**: When you choose the "Claude Code" provider in the UI, Routa automatically injects the routa-mcp server into Claude Code via `--mcp-config`. No extra config in Claude Code is needed.
- **OpenCode**: Routa only spawns OpenCode (e.g. `opencode acp --cwd <cwd>`) and does **not** pass MCP config into it. To let OpenCode use Routa’s MCP tools, add a **remote** MCP server in OpenCode’s config.

Example OpenCode config (e.g. `~/.config/opencode/opencode.json` or project `.opencode/opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "routa": {
      "type": "remote",
      "url": "http://localhost:3000/api/mcp",
      "enabled": true
    }
  }
}
```

Use the port your app runs on (e.g. `3005` if you started with `PORT=3005`). Then in OpenCode you can use the Routa coordination tools (e.g. list agents, delegate tasks).

### ACP Client Connection

OpenCode or other ACP clients can connect to:
```
http://localhost:3000/api/acp
```

### Connect to remote OpenCode (e.g. cloud deployment)

You can use a **remote** OpenCode instance (e.g. deployed at `https://opencode-nine.vercel.app`) instead of spawning a local `opencode` process.

1. **Set the remote ACP URL** (one of):
   - **Env (recommended)**: `OPENCODE_REMOTE_URL=https://opencode-nine.vercel.app/api/acp`  
     (Use the real path where your deployment exposes ACP; see below.)
   - **Per request**: when creating a session with provider `opencode-remote`, you can pass `remoteBaseUrl` in the `session/new` params (e.g. from the frontend).

2. **In the UI**: choose provider **"OpenCode (Remote)"** and create a new session. The backend will talk to the URL from `OPENCODE_REMOTE_URL` (or the passed `remoteBaseUrl`).

**Important:** The remote must expose the **same ACP-over-HTTP** contract as this app’s `/api/acp`:

- **POST** to the base URL: JSON-RPC body with methods `initialize`, `session/new`, `session/prompt`, `session/cancel`.
- **GET** `baseUrl?sessionId=<id>`: SSE stream of `session/update` events.

If your deployment is the standard OpenCode **web** or **server** (REST API with `/session`, `/session/:id/message`, etc.), it does **not** speak ACP over HTTP by default. You would need an adapter or a proxy that translates ACP JSON-RPC/SSE to that REST API. This project only supports remotes that already expose an ACP-compatible HTTP/SSE endpoint.

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Main UI (Agent, Skill, Chat panels)
│   └── api/
│       ├── mcp/route.ts          # MCP Server endpoint
│       ├── acp/route.ts          # ACP Agent endpoint
│       ├── agents/route.ts       # Agent REST API
│       └── skills/route.ts       # Skills REST API
├── core/                         # Server-side core
│   ├── models/                   # Data models
│   │   ├── agent.ts              # Agent, AgentRole, AgentStatus
│   │   ├── task.ts               # Task, TaskStatus
│   │   └── message.ts            # Message, CompletionReport
│   ├── store/                    # In-memory stores
│   │   ├── agent-store.ts        # AgentStore interface + impl
│   │   ├── conversation-store.ts # ConversationStore interface + impl
│   │   └── task-store.ts         # TaskStore interface + impl
│   ├── tools/
│   │   ├── agent-tools.ts        # 12 coordination tools
│   │   └── tool-result.ts        # ToolResult type
│   ├── mcp/
│   │   ├── routa-mcp-server.ts   # MCP Server factory
│   │   └── routa-mcp-tool-manager.ts # Tool registration
│   ├── acp/
│   │   ├── routa-acp-agent.ts    # ACP Agent (AgentSideConnection)
│   │   └── acp-session-manager.ts # Session management
│   ├── skills/
│   │   ├── skill-loader.ts       # SKILL.md discovery & parsing
│   │   └── skill-registry.ts     # Runtime skill registry
│   ├── events/
│   │   └── event-bus.ts          # EventBus for inter-agent events
│   └── routa-system.ts           # Central system (stores + tools)
└── client/                       # Browser-side
    ├── acp-client.ts             # BrowserAcpClient (JSON-RPC + SSE)
    ├── skill-client.ts           # SkillClient (REST)
    ├── hooks/
    │   ├── use-acp.ts            # React hook for ACP
    │   └── use-skills.ts         # React hook for skills
    └── components/
        ├── agent-panel.tsx       # Agent management UI
        ├── skill-panel.tsx       # Skill discovery UI
        └── chat-panel.tsx        # Chat interface
```

## Dependencies

- `@modelcontextprotocol/sdk` - MCP Server (tools, resources)
- `@agentclientprotocol/sdk` - ACP Agent (sessions, prompts)
- `next` - Full-stack React framework
- `zod` - Schema validation for MCP tools
- `gray-matter` - YAML frontmatter parsing for SKILL.md
- `uuid` - ID generation
