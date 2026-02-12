package com.phodal.routa.core.koog

import ai.koog.agents.core.tools.ToolRegistry
import com.phodal.routa.core.tool.AgentTools

/**
 * Tool registry for the Workspace Agent.
 *
 * Combines the full set of Routa coordination tools (from [RoutaToolRegistry])
 * with workspace file operation tools (read_file, write_file, list_files).
 *
 * This gives a single Workspace Agent both:
 * - **Agent coordination**: create_agent, delegate, list_agents, report_to_parent, etc.
 * - **File operations**: read_file, write_file, list_files
 *
 * Inspired by Intent's workspace agent which has both agent collaboration tools
 * and file system tools in a unified tool set.
 *
 * Usage:
 * ```kotlin
 * val toolRegistry = WorkspaceToolRegistry.create(
 *     agentTools = routa.tools,
 *     workspaceId = "my-workspace",
 *     cwd = "/path/to/project",
 * )
 * ```
 */
object WorkspaceToolRegistry {

    /**
     * Create a [ToolRegistry] with all Routa coordination tools AND workspace file tools.
     *
     * @param agentTools The underlying AgentTools implementation.
     * @param workspaceId Default workspace ID for tools that need it.
     * @param cwd The workspace root directory for file operations.
     */
    fun create(agentTools: AgentTools, workspaceId: String, cwd: String): ToolRegistry {
        return ToolRegistry {
            // ── Core agent coordination tools (same as RoutaToolRegistry) ──
            tool(ListAgentsTool(agentTools, workspaceId))
            tool(ReadAgentConversationTool(agentTools))
            tool(CreateAgentTool(agentTools, workspaceId))
            tool(DelegateTaskTool(agentTools))
            tool(MessageAgentTool(agentTools))
            tool(ReportToParentTool(agentTools))

            // ── Task-agent lifecycle tools ──
            tool(WakeOrCreateTaskAgentTool(agentTools, workspaceId))
            tool(SendMessageToTaskAgentTool(agentTools))
            tool(GetAgentStatusTool(agentTools))
            tool(GetAgentSummaryTool(agentTools))

            // ── Event subscription tools ──
            tool(SubscribeToEventsTool(agentTools))
            tool(UnsubscribeFromEventsTool(agentTools))

            // ── Workspace file operation tools ──
            tool(ReadFileTool(cwd))
            tool(WriteFileTool(cwd))
            tool(ListFilesTool(cwd))
        }
    }
}
