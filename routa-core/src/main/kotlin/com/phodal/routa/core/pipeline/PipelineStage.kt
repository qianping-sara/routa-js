package com.phodal.routa.core.pipeline

/**
 * A single composable stage in the orchestration pipeline.
 *
 * Each stage encapsulates one phase of the multi-agent workflow (planning,
 * task registration, execution, verification). Stages are independent and
 * testable in isolation — they communicate via [PipelineContext] and return
 * a [StageResult] to signal what the pipeline should do next.
 *
 * ## Implementing a Custom Stage
 * ```kotlin
 * class CodeReviewStage : PipelineStage {
 *     override val name = "code-review"
 *     override val description = "Review code changes before verification"
 *
 *     override suspend fun execute(context: PipelineContext): StageResult {
 *         // ... review logic ...
 *         return StageResult.Continue
 *     }
 * }
 * ```
 *
 * ## Composing Stages into a Pipeline
 * ```kotlin
 * val pipeline = OrchestrationPipeline(listOf(
 *     PlanningStage(),
 *     TaskRegistrationStage(),
 *     CrafterExecutionStage(),
 *     CodeReviewStage(),         // ← custom stage inserted
 *     GateVerificationStage(),
 * ))
 * ```
 *
 * @see OrchestrationPipeline for how stages are executed.
 * @see PipelineContext for the shared state between stages.
 * @see StageResult for the possible outcomes of a stage.
 */
interface PipelineStage {

    /** Short identifier for this stage (e.g., "planning", "crafter-execution"). */
    val name: String

    /** Human-readable description of what this stage does. */
    val description: String

    /**
     * Optional retry policy for this stage.
     *
     * When non-null, the [OrchestrationPipeline] retries the stage on
     * retryable exceptions according to this policy before propagating failure.
     * When null, the stage fails immediately on any unhandled exception.
     *
     * @see RetryPolicy for configuring retry behavior.
     */
    val retryPolicy: RetryPolicy? get() = null

    /**
     * Execute this stage.
     *
     * Implementations should:
     * 1. Call [PipelineContext.ensureActive] before long-running operations
     * 2. Read inputs from [context] (stores, metadata, configuration)
     * 3. Perform the stage's work (calling providers, updating stores, etc.)
     * 4. Write outputs to [context] for downstream stages
     * 5. Return a [StageResult] to control pipeline flow
     *
     * @param context The shared pipeline context with stores, providers, and metadata.
     * @return A [StageResult] indicating what the pipeline should do next.
     */
    suspend fun execute(context: PipelineContext): StageResult
}
