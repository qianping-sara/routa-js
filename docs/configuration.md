---
layout: default
title: Configuration
nav_order: 3
---

# Configuration
{: .no_toc }

Learn how to configure Routa's 3-tier configuration system.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Configuration Priority

Routa uses a smart 3-tier configuration system with automatic agent detection:

```
Highest: ~/.agent-dispatcher/config.yaml (your manual configurations)
   ↓
Middle:  ~/.autodev/config.yaml (AutoDev/Xiuper shared config)
   ↓
Lowest:  System PATH (auto-detected CLI tools - only for missing agents)
```

---

## Automatic Detection from AutoDev/Xiuper

If you already use [AutoDev](https://github.com/unit-mesh/auto-dev) or [Xiuper](https://github.com/unit-mesh/xiuper), Routa will **automatically use** your existing agent configurations from `~/.autodev/config.yaml`:

```yaml
# ~/.autodev/config.yaml (your existing config)
acpAgents:
  opencode:
    name: "OpenCode"
    command: "/Users/phodal/.opencode/bin/opencode"
    args: "acp"
    env: ""
  kimi:
    name: "Kimi"
    command: "/Library/Frameworks/Python.framework/Versions/3.12/bin/kimi"
    args: "acp"
    env: ""
  claude:
    name: "Claude Code"  
    command: "/opt/homebrew/bin/claude"
    args: ""
    env: ""
activeAcpAgent: kimi
```

{: .important }
These agents will be used as-is, with their full configured paths.

---

## Auto-Detection for Missing Agents

For agents **NOT** in your AutoDev config, Routa will automatically detect them from your system PATH:

- Checks common ACP CLI tools: `codex`, `gemini`, `copilot`, `auggie`, etc.
- Uses `which` (Unix/macOS) or `where` (Windows) to find full paths
- Only adds agents that are missing from your existing config

---

## Manual Configuration

Create or edit `~/.agent-dispatcher/config.yaml` to add custom agents or override any settings:

```yaml
# Active agent (optional - can be set via UI)
activeAgent: codex

# Available agents
agents:
  codex:
    command: codex
    args: ["--full-auto"]
    description: "OpenAI Codex CLI"
    autoApprove: false  # Auto-approve permission requests
    env:
      OPENAI_API_KEY: "your-api-key-here"
  
  claude:
    command: claude
    args: []
    description: "Anthropic Claude Code"
    autoApprove: true
  
  gemini:
    command: gemini
    args: ["--mode", "code"]
    description: "Google Gemini CLI"
    env:
      GOOGLE_API_KEY: "your-api-key-here"
```

{: .note }
- Agents in `~/.agent-dispatcher/config.yaml` override AutoDev config
- Agents in `~/.autodev/config.yaml` are used as configured (with full paths)
- Auto-detection only fills in **missing** agents from system PATH

---

## Configuration Options

| Option | Type | Description | Default |
|:-------|:-----|:------------|:--------|
| `command` | String | The executable command for the agent | Required |
| `args` | Array | Command-line arguments | `[]` |
| `description` | String | Human-readable description shown in UI | `""` |
| `autoApprove` | Boolean | Automatically approve permission requests | `false` |
| `env` | Object | Environment variables for the agent process | `{}` |

---

## Examples

### Example 1: Basic Agent

```yaml
agents:
  myagent:
    command: myagent
    description: "My Custom Agent"
```

### Example 2: Agent with API Key

```yaml
agents:
  openai:
    command: openai-cli
    args: ["--model", "gpt-4"]
    env:
      OPENAI_API_KEY: "sk-..."
```

### Example 3: Auto-Approve Agent

```yaml
agents:
  trusted:
    command: trusted-agent
    autoApprove: true
    description: "Trusted agent with auto-approval"
```

