---
layout: home
title: Home
nav_order: 1
description: "Routa - Multi-Agent Development Environment for IntelliJ IDEA"
permalink: /
---

# Routa
{: .fs-9 }

Multi-agent session management, real-time streaming chat interface, tool call visualization, and efficient process lifecycle management.
{: .fs-6 .fw-300 }

[Get Started](getting-started){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/phodal/agent-dispatcher){: .btn .fs-5 .mb-4 .mb-md-0 }

---

{: .warning }
> This plugin requires IntelliJ IDEA 2025.2 or later.

## What is Routa?

Routa is an IntelliJ IDEA plugin that provides a unified interface for managing multiple ACP (Agent Client Protocol) compatible coding agents. It supports Claude Code, Codex CLI, Gemini CLI, and any custom ACP-compatible agents.

## Key Features

🎯 **Auto-Detection**
: Automatically discovers agents from `~/.autodev/config.yaml` (AutoDev/Xiuper integration)

🔄 **Multi-agent Session Management**
: Run multiple agents simultaneously with independent conversation histories

💬 **Real-time Streaming Chat**
: See agent responses as they stream in with beautiful UI

🛠️ **Tool Call Visualization**
: Monitor tool executions with clear status indicators

🔌 **Process Lifecycle Management**
: Efficient process reuse and health monitoring

⚙️ **YAML-based Configuration**
: Easy agent setup and management

📊 **Beautiful UI**
: Clean chat interface with role-specific message styling

## Supported Agents

Any ACP-compatible agent, including:

- **Claude Code** (Anthropic)
- **Codex CLI** (OpenAI)
- **Gemini CLI** (Google)
- And any custom ACP agents

## Quick Start

1. **Install the plugin** in IntelliJ IDEA 2025.2+
2. **Open Routa** tool window (View → Tool Windows → Routa)
3. **Start chatting** - Select an agent and type your message!

No configuration needed if you have AutoDev/Xiuper or ACP CLI tools in your PATH.

---

## About

Routa is developed by [Phodal](https://github.com/phodal) and is open source under the MIT License.

