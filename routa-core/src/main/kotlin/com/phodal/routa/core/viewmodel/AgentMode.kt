package com.phodal.routa.core.viewmodel

/**
 * Execution mode for the Routa ViewModel.
 *
 * Determines how user requests are executed:
 * - [ACP_AGENT]: Multi-agent pipeline with ROUTA → CRAFTER → GATE orchestration
 * - [WORKSPACE]: Single workspace agent that plans and implements directly
 *
 * ## Mode Comparison
 *
 * | Feature                | ACP_AGENT             | WORKSPACE              |
 * |------------------------|-----------------------|------------------------|
 * | Agents                 | Multiple (3+ roles)   | Single workspace agent |
 * | File editing           | Via CRAFTER agents    | Direct (read/write)    |
 * | Planning               | Via ROUTA agent       | Built-in               |
 * | Verification           | Via GATE agent        | Self-verification      |
 * | Agent coordination     | Full orchestration    | Optional delegation    |
 * | Use case               | Complex, multi-task   | Simple/medium tasks    |
 *
 * ## Switching Modes
 *
 * ```kotlin
 * viewModel.agentMode = AgentMode.WORKSPACE   // Single agent mode
 * viewModel.agentMode = AgentMode.ACP_AGENT   // Multi-agent pipeline
 * ```
 */
enum class AgentMode {
    /**
     * Multi-agent orchestration mode (default).
     *
     * Uses the full ROUTA → CRAFTER → GATE pipeline:
     * 1. ROUTA plans tasks from the user request
     * 2. CRAFTER agents implement the planned tasks (via ACP or Claude)
     * 3. GATE agent verifies all completed work
     * 4. Retry if verification fails
     *
     * Best for complex tasks that benefit from separation of concerns.
     * Requires an ACP agent (Codex, Claude Code) for implementation.
     */
    ACP_AGENT,

    /**
     * Single workspace agent mode.
     *
     * A single Koog-based agent handles both planning AND implementation:
     * - Has file tools (read_file, write_file, list_files) for direct editing
     * - Has agent coordination tools for optional delegation
     * - Uses a workspace-oriented system prompt
     *
     * Inspired by Intent by Augment's workspace agent architecture.
     * Best for simpler tasks or when no external ACP agent is available.
     */
    WORKSPACE,
}
