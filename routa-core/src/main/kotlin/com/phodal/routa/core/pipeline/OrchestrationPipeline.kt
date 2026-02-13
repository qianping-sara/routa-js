package com.phodal.routa.core.pipeline

import com.phodal.routa.core.pipeline.stages.CrafterExecutionStage
import com.phodal.routa.core.pipeline.stages.GateVerificationStage
import com.phodal.routa.core.pipeline.stages.PlanningStage
import com.phodal.routa.core.pipeline.stages.TaskRegistrationStage
import com.phodal.routa.core.runner.OrchestratorPhase
import com.phodal.routa.core.runner.OrchestratorResult
import kotlinx.coroutines.CancellationException
import java.util.UUID

/**
 * A composable orchestration pipeline that executes [PipelineStage]s in sequence.
 *
 * The pipeline is the **control plane** of the multi-agent workflow. It owns the
 * stage execution order, retry logic, cancellation propagation, and iteration control.
 * The **collaboration plane** — [PipelineEventBridge] + [EventBus] — provides
 * observability and cross-cutting concerns (metrics, recovery, UI updates).
 *
 * ## Two-Plane Architecture
 *
 * ```
 *   ┌────────────────────────────────────────────────────┐
 *   │                 Control Plane                       │
 *   │  Pipeline → Stage → RetryPolicy → StageResult      │
 *   │  Cancellation propagation (Job → ensureActive)     │
 *   │  ConditionalStage (runtime skip)                   │
 *   └──────────────────┬─────────────────────────────────┘
 *                      │ PipelineEvent
 *                      ▼
 *   ┌────────────────────────────────────────────────────┐
 *   │              Collaboration Plane                    │
 *   │  PipelineEventBridge → subscribeTo<T>              │
 *   │  StageRecoveryHandler (post-retry recovery)        │
 *   │  EventBus (system-wide agent events)               │
 *   └────────────────────────────────────────────────────┘
 * ```
 *
 * ## Execution Model
 *
 * ```
 * for iteration in 1..maxIterations:
 *     context.ensureActive()          // ← cancellation check
 *     for stage in stages:
 *         context.ensureActive()      // ← cancellation check
 *         result = retryWithPolicy(stage.retryPolicy) {
 *             stage.execute(context)
 *         }
 *         on failure after retries → recoveryHandler.recover(stage, error)
 *         match result:
 *             Continue       → next stage
 *             SkipRemaining  → return result (success)
 *             RepeatPipeline → break to next iteration
 *             Done           → return result
 *             Failed         → return failure
 * ```
 *
 * @param stages The ordered list of stages to execute.
 * @param maxIterations Maximum number of pipeline iterations (prevents infinite fix loops).
 * @param eventBridge The pipeline event bridge for lifecycle event emissions.
 * @param recoveryHandler The recovery handler for post-retry error recovery.
 *
 * @see PipelineStage for implementing custom stages.
 * @see PipelineContext for the shared state between stages.
 * @see PipelineEventBridge for subscribing to pipeline lifecycle events.
 * @see StageRecoveryHandler for post-retry error recovery strategies.
 */
class OrchestrationPipeline(
    val stages: List<PipelineStage>,
    val maxIterations: Int = 3,
    val eventBridge: PipelineEventBridge = PipelineEventBridge(),
    val recoveryHandler: StageRecoveryHandler = StageRecoveryHandler.DEFAULT,
) {

    /** Unique identifier for this pipeline instance. */
    val pipelineId: String = UUID.randomUUID().toString().take(8)

    /**
     * Execute the pipeline with the given context.
     *
     * Integrates:
     * - **Cancellation**: checks [PipelineContext.ensureActive] before each stage
     * - **Retry**: uses [PipelineStage.retryPolicy] for transient failures
     * - **Recovery**: uses [StageRecoveryHandler] when retries are exhausted
     * - **Events**: emits [PipelineEvent]s to [eventBridge] at each lifecycle point
     *
     * @param context The pipeline context containing system, provider, and configuration.
     * @return The final [OrchestratorResult].
     */
    suspend fun execute(context: PipelineContext): OrchestratorResult {
        val startTime = System.currentTimeMillis()
        var lastCompletedStage: String? = null
        var iterationsUsed = 0

        // Track which stage triggered RepeatPipeline so we can resume from there
        var repeatFromIndex = 0

        eventBridge.tryEmit(
            PipelineEvent.PipelineStarted(pipelineId, stages.size, maxIterations)
        )

        try {
            context.emitPhase(OrchestratorPhase.Initializing)

            for (iteration in 1..maxIterations) {
                iterationsUsed = iteration
                context.ensureActive() // ← cancellation check point

                eventBridge.tryEmit(
                    PipelineEvent.IterationStarted(pipelineId, iteration, maxIterations)
                )

                var shouldRepeat = false

                // On iteration > 1, skip stages before the repeat point
                // (Planning + TaskRegistration should NOT re-run on fix waves)
                val startIndex = if (iteration > 1) repeatFromIndex else 0
                val activeStages = stages.subList(startIndex, stages.size)

                for (stage in activeStages) {
                    context.ensureActive() // ← cancellation check point

                    val result = executeStageWithResilience(context, stage, iteration)

                    when (result) {
                        is StageResult.Continue -> {
                            lastCompletedStage = stage.name
                            continue
                        }

                        is StageResult.SkipRemaining -> {
                            lastCompletedStage = stage.name
                            emitPipelineCompleted(startTime, iterationsUsed, true)
                            return result.result
                        }

                        is StageResult.RepeatPipeline -> {
                            lastCompletedStage = stage.name
                            shouldRepeat = true
                            // Determine where to resume on the next iteration.
                            // If the stage specified a fromStageName, find that stage's index.
                            // Otherwise, resume from the stage that triggered RepeatPipeline.
                            // This prevents one-shot stages (Planning, TaskRegistration)
                            // from re-running on fix waves.
                            repeatFromIndex = if (result.fromStageName != null) {
                                stages.indexOfFirst { it.name == result.fromStageName }
                                    .takeIf { it >= 0 } ?: 0
                            } else {
                                stages.indexOf(stage).coerceAtLeast(0)
                            }
                            break
                        }

                        is StageResult.Done -> {
                            lastCompletedStage = stage.name
                            emitPipelineCompleted(startTime, iterationsUsed, true)
                            return result.result
                        }

                        is StageResult.Failed -> {
                            emitPipelineCompleted(startTime, iterationsUsed, false)
                            return OrchestratorResult.Failed(result.error)
                        }
                    }
                }

                if (!shouldRepeat) {
                    context.emitPhase(OrchestratorPhase.Completed)
                    val summary = context.system.coordinator.getTaskSummary()
                    emitPipelineCompleted(startTime, iterationsUsed, true)
                    return OrchestratorResult.Success(summary)
                }
            }

            // Max iterations exhausted
            context.emitPhase(OrchestratorPhase.MaxWavesReached(maxIterations))
            val summary = context.system.coordinator.getTaskSummary()
            emitPipelineCompleted(startTime, iterationsUsed, true)
            return OrchestratorResult.MaxWavesReached(maxIterations, summary)

        } catch (e: CancellationException) {
            eventBridge.tryEmit(
                PipelineEvent.PipelineCancelled(
                    pipelineId,
                    reason = e.message ?: "Cancelled",
                    lastCompletedStage = lastCompletedStage,
                )
            )
            throw e // Re-throw to respect coroutine cancellation
        }
    }

    // ── Stage execution with retry + recovery ───────────────────────

    /**
     * Execute a single stage with retry policy and recovery handling.
     */
    private suspend fun executeStageWithResilience(
        context: PipelineContext,
        stage: PipelineStage,
        iteration: Int,
    ): StageResult {
        val stageStart = System.currentTimeMillis()

        eventBridge.tryEmit(
            PipelineEvent.StageStarted(pipelineId, stage.name, iteration)
        )

        return try {
            val policy = stage.retryPolicy
            val result = if (policy != null && policy.maxAttempts > 1) {
                retryWithPolicy(policy, stage.name) {
                    stage.execute(context)
                }
            } else {
                stage.execute(context)
            }

            val durationMs = System.currentTimeMillis() - stageStart
            eventBridge.tryEmit(
                PipelineEvent.StageCompleted(
                    pipelineId, stage.name, result, durationMs, iteration
                )
            )
            result

        } catch (e: CancellationException) {
            throw e // Never recover from cancellation
        } catch (e: Throwable) {
            val durationMs = System.currentTimeMillis() - stageStart

            // Apply recovery handler
            when (val action = recoveryHandler.recover(stage.name, e)) {
                is RecoveryAction.Skip -> {
                    eventBridge.tryEmit(
                        PipelineEvent.StageSkipped(
                            pipelineId, stage.name, action.reason, iteration
                        )
                    )
                    StageResult.Continue
                }

                is RecoveryAction.Fallback -> {
                    eventBridge.tryEmit(
                        PipelineEvent.StageCompleted(
                            pipelineId, stage.name, action.result, durationMs, iteration
                        )
                    )
                    action.result
                }

                is RecoveryAction.Abort -> {
                    eventBridge.tryEmit(
                        PipelineEvent.StageFailed(
                            pipelineId, stage.name,
                            error = e.message ?: e::class.simpleName ?: "Unknown error",
                            attempt = stage.retryPolicy?.maxAttempts ?: 1,
                            willRetry = false,
                            iteration = iteration,
                        )
                    )
                    StageResult.Failed("Stage '${stage.name}' failed: ${e.message}")
                }
            }
        }
    }

    // ── Event helpers ───────────────────────────────────────────────

    private fun emitPipelineCompleted(startTime: Long, iterations: Int, success: Boolean) {
        eventBridge.tryEmit(
            PipelineEvent.PipelineCompleted(
                pipelineId,
                success = success,
                durationMs = System.currentTimeMillis() - startTime,
                iterationsUsed = iterations,
            )
        )
    }

    // ── Composability API ───────────────────────────────────────────

    /**
     * Create a new pipeline with an additional stage appended.
     */
    fun withStage(stage: PipelineStage): OrchestrationPipeline {
        return OrchestrationPipeline(stages + stage, maxIterations, eventBridge, recoveryHandler)
    }

    /**
     * Create a new pipeline with a stage inserted at the given index.
     */
    fun withStageAt(index: Int, stage: PipelineStage): OrchestrationPipeline {
        val newStages = stages.toMutableList().apply { add(index, stage) }
        return OrchestrationPipeline(newStages, maxIterations, eventBridge, recoveryHandler)
    }

    /**
     * Create a new pipeline with a different max iterations setting.
     */
    fun withMaxIterations(max: Int): OrchestrationPipeline {
        return OrchestrationPipeline(stages, max, eventBridge, recoveryHandler)
    }

    /**
     * Create a new pipeline with a custom event bridge.
     */
    fun withEventBridge(bridge: PipelineEventBridge): OrchestrationPipeline {
        return OrchestrationPipeline(stages, maxIterations, bridge, recoveryHandler)
    }

    /**
     * Create a new pipeline with a custom recovery handler.
     */
    fun withRecoveryHandler(handler: StageRecoveryHandler): OrchestrationPipeline {
        return OrchestrationPipeline(stages, maxIterations, eventBridge, handler)
    }

    /**
     * Get a human-readable description of this pipeline.
     */
    fun describe(): String = buildString {
        appendLine("OrchestrationPipeline [$pipelineId] (maxIterations=$maxIterations)")
        stages.forEachIndexed { index, stage ->
            val retry = stage.retryPolicy?.let { " [retry:${it.maxAttempts}]" } ?: ""
            val cond = if (stage is ConditionalStage) " [conditional]" else ""
            appendLine("  ${index + 1}. [${stage.name}]$retry$cond ${stage.description}")
        }
    }

    companion object {
        /**
         * Create the default ROUTA → CRAFTER → GATE pipeline.
         *
         * This is the standard multi-agent orchestration workflow:
         * 1. **Planning**: ROUTA analyzes the request and creates @@@task blocks
         * 2. **Task Registration**: Parse tasks and store them
         * 3. **CRAFTER Execution**: Execute tasks with implementation agents
         * 4. **GATE Verification**: Verify work against acceptance criteria
         *
         * If GATE rejects, the pipeline repeats from CRAFTER Execution (up to maxIterations).
         */
        fun default(maxIterations: Int = 3): OrchestrationPipeline {
            return OrchestrationPipeline(
                stages = listOf(
                    PlanningStage(),
                    TaskRegistrationStage(),
                    CrafterExecutionStage(),
                    GateVerificationStage(),
                ),
                maxIterations = maxIterations,
            )
        }

        /**
         * Create a simple pipeline without verification.
         *
         * Useful for quick iterations where GATE verification is not needed.
         */
        fun withoutVerification(maxIterations: Int = 1): OrchestrationPipeline {
            return OrchestrationPipeline(
                stages = listOf(
                    PlanningStage(),
                    TaskRegistrationStage(),
                    CrafterExecutionStage(),
                ),
                maxIterations = maxIterations,
            )
        }
    }
}
