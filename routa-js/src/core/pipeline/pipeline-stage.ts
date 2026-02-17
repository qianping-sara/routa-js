/**
 * PipelineStage - port of routa-core PipelineStage.kt
 *
 * Base interface for pipeline stages in the orchestration workflow.
 */

import { PipelineContext } from "./pipeline-context";
import { StageResult } from "./stage-result";

/**
 * A single stage in the orchestration pipeline.
 *
 * Stages are composable, testable units that execute in sequence.
 * Each stage reads from and writes to the shared PipelineContext.
 */
export interface PipelineStage {
  /** Unique stage identifier */
  name: string;

  /** Human-readable description */
  description: string;

  /**
   * Execute this stage.
   *
   * @param context The shared pipeline context
   * @returns The stage result controlling pipeline flow
   */
  execute(context: PipelineContext): Promise<StageResult>;
}

