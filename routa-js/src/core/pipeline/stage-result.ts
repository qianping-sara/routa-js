/**
 * StageResult - port of routa-core StageResult.kt
 *
 * The outcome of a PipelineStage execution, controlling pipeline flow.
 */

/**
 * Orchestrator result types
 */
export type OrchestratorResult =
  | { type: "success"; taskSummaries: string[]; planOutput: string }
  | { type: "no_tasks"; planOutput: string }
  | { type: "error"; error: string; stage?: string };

/**
 * The outcome of a stage execution.
 */
export type StageResult =
  | { type: "continue" }
  | { type: "skip_remaining"; result: OrchestratorResult }
  | { type: "repeat_pipeline"; fromStageName?: string }
  | { type: "done"; result: OrchestratorResult }
  | { type: "failed"; error: string };

/**
 * Helper functions to create stage results
 */
export const StageResult = {
  Continue: (): StageResult => ({ type: "continue" }),

  SkipRemaining: (result: OrchestratorResult): StageResult => ({
    type: "skip_remaining",
    result,
  }),

  RepeatPipeline: (fromStageName?: string): StageResult => ({
    type: "repeat_pipeline",
    fromStageName,
  }),

  Done: (result: OrchestratorResult): StageResult => ({
    type: "done",
    result,
  }),

  Failed: (error: string): StageResult => ({
    type: "failed",
    error,
  }),
};

