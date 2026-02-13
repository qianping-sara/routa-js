package com.phodal.routa.core.pipeline

import com.phodal.routa.core.event.AgentEvent
import java.time.Instant

/**
 * Events emitted by the orchestration pipeline lifecycle.
 *
 * These events provide fine-grained observability into the pipeline's
 * control flow — separate from [AgentEvent]s which represent agent-level
 * activity. Together they form the **collaboration plane**.
 *
 * ## Architecture
 * ```
 *   ┌─────────────────────────────────────────┐
 *   │           Control Plane                  │
 *   │  OrchestrationPipeline → StageResult     │
 *   └──────────────┬──────────────────────────┘
 *                  │ emits PipelineEvent
 *                  ▼
 *   ┌─────────────────────────────────────────┐
 *   │        Collaboration Plane               │
 *   │  EventBus ← PipelineEventBridge          │
 *   │  Subscribers (UI, metrics, recovery)     │
 *   └─────────────────────────────────────────┘
 * ```
 *
 * ## Listening
 * ```kotlin
 * eventBus.subscribeTo<PipelineEvent.StageCompleted> { event ->
 *     logger.info("Stage ${event.stageName} took ${event.durationMs}ms")
 * }
 * ```
 */
sealed class PipelineEvent {

    /** Timestamp when this event was created. */
    abstract val timestamp: Instant

    // ── Pipeline lifecycle ──────────────────────────────────────────

    /** Pipeline execution started. */
    data class PipelineStarted(
        val pipelineId: String,
        val stageCount: Int,
        val maxIterations: Int,
        override val timestamp: Instant = Instant.now(),
    ) : PipelineEvent()

    /** Pipeline execution completed (success or failure). */
    data class PipelineCompleted(
        val pipelineId: String,
        val success: Boolean,
        val durationMs: Long,
        val iterationsUsed: Int,
        override val timestamp: Instant = Instant.now(),
    ) : PipelineEvent()

    /** Pipeline was cancelled by the user or parent coroutine. */
    data class PipelineCancelled(
        val pipelineId: String,
        val reason: String,
        val lastCompletedStage: String?,
        override val timestamp: Instant = Instant.now(),
    ) : PipelineEvent()

    // ── Stage lifecycle ────────────────────────────────────────────

    /** A stage started execution. */
    data class StageStarted(
        val pipelineId: String,
        val stageName: String,
        val iteration: Int,
        override val timestamp: Instant = Instant.now(),
    ) : PipelineEvent()

    /** A stage completed successfully. */
    data class StageCompleted(
        val pipelineId: String,
        val stageName: String,
        val result: StageResult,
        val durationMs: Long,
        val iteration: Int,
        override val timestamp: Instant = Instant.now(),
    ) : PipelineEvent()

    /** A stage failed with an exception. */
    data class StageFailed(
        val pipelineId: String,
        val stageName: String,
        val error: String,
        val attempt: Int,
        val willRetry: Boolean,
        val iteration: Int,
        override val timestamp: Instant = Instant.now(),
    ) : PipelineEvent()

    /** A stage was skipped (by ConditionalStage). */
    data class StageSkipped(
        val pipelineId: String,
        val stageName: String,
        val reason: String,
        val iteration: Int,
        override val timestamp: Instant = Instant.now(),
    ) : PipelineEvent()

    // ── Iteration lifecycle ────────────────────────────────────────

    /** A new pipeline iteration started (e.g., GATE requested fixes). */
    data class IterationStarted(
        val pipelineId: String,
        val iteration: Int,
        val maxIterations: Int,
        override val timestamp: Instant = Instant.now(),
    ) : PipelineEvent()
}
