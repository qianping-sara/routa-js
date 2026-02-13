package com.phodal.routa.core.pipeline

import com.phodal.routa.core.runner.OrchestratorResult

/**
 * The outcome of a [PipelineStage] execution, controlling pipeline flow.
 *
 * Each variant tells the [OrchestrationPipeline] what to do next:
 * - [Continue]: proceed to the next stage
 * - [SkipRemaining]: skip all remaining stages and succeed
 * - [RepeatPipeline]: restart from the first stage (e.g., after fixes)
 * - [Done]: terminate with a final result
 * - [Failed]: terminate with an error
 *
 * ## Example: Gate finds issues → restart pipeline
 * ```kotlin
 * class GateVerificationStage : PipelineStage {
 *     override suspend fun execute(context: PipelineContext): StageResult {
 *         val issues = verifyTasks(context)
 *         return if (issues.isEmpty()) {
 *             StageResult.Done(OrchestratorResult.Success(taskSummaries))
 *         } else {
 *             resetFailedTasks(context)
 *             StageResult.RepeatPipeline
 *         }
 *     }
 * }
 * ```
 */
sealed class StageResult {

    /** Proceed to the next stage in the pipeline. */
    data object Continue : StageResult()

    /**
     * Skip all remaining stages and end the pipeline.
     *
     * Used when a stage determines the pipeline is done (e.g., all tasks
     * completed after crafter execution, no verification needed).
     */
    data class SkipRemaining(val result: OrchestratorResult) : StageResult()

    /**
     * Restart the pipeline from a specific stage (next iteration).
     *
     * Used when the Gate rejects work and tasks need to be re-executed.
     * The pipeline respects [OrchestrationPipeline.maxIterations] to prevent
     * infinite loops.
     *
     * @param fromStageName Optional: the name of the stage to restart from.
     *   If null, resumes from the stage that emitted this result.
     *   If set, resumes from the named stage (e.g., "crafter-execution").
     *   This prevents one-shot stages (Planning, TaskRegistration) from
     *   re-running on fix waves.
     */
    data class RepeatPipeline(val fromStageName: String? = null) : StageResult()

    /**
     * Terminate the pipeline with a final result.
     *
     * This is the normal completion signal — the pipeline stops and returns
     * the given [result] to the caller.
     */
    data class Done(val result: OrchestratorResult) : StageResult()

    /**
     * Terminate the pipeline with an error.
     *
     * @param error A human-readable description of what went wrong.
     */
    data class Failed(val error: String) : StageResult()
}
