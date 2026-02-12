---
layout: default
title: Usage Guide
nav_order: 4
---

# Usage Guide
{: .no_toc }

Learn how to use all of Routa's features.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Opening Routa

1. Open the **Routa** tool window
   - Find it in the right sidebar
   - Or: **View** → **Tool Windows** → **Routa**

2. The Welcome page shows:
   - Detected agents
   - Input area for chatting
   - Agent selector dropdown

---

## Multi-Agent Sessions

### Creating Sessions

- Connect to different agents simultaneously - each gets its own tab
- Switch between agents using the toolbar or tabs
- Each session maintains independent conversation history

### Managing Sessions

- **New Session**: Click **+ Add Agent** or select a different agent
- **Switch Session**: Click on tabs or use the agent selector
- **Close Session**: Click the **×** on the tab or use **Disconnect**

---

## Chat Interface

### Input Area

The input area at the bottom provides:

- **Text Area**: Type your message here
- **Agent Selector** (bottom-left): Switch agents on the fly
- **Send Button** (bottom-right): Or press Enter to send
- **Stop Button**: Cancel ongoing requests

### Keyboard Shortcuts

| Shortcut | Action |
|:---------|:-------|
| `Enter` | Send message |
| `Shift+Enter` | New line in message |
| `Esc` | Stop current request |

---

## Message Types

Routa displays different message types with distinct styling:

💬 **User Messages** (Blue)
: Your messages to the agent

🤖 **Assistant Messages** (Gray)
: Agent responses and explanations

⚡ **Tool Calls** (Orange)
: Agent executing tools (file operations, terminal commands, etc.)

✅ **Tool Results** (Green/Red)
: Results from tool executions (green for success, red for errors)

💭 **Thinking** (Purple)
: Agent's internal reasoning process

ℹ️ **Info Messages** (Cyan)
: System messages and notifications

⚠️ **Error Messages** (Red)
: Error messages and warnings

---

## Working with Tools

### Tool Call Visualization

When an agent uses tools, you'll see:

1. **Tool Call** - What the agent is doing
   ```
   [Tool Call] Reading file: src/main/java/UserService.java
   ```

2. **Tool Result** - The outcome
   ```
   [Tool Result] ✓ File content retrieved successfully
   ```

### Permission Requests

Some tools require permission:

1. Agent requests permission to perform an action
2. A dialog appears asking for approval
3. Choose **Allow** or **Deny**

{: .note }
Set `autoApprove: true` in config to automatically approve all requests for trusted agents.

---

## Example Workflows

### Code Review

```
You: Can you review the changes in UserController.java?

Agent: I'll review the file for you.
[Tool Call] Reading file: src/main/java/UserController.java
[Tool Result] ✓ File read successfully

Agent: Here's my review:
1. The error handling looks good...
2. Consider adding validation for...
```

### Refactoring

```
You: Help me refactor the authentication logic

Agent: I'll analyze the current implementation first.
[Tool Call] Reading file: src/auth/AuthService.java
[Tool Result] ✓ File read successfully

Agent: I suggest extracting the token validation into a separate method...
```

### Writing Tests

```
You: Write unit tests for the PaymentService class

Agent: I'll create comprehensive tests for PaymentService.
[Tool Call] Reading file: src/service/PaymentService.java
[Tool Result] ✓ File read successfully
[Tool Call] Creating file: src/test/PaymentServiceTest.java
[Tool Result] ✓ Test file created successfully

Agent: I've created tests covering all payment scenarios...
```

---

## Tips and Best Practices

{: .highlight }
**Be Specific**: Provide clear context and specific requests for better results.

{: .highlight }
**Use Multiple Agents**: Different agents have different strengths - try them for different tasks.

{: .highlight }
**Review Tool Calls**: Always review what tools the agent is using, especially for file modifications.

{: .highlight }
**Save Important Conversations**: Copy important responses before closing sessions.

