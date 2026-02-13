package com.phodal.routa.core.pipeline

import java.io.IOException
import java.net.SocketTimeoutException

/**
 * Maps stage exceptions to recovery strategies.
 *
 * When a stage fails and retries are exhausted, the recovery handler decides
 * what the pipeline should do: skip the stage, fail the pipeline, or
 * produce a fallback result.
 *
 * This is the collaboration plane's error handling layer — it works alongside
 * the control plane's [RetryPolicy] (which handles transient retries) to
 * provide a complete error recovery strategy.
 *
 * ## Recovery hierarchy
 * ```
 * Exception
 *   ├── RetryPolicy handles → transient retries (control plane)
 *   │
 *   └── StageRecoveryHandler handles → post-retry recovery (collaboration plane)
 *       ├── Skip: skip this stage, continue pipeline
 *       ├── Fallback: produce a replacement StageResult
 *       └── Abort: fail the entire pipeline
 * ```
 *
 * ## Usage
 * ```kotlin
 * val recovery = StageRecoveryHandler.Builder()
 *     .onException<IOException>(RecoveryAction.Skip("Network unavailable"))
 *     .onException<TimeoutException>(RecoveryAction.Fallback(StageResult.Continue))
 *     .defaultAction(RecoveryAction.Abort)
 *     .build()
 *
 * // Used by OrchestrationPipeline when a stage fails after retries
 * val result = recovery.recover(stageName, exception)
 * ```
 */
class StageRecoveryHandler(
    private val handlers: Map<Class<out Throwable>, RecoveryAction>,
    private val defaultAction: RecoveryAction = RecoveryAction.Abort,
) {

    /**
     * Determine the recovery action for a failed stage.
     *
     * @param stageName The stage that failed (for logging).
     * @param error The exception that caused the failure.
     * @return The [RecoveryAction] to take.
     */
    fun recover(stageName: String, error: Throwable): RecoveryAction {
        // Check for exact match
        handlers[error::class.java]?.let { return it }

        // Check for superclass match
        for ((exceptionType, action) in handlers) {
            if (exceptionType.isAssignableFrom(error::class.java)) {
                return action
            }
        }

        return defaultAction
    }

    /**
     * Builder for creating [StageRecoveryHandler] instances.
     */
    class Builder {
        @PublishedApi
        internal val handlers = mutableMapOf<Class<out Throwable>, RecoveryAction>()
        private var defaultAction: RecoveryAction = RecoveryAction.Abort

        /**
         * Register a recovery action for a specific exception type.
         */
        inline fun <reified T : Throwable> onException(action: RecoveryAction): Builder {
            handlers[T::class.java] = action
            return this
        }

        /**
         * Set the default action when no handler matches.
         */
        fun defaultAction(action: RecoveryAction): Builder {
            defaultAction = action
            return this
        }

        fun build(): StageRecoveryHandler = StageRecoveryHandler(handlers, defaultAction)
    }

    companion object {
        /**
         * Default recovery handler for the standard pipeline.
         *
         * - Network errors → skip the stage (graceful degradation)
         * - All other errors → abort the pipeline
         */
        val DEFAULT = Builder()
            .onException<IOException>(RecoveryAction.Skip("Network error — stage skipped"))
            .onException<SocketTimeoutException>(RecoveryAction.Skip("Timeout — stage skipped"))
            .defaultAction(RecoveryAction.Abort)
            .build()
    }
}

/**
 * Actions the pipeline can take when a stage fails after retries.
 */
sealed class RecoveryAction {
    /** Skip this stage and continue with the next one. */
    data class Skip(val reason: String) : RecoveryAction()

    /** Use a fallback [StageResult] instead of the failed stage's output. */
    data class Fallback(val result: StageResult) : RecoveryAction()

    /** Abort the pipeline immediately. */
    data object Abort : RecoveryAction()
}
