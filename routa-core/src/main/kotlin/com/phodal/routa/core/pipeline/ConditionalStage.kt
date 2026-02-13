package com.phodal.routa.core.pipeline

/**
 * A stage decorator that only executes when a runtime condition is met.
 *
 * This enables dynamic pipeline behavior without modifying stage implementations.
 * When the [condition] returns `false`, the stage is skipped and the pipeline
 * continues to the next stage.
 *
 * ## Use Cases
 * - Skip GATE verification for trivial tasks
 * - Add code review only when task count > N
 * - Enable debug stages only in development mode
 *
 * ## Usage
 * ```kotlin
 * val pipeline = OrchestrationPipeline(listOf(
 *     PlanningStage(),
 *     TaskRegistrationStage(),
 *     CrafterExecutionStage(),
 *     ConditionalStage(
 *         condition = { ctx -> ctx.taskIds.size > 1 },
 *         stage = CodeReviewStage(),
 *     ),
 *     GateVerificationStage(),
 * ))
 * ```
 *
 * @param condition Evaluated at runtime. Returns `true` to run the stage.
 * @param stage The stage to execute when the condition holds.
 */
class ConditionalStage(
    private val condition: suspend (PipelineContext) -> Boolean,
    private val stage: PipelineStage,
) : PipelineStage {

    override val name: String
        get() = "conditional:${stage.name}"

    override val description: String
        get() = "Conditionally runs [${stage.name}]: ${stage.description}"

    override val retryPolicy: RetryPolicy?
        get() = stage.retryPolicy

    override suspend fun execute(context: PipelineContext): StageResult {
        return if (condition(context)) {
            stage.execute(context)
        } else {
            StageResult.Continue
        }
    }
}
