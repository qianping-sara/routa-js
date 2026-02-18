/**
 * OrchestrationPipeline - port of routa-core OrchestrationPipeline.kt
 *
 * A composable orchestration pipeline that executes PipelineStages in sequence.
 */

import { PipelineStage } from "../pipeline/pipeline-stage";
import { PipelineContext, emitPhase } from "../pipeline/pipeline-context";
import { StageResult, OrchestratorResult } from "../pipeline/stage-result";
import {
  PlanningStage,
  TaskRegistrationStage,
  CrafterExecutionStage,
  GateVerificationStage,
} from "../pipeline/stages";

/**
 * A composable orchestration pipeline.
 *
 * The pipeline is the control plane of the multi-agent workflow.
 * It owns the stage execution order, retry logic, and iteration control.
 */
export class OrchestrationPipeline {
  private stages: PipelineStage[];
  private maxIterations: number;
  private pipelineId: string;

  constructor(stages: PipelineStage[], maxIterations: number = 3) {
    this.stages = stages;
    this.maxIterations = maxIterations;
    this.pipelineId = Math.random().toString(36).substring(2, 10);
  }

  /**
   * Execute the pipeline with the given context.
   *
   * @param context The pipeline context containing system, provider, and configuration
   * @returns The final OrchestratorResult
   */
  async execute(context: PipelineContext): Promise<OrchestratorResult> {
    console.log(`[OrchestrationPipeline] Starting execution with ${this.stages.length} stages, maxIterations: ${this.maxIterations}`);
    const startTime = Date.now();
    let lastCompletedStage: string | null = null;
    let iterationsUsed = 0;

    // Track which stage triggered RepeatPipeline so we can resume from there
    let repeatFromIndex = 0;

    try {
      console.log(`[OrchestrationPipeline] Emitting 'initializing' phase`);
      await emitPhase(context, { type: "initializing" });

      for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
        console.log(`[OrchestrationPipeline] Starting iteration ${iteration}/${this.maxIterations}`);
        iterationsUsed = iteration;

        let shouldRepeat = false;

        // On iteration > 1, skip stages before the repeat point
        // (Planning + TaskRegistration should NOT re-run on fix waves)
        const startIndex = iteration > 1 ? repeatFromIndex : 0;
        const activeStages = this.stages.slice(startIndex);
        console.log(`[OrchestrationPipeline] Iteration ${iteration}: executing ${activeStages.length} stages (starting from index ${startIndex})`);

        for (const stage of activeStages) {
          console.log(`[OrchestrationPipeline] Executing stage: ${stage.name}`);
          const result = await this.executeStage(context, stage, iteration);
          console.log(`[OrchestrationPipeline] Stage ${stage.name} returned result type: ${result.type}`);

          switch (result.type) {
            case "continue":
              lastCompletedStage = stage.name;
              continue;

            case "skip_remaining":
              lastCompletedStage = stage.name;
              return result.result;

            case "repeat_pipeline":
              lastCompletedStage = stage.name;
              shouldRepeat = true;
              // Determine where to resume on the next iteration
              if (result.fromStageName) {
                const index = this.stages.findIndex(
                  (s) => s.name === result.fromStageName
                );
                repeatFromIndex = index >= 0 ? index : 0;
              } else {
                const index = this.stages.indexOf(stage);
                repeatFromIndex = index >= 0 ? index : 0;
              }
              break;

            case "done":
              lastCompletedStage = stage.name;
              return result.result;

            case "failed":
              return {
                type: "error",
                error: result.error,
                stage: stage.name,
              };
          }

          if (shouldRepeat) {
            break; // Exit stage loop, continue to next iteration
          }
        }

        if (!shouldRepeat) {
          // All stages completed without requesting repeat
          console.log(`[OrchestrationPipeline] Iteration ${iteration} completed without repeat request, breaking loop`);
          break;
        }
        console.log(`[OrchestrationPipeline] Iteration ${iteration} requested repeat, continuing to next iteration`);
      }

      // Max iterations reached
      console.log(`[OrchestrationPipeline] All iterations complete, fetching final task list`);
      const allTasks = await context.context.taskStore.listByWorkspace(
        context.workspaceId
      );
      const result = {
        type: "success" as const,
        taskSummaries: allTasks.map((t) => t.title),
        planOutput: context.planOutput,
      };
      console.log(`[OrchestrationPipeline] Execution complete in ${Date.now() - startTime}ms, result:`, result);
      return result;
    } catch (error) {
      console.error(`[OrchestrationPipeline] Execution failed:`, error);
      return {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
        stage: lastCompletedStage ?? undefined,
      };
    }
  }

  /**
   * Execute a single stage.
   */
  private async executeStage(
    context: PipelineContext,
    stage: PipelineStage,
    iteration: number
  ): Promise<StageResult> {
    return stage.execute(context);
  }

  /**
   * Create the default ROUTA → CRAFTER → GATE pipeline.
   *
   * @param maxIterations Maximum number of verification waves
   * @param useEnhancedRoutaPrompt Whether to inject full ROUTA system prompt
   */
  static default(maxIterations: number = 3, useEnhancedRoutaPrompt: boolean = true): OrchestrationPipeline {
    const planningStage = new PlanningStage();
    planningStage.useEnhancedPrompt = useEnhancedRoutaPrompt;

    return new OrchestrationPipeline(
      [
        planningStage,
        new TaskRegistrationStage(),
        new CrafterExecutionStage(),
        new GateVerificationStage(),
      ],
      maxIterations
    );
  }
}

