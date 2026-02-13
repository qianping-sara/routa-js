package com.phodal.routa.core.pipeline

import kotlinx.coroutines.delay
import java.io.IOException
import java.net.SocketTimeoutException

/**
 * Retry policy for individual pipeline stages.
 *
 * When a stage throws a retryable exception, the pipeline executor retries
 * the stage according to this policy before propagating the failure.
 *
 * ## Default behavior
 * - Retries on network errors ([IOException], [SocketTimeoutException])
 * - 3 attempts with exponential backoff (1s → 2s → 4s)
 * - Does NOT retry on [CancellationException] or [IllegalArgumentException]
 *
 * ## Usage
 * ```kotlin
 * // Stage with custom retry
 * class FlakyCrafterStage : PipelineStage {
 *     override val retryPolicy = RetryPolicy(maxAttempts = 5, baseDelayMs = 500)
 *     // ...
 * }
 *
 * // Explicitly no retry
 * class PlanningStage : PipelineStage {
 *     override val retryPolicy = RetryPolicy.NONE
 *     // ...
 * }
 * ```
 */
data class RetryPolicy(
    /** Maximum number of attempts (including the first try). */
    val maxAttempts: Int = 3,

    /** Base delay between retries in milliseconds. */
    val baseDelayMs: Long = 1000,

    /** Multiplier applied to delay after each retry (exponential backoff). */
    val backoffMultiplier: Double = 2.0,

    /** Maximum delay cap in milliseconds. */
    val maxDelayMs: Long = 30_000,

    /** Predicate that determines if an exception is retryable. */
    val retryOn: (Throwable) -> Boolean = ::isDefaultRetryable,
) {
    companion object {
        /** No retries — fail immediately on any error. */
        val NONE = RetryPolicy(maxAttempts = 1)

        /** Default retryable exception check. */
        fun isDefaultRetryable(e: Throwable): Boolean = when (e) {
            is kotlinx.coroutines.CancellationException -> false
            is IllegalArgumentException -> false
            is IllegalStateException -> false
            is IOException -> true
            is SocketTimeoutException -> true
            else -> {
                // Retry on provider/network errors hinted by message
                val msg = e.message?.lowercase() ?: ""
                msg.contains("timeout") ||
                    msg.contains("connection") ||
                    msg.contains("rate limit") ||
                    msg.contains("503") ||
                    msg.contains("429")
            }
        }
    }
}

/**
 * Execute a suspending block with retry according to the given [policy].
 *
 * Returns the result on success, or throws the last exception if all retries
 * are exhausted.
 */
suspend fun <T> retryWithPolicy(
    policy: RetryPolicy,
    stageName: String = "",
    block: suspend () -> T,
): T {
    var lastException: Throwable? = null
    var currentDelay = policy.baseDelayMs

    for (attempt in 1..policy.maxAttempts) {
        try {
            return block()
        } catch (e: Throwable) {
            lastException = e

            // Don't retry if not retryable or last attempt
            if (!policy.retryOn(e) || attempt == policy.maxAttempts) {
                throw e
            }

            // Exponential backoff
            delay(currentDelay)
            currentDelay = (currentDelay * policy.backoffMultiplier).toLong()
                .coerceAtMost(policy.maxDelayMs)
        }
    }

    throw lastException ?: IllegalStateException("Retry exhausted for stage '$stageName'")
}
