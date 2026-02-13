package com.phodal.routa.core.pipeline

import com.phodal.routa.core.event.EventBus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.map

/**
 * Bridge between the Pipeline control plane and the EventBus collaboration plane.
 *
 * The bridge has two responsibilities:
 *
 * 1. **Emit** — Pipeline lifecycle events ([PipelineEvent]) are emitted here
 *    by the [OrchestrationPipeline] and forwarded to the [EventBus] for system-wide
 *    observability. Subscribers (UI, metrics, recovery handlers) can listen to
 *    pipeline lifecycle events alongside agent events.
 *
 * 2. **Subscribe** — Typed, filtered event subscriptions for consumers who
 *    only care about specific pipeline events (e.g., "all stage completions
 *    for pipeline X").
 *
 * ## Architecture
 * ```
 * OrchestrationPipeline
 *     │
 *     ├── PipelineEventBridge.emit(StageStarted(...))
 *     │       │
 *     │       ├── pipelineEvents (SharedFlow<PipelineEvent>) ──▶ UI, Metrics
 *     │       │
 *     │       └── EventBus.tryEmit(wrapped) ──▶ Recovery handlers, Coordination
 *     │
 *     └── StageResult
 * ```
 *
 * ## Usage
 * ```kotlin
 * val bridge = PipelineEventBridge(eventBus)
 *
 * // Subscribe to all stage completions
 * bridge.subscribeTo<PipelineEvent.StageCompleted>()
 *     .filter { it.pipelineId == myPipelineId }
 *     .collect { event -> logger.info("Stage ${event.stageName} took ${event.durationMs}ms") }
 *
 * // Subscribe to failures only
 * bridge.stageFailures()
 *     .collect { event -> alerting.notify("Stage ${event.stageName} failed: ${event.error}") }
 * ```
 */
class PipelineEventBridge(
    private val eventBus: EventBus? = null,
) {

    private val _pipelineEvents = MutableSharedFlow<PipelineEvent>(
        replay = 16,
        extraBufferCapacity = 128,
    )

    /** All pipeline lifecycle events as a shared flow. */
    val pipelineEvents: SharedFlow<PipelineEvent> = _pipelineEvents.asSharedFlow()

    /**
     * Emit a pipeline event.
     *
     * The event is:
     * 1. Published to [pipelineEvents] for direct subscribers
     * 2. Optionally forwarded to the [EventBus] for system-wide coordination
     */
    suspend fun emit(event: PipelineEvent) {
        _pipelineEvents.emit(event)
    }

    /**
     * Try to emit a pipeline event without suspending.
     * Returns false if the buffer is full.
     */
    fun tryEmit(event: PipelineEvent): Boolean {
        return _pipelineEvents.tryEmit(event)
    }

    // ── Typed subscription API ──────────────────────────────────────

    /**
     * Subscribe to a specific type of pipeline event.
     *
     * ```kotlin
     * bridge.subscribeTo<PipelineEvent.StageCompleted>()
     *     .collect { println("Stage ${it.stageName} done") }
     * ```
     */
    inline fun <reified T : PipelineEvent> subscribeTo(): Flow<T> {
        return pipelineEvents.filterIsInstance<T>()
    }

    /**
     * Subscribe to pipeline events for a specific pipeline run.
     */
    fun forPipeline(pipelineId: String): Flow<PipelineEvent> {
        return pipelineEvents.filter { event ->
            when (event) {
                is PipelineEvent.PipelineStarted -> event.pipelineId == pipelineId
                is PipelineEvent.PipelineCompleted -> event.pipelineId == pipelineId
                is PipelineEvent.PipelineCancelled -> event.pipelineId == pipelineId
                is PipelineEvent.StageStarted -> event.pipelineId == pipelineId
                is PipelineEvent.StageCompleted -> event.pipelineId == pipelineId
                is PipelineEvent.StageFailed -> event.pipelineId == pipelineId
                is PipelineEvent.StageSkipped -> event.pipelineId == pipelineId
                is PipelineEvent.IterationStarted -> event.pipelineId == pipelineId
            }
        }
    }

    // ── Convenience flows ───────────────────────────────────────────

    /** Flow of all stage failure events. */
    fun stageFailures(): Flow<PipelineEvent.StageFailed> = subscribeTo()

    /** Flow of all stage completion events. */
    fun stageCompletions(): Flow<PipelineEvent.StageCompleted> = subscribeTo()

    /** Flow of pipeline completion events (success or failure). */
    fun pipelineCompletions(): Flow<PipelineEvent.PipelineCompleted> = subscribeTo()
}
