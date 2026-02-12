package com.phodal.routa.core.provider

import ai.koog.prompt.dsl.prompt
import ai.koog.prompt.streaming.StreamFrame
import com.phodal.routa.core.config.NamedModelConfig
import com.phodal.routa.core.koog.WorkspaceToolRegistry
import com.phodal.routa.core.model.AgentRole
import com.phodal.routa.core.tool.AgentTools
import com.phodal.routa.core.config.LLMProviderType
import com.phodal.routa.core.config.RoutaConfigLoader
import ai.koog.agents.core.agent.AIAgent
import ai.koog.prompt.executor.clients.deepseek.DeepSeekLLMClient
import ai.koog.prompt.executor.llms.SingleLLMPromptExecutor
import ai.koog.prompt.executor.llms.all.*
import ai.koog.prompt.llm.LLMCapability
import ai.koog.prompt.llm.LLMProvider
import ai.koog.prompt.llm.LLModel
import kotlinx.coroutines.flow.cancellable
import java.util.concurrent.ConcurrentHashMap

/**
 * Workspace Agent provider — a single agent that can both plan AND implement.
 *
 * Inspired by Intent by Augment's workspace agent architecture:
 * - Has full agent coordination tools (create_agent, delegate, list_agents, etc.)
 * - Has workspace file operation tools (read_file, write_file, list_files)
 * - Uses a workspace-oriented system prompt
 *
 * Unlike [KoogAgentProvider] which is designed only for planning (ROUTA role)
 * and delegates implementation to CRAFTERs, the WorkspaceAgentProvider acts as
 * a self-sufficient agent that can directly read/write files while also being
 * able to coordinate with other agents via MCP-based AgentTools.
 *
 * ## Key Differences from KoogAgentProvider
 *
 * | Feature              | KoogAgentProvider      | WorkspaceAgentProvider |
 * |----------------------|------------------------|------------------------|
 * | File editing         | No                     | Yes (read/write/list)  |
 * | Agent coordination   | Yes                    | Yes                    |
 * | System prompt        | Role-based (ROUTA/etc) | Workspace-focused      |
 * | Max iterations       | 5-10                   | 20                     |
 * | Use case             | Multi-agent pipeline   | Single-agent workspace |
 *
 * ## Usage
 *
 * ```kotlin
 * val provider = WorkspaceAgentProvider(
 *     agentTools = routa.tools,
 *     workspaceId = "my-workspace",
 *     cwd = "/path/to/project",
 * )
 *
 * // As a standalone workspace agent
 * val result = provider.run(AgentRole.ROUTA, agentId, "Add user authentication")
 *
 * // Or with streaming
 * provider.runStreaming(AgentRole.ROUTA, agentId, prompt) { chunk -> ... }
 * ```
 *
 * @see KoogAgentProvider for the planning-only provider
 * @see AgentTools for the MCP-based agent coordination tools
 */
class WorkspaceAgentProvider(
    private val agentTools: AgentTools,
    private val workspaceId: String,
    private val cwd: String,
    private val modelConfig: NamedModelConfig? = null,
) : AgentProvider {

    // Track active agents for isHealthy / interrupt
    private val activeAgents = ConcurrentHashMap<String, RunningAgent>()

    private data class RunningAgent(
        val role: AgentRole,
        @Volatile var cancelled: Boolean = false,
    )

    // ── System Prompt ────────────────────────────────────────────────────

    companion object {
        /**
         * Workspace agent system prompt, adapted from Intent's workspace.ts.
         *
         * Combines workspace management capabilities with agent coordination.
         * The agent can directly edit files AND coordinate with other agents.
         */
        val WORKSPACE_SYSTEM_PROMPT = """
            |# Workspace Agent
            |
            |You are a workspace agent that can directly implement tasks, manage files, 
            |and coordinate with other agents. You have both file editing capabilities 
            |and agent coordination tools.
            |
            |## Workspace
            |
            |A workspace is a project environment with context and agents. You can directly 
            |read, write, and list files in the project directory. You can also create and 
            |coordinate other agents for parallel work.
            |
            |## Creating Tasks
            |
            |Use `@@@task` blocks to propose tasks. One task per block:
            |
            |```
            |@@@task
            |# Task Title
            |
            |## Objective
            |Clear statement of what needs to be done.
            |
            |## Scope
            |- Specific files/components to modify
            |
            |## Definition of Done
            |- Acceptance criteria
            |
            |## Verification
            |- Commands to run for verification
            |@@@
            |```
            |
            |## File Operations
            |
            |You can directly work with project files:
            |- `read_file(path)` — Read the contents of a project file (relative path)
            |- `write_file(path, content)` — Write/create a file in the project
            |- `list_files(path)` — List files and directories
            |
            |IMPORTANT: Always read existing files before modifying them to understand 
            |the current state. Make minimal, targeted changes.
            |
            |## Agent Collaboration
            |
            |You can coordinate with other agents:
            |- `list_agents()` — List all agents and their status
            |- `create_agent(name, role, workspaceId)` — Create a new agent (CRAFTER, GATE)
            |- `delegate_task(agentId, taskId, callerAgentId)` — Delegate a task to an agent
            |- `send_message_to_agent(fromAgentId, toAgentId, message)` — Message another agent
            |- `read_agent_conversation(agentId)` — Read another agent's chat history
            |- `report_to_parent(agentId, taskId, summary, success)` — Report completion
            |- `get_agent_status(agentId)` — Check agent status
            |- `get_agent_summary(agentId)` — Get agent summary
            |
            |## Workflow
            |
            |1. **Analyze** — Understand the user request, read relevant files
            |2. **Plan** — Break down into tasks if complex, or implement directly if simple
            |3. **Implement** — Read files, make changes, write files
            |4. **Verify** — Check that changes are correct and complete
            |5. **Report** — Summarize what was done
            |
            |## Hard Rules
            |
            |1. **Read before write** — Always read a file before modifying it
            |2. **Minimal changes** — Make the smallest change that solves the problem
            |3. **No scope creep** — Stick to what was asked
            |4. **Coordinate** — If other agents are active, check their work first
            |5. **Report completion** — When done, use `report_to_parent` to report results
        """.trimMargin()
    }

    // ── AgentRunner ──────────────────────────────────────────────────────

    override suspend fun run(role: AgentRole, agentId: String, prompt: String): String {
        val agent = createWorkspaceAgent()

        activeAgents[agentId] = RunningAgent(role)

        return try {
            agent.run(prompt)
        } catch (e: Exception) {
            if (e.message?.contains("maxAgentIterations", ignoreCase = true) == true ||
                e.message?.contains("number of steps", ignoreCase = true) == true
            ) {
                "[Agent reached max iterations. Partial output may be available.]"
            } else {
                throw e
            }
        } finally {
            agent.close()
            activeAgents.remove(agentId)
        }
    }

    // ── AgentProvider: Streaming ─────────────────────────────────────────

    override suspend fun runStreaming(
        role: AgentRole,
        agentId: String,
        prompt: String,
        onChunk: (StreamChunk) -> Unit,
    ): String {
        val components = createLLMComponents()
        activeAgents[agentId] = RunningAgent(role)

        val resultBuilder = StringBuilder()
        onChunk(StreamChunk.Heartbeat())

        return try {
            val llmPrompt = prompt(id = "workspace-$agentId") {
                system(components.systemPrompt)
                user(prompt)
            }

            components.executor.executeStreaming(llmPrompt, components.model)
                .cancellable()
                .collect { frame ->
                    when (frame) {
                        is StreamFrame.Append -> {
                            resultBuilder.append(frame.text)
                            onChunk(StreamChunk.Text(frame.text))
                        }
                        is StreamFrame.End -> {
                            onChunk(StreamChunk.Completed(frame.finishReason ?: "end"))
                        }
                        is StreamFrame.ToolCall -> {
                            onChunk(StreamChunk.ToolCall(frame.name, ToolCallStatus.IN_PROGRESS))
                        }
                    }
                }

            resultBuilder.toString()
        } catch (e: Exception) {
            onChunk(StreamChunk.Error(e.message ?: "Unknown error", recoverable = false))
            throw e
        } finally {
            activeAgents.remove(agentId)
        }
    }

    // ── AgentProvider: Health Check ──────────────────────────────────────

    override fun isHealthy(agentId: String): Boolean {
        val agent = activeAgents[agentId] ?: return true
        return !agent.cancelled
    }

    // ── AgentProvider: Interrupt ─────────────────────────────────────────

    override suspend fun interrupt(agentId: String) {
        activeAgents[agentId]?.cancelled = true
    }

    // ── AgentProvider: Capabilities ──────────────────────────────────────

    override fun capabilities(): ProviderCapabilities = ProviderCapabilities(
        name = "Workspace Agent",
        supportsStreaming = true,
        supportsInterrupt = false,
        supportsHealthCheck = false,
        supportsFileEditing = true,   // Can edit files directly (unlike KoogAgentProvider)
        supportsTerminal = false,
        supportsToolCalling = true,   // Koog handles function calling natively
        maxConcurrentAgents = 5,
        priority = 8,                 // Higher priority than Koog (5) for workspace tasks
    )

    // ── AgentProvider: Cleanup ───────────────────────────────────────────

    override suspend fun cleanup(agentId: String) {
        activeAgents.remove(agentId)
    }

    override suspend fun shutdown() {
        activeAgents.clear()
    }

    // ── Internal: Agent & LLM creation ──────────────────────────────────

    private fun createWorkspaceAgent(): AIAgent<String, String> {
        val config = modelConfig ?: RoutaConfigLoader.getActiveModelConfig()
            ?: throw IllegalStateException(
                "No active model config found. Please configure ~/.autodev/config.yaml"
            )

        val executor = createExecutor(config)
        val model = createModel(config)
        val toolRegistry = WorkspaceToolRegistry.create(agentTools, workspaceId, cwd)

        return AIAgent(
            promptExecutor = executor,
            llmModel = model,
            systemPrompt = WORKSPACE_SYSTEM_PROMPT,
            toolRegistry = toolRegistry,
            maxIterations = 20,
        )
    }

    private data class LLMComponents(
        val executor: SingleLLMPromptExecutor,
        val model: LLModel,
        val systemPrompt: String,
    )

    private fun createLLMComponents(): LLMComponents {
        val config = modelConfig ?: RoutaConfigLoader.getActiveModelConfig()
            ?: throw IllegalStateException(
                "No active model config found. Please configure ~/.autodev/config.yaml"
            )

        return LLMComponents(
            executor = createExecutor(config),
            model = createModel(config),
            systemPrompt = WORKSPACE_SYSTEM_PROMPT,
        )
    }

    private fun createExecutor(config: NamedModelConfig): SingleLLMPromptExecutor {
        val provider = LLMProviderType.fromString(config.provider)
            ?: throw IllegalArgumentException("Unknown provider: ${config.provider}")

        return when (provider) {
            LLMProviderType.OPENAI -> simpleOpenAIExecutor(config.apiKey)
            LLMProviderType.ANTHROPIC -> simpleAnthropicExecutor(config.apiKey)
            LLMProviderType.GOOGLE -> simpleGoogleAIExecutor(config.apiKey)
            LLMProviderType.DEEPSEEK -> SingleLLMPromptExecutor(DeepSeekLLMClient(config.apiKey))
            LLMProviderType.OLLAMA -> simpleOllamaAIExecutor(
                baseUrl = config.baseUrl.ifEmpty { "http://localhost:11434" }
            )
            LLMProviderType.OPENROUTER -> simpleOpenRouterExecutor(config.apiKey)
        }
    }

    private fun createModel(config: NamedModelConfig): LLModel {
        val provider = LLMProviderType.fromString(config.provider)
            ?: LLMProviderType.OPENAI

        val llmProvider = when (provider) {
            LLMProviderType.OPENAI -> LLMProvider.OpenAI
            LLMProviderType.ANTHROPIC -> LLMProvider.Anthropic
            LLMProviderType.GOOGLE -> LLMProvider.Google
            LLMProviderType.DEEPSEEK -> LLMProvider.DeepSeek
            LLMProviderType.OLLAMA -> LLMProvider.Ollama
            LLMProviderType.OPENROUTER -> LLMProvider.OpenRouter
        }

        val (contextLength, maxOutputTokens) = when (provider) {
            LLMProviderType.DEEPSEEK -> when {
                config.model.contains("reasoner") -> 64_000L to 64_000L
                else -> 64_000L to 8_000L
            }
            LLMProviderType.ANTHROPIC -> 200_000L to 8_192L
            LLMProviderType.GOOGLE -> 1_000_000L to 8_192L
            else -> config.maxTokens.toLong() to 4_096L
        }

        return LLModel(
            provider = llmProvider,
            id = config.model,
            capabilities = listOf(
                LLMCapability.Completion,
                LLMCapability.Temperature,
                LLMCapability.Tools,
                LLMCapability.ToolChoice,
            ),
            contextLength = contextLength,
            maxOutputTokens = maxOutputTokens,
        )
    }
}
