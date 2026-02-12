---
layout: default
title: Getting Started
nav_order: 2
---

# Getting Started
{: .no_toc }

Get up and running with Routa in just a few minutes.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Installation

### From JetBrains Marketplace

{: .note }
> The plugin will be available on JetBrains Marketplace soon.

1. Open IntelliJ IDEA 2025.2 or later
2. Go to **Settings** → **Plugins**
3. Search for "Routa"
4. Click **Install**
5. Restart the IDE

### From Source

```bash
git clone https://github.com/phodal/agent-dispatcher.git
cd agent-dispatcher
./gradlew buildPlugin
```

The plugin will be built to `build/distributions/agent-dispatcher-*.zip`

Install via **Settings** → **Plugins** → **⚙️** → **Install Plugin from Disk**

---

## Quick Start (3 Steps!)

### 1. Install the Plugin

Download from JetBrains Marketplace or build from source and install via Settings → Plugins → Install from Disk.

### 2. Open Routa Tool Window

Find it in the right sidebar or go to **View** → **Tool Windows** → **Routa**.

### 3. Start Chatting!

- The Welcome page shows detected agents and an input area
- Select an agent from dropdown (e.g., "kimi", "claude")
- Type your message and press Enter
- Agent auto-connects and responds!

{: .highlight }
**No configuration needed** if you have AutoDev/Xiuper with `~/.autodev/config.yaml`, or ACP CLI tools in your system PATH.

---

## First Chat Session

1. **Select an agent** from the dropdown in the input area
2. **Type your message** - for example: "Help me refactor this code"
3. **Press Enter** or click the Send button
4. **Watch the magic** - the agent will connect automatically and start responding

### Example Conversation

```
You: Can you help me write a unit test for the UserService class?

Agent: I'll help you write a unit test. Let me first examine the UserService class...
[Tool Call] Reading file: src/main/java/UserService.java
[Tool Result] File content retrieved successfully

Agent: Based on the code, here's a comprehensive unit test...
```

---

## Next Steps

- [Configuration Guide](configuration) - Learn about the 3-tier configuration system
- [Usage Guide](usage) - Explore all features and capabilities
- [Troubleshooting](troubleshooting) - Common issues and solutions

