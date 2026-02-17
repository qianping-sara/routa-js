/**
 * TaskRegistrationStage - port of routa-core TaskRegistrationStage.kt
 *
 * Stage 2: Task Registration - Parses @@@task blocks and registers them.
 */

import { PipelineStage } from "../pipeline-stage";
import { PipelineContext, emitPhase } from "../pipeline-context";
import { StageResult } from "../stage-result";
import { parseTaskBlocks } from "../../coordinator/task-parser";

/**
 * Stage 2: Task Registration
 *
 * This stage:
 * 1. Parses @@@task blocks from the plan output
 * 2. Registers tasks in the task store
 * 3. Stores task IDs in context
 */
export class TaskRegistrationStage implements PipelineStage {
  name = "task-registration";
  description = "Parses @@@task blocks from the plan and registers them";

  async execute(context: PipelineContext): Promise<StageResult> {
    const planOutput = context.planOutput;
    if (!planOutput || planOutput.trim().length === 0) {
      return StageResult.Failed(
        "No plan output available — planning stage may have failed"
      );
    }

    // Parse tasks from plan output
    const tasks = parseTaskBlocks(planOutput, context.workspaceId);

    if (tasks.length === 0) {
      return StageResult.Done({
        type: "no_tasks",
        planOutput,
      });
    }

    // Register tasks in the store
    for (const task of tasks) {
      await context.context.taskStore.save(task);
    }

    context.taskIds = tasks.map((t) => t.id);
    await emitPhase(context, {
      type: "tasks_registered",
      count: tasks.length,
    });

    return StageResult.Continue();
  }
}

