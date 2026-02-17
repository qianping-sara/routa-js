/**
 * CrafterExecutionStage - port of routa-core CrafterExecutionStage.kt
 *
 * Stage 3: CRAFTER Execution - Executes all ready tasks with CRAFTER agents.
 */

import { AgentRole } from "../../models/agent";
import { TaskStatus } from "../../models/task";
import { PipelineStage } from "../pipeline-stage";
import { PipelineContext, emitPhase } from "../pipeline-context";
import { StageResult } from "../stage-result";
import { CoordinationPhase } from "../../coordinator/coordination-state";

/**
 * Stage 3: CRAFTER Execution
 *
 * This stage:
 * 1. Gets the next wave of ready tasks from the coordinator
 * 2. Creates CRAFTER agents for each task
 * 3. Builds context for each CRAFTER
 * 4. Runs CRAFTERs (sequentially or in parallel)
 * 5. Marks tasks as REVIEW_REQUIRED when complete
 */
export class CrafterExecutionStage implements PipelineStage {
  name = "crafter-execution";
  description = "Executes ready tasks with CRAFTER agents";

  async execute(context: PipelineContext): Promise<StageResult> {
    context.waveNumber = context.waveNumber + 1;
    await emitPhase(context, {
      type: "wave_starting",
      waveNumber: context.waveNumber,
    });

    // Get ready tasks
    const readyTasks = await context.context.taskStore.findReadyTasks(
      context.workspaceId
    );

    if (readyTasks.length === 0) {
      // Check if all tasks are completed
      const allTasks = await context.context.taskStore.listByWorkspace(
        context.workspaceId
      );
      if (allTasks.every((t) => t.status === TaskStatus.COMPLETED)) {
        await emitPhase(context, { type: "completed" });
        return StageResult.SkipRemaining({
          type: "success",
          taskSummaries: allTasks.map((t) => t.title),
          planOutput: context.planOutput,
        });
      }
      // Nothing to do but not completed — continue to next stage
      return StageResult.Continue();
    }

    const delegations: Array<[string, string]> = [];

    // Execute each task
    for (const task of readyTasks) {
      // Create CRAFTER agent
      const crafterName = `crafter-${task.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`;

      const result = await context.context.agentTools.createAgent({
        name: crafterName,
        role: AgentRole.CRAFTER,
        workspaceId: context.workspaceId,
        parentId: context.routaAgentId,
      });

      if (!result.success || !result.data) {
        continue;
      }

      const agentId = (result.data as { agentId: string }).agentId;

      // Build task context
      const taskPrompt = this.buildTaskPrompt(task);

      // Execute CRAFTER
      await context.provider.runStreaming(
        AgentRole.CRAFTER,
        agentId,
        taskPrompt,
        (chunk) => {
          if (context.onStreamChunk) {
            context.onStreamChunk(agentId, chunk);
          }
        }
      );

      // Mark task as REVIEW_REQUIRED
      await context.context.taskStore.save({
        ...task,
        status: TaskStatus.REVIEW_REQUIRED,
      });

      delegations.push([agentId, task.id]);
    }

    context.delegations = delegations;
    await emitPhase(context, {
      type: "wave_complete",
      waveNumber: context.waveNumber,
    });

    return StageResult.Continue();
  }

  private buildTaskPrompt(task: any): string {
    return `
You are a CRAFTER agent. Your role is to implement the following task:

# ${task.title}

## Objective
${task.objective}

## Scope
${task.scope}

## Acceptance Criteria
${task.acceptanceCriteria.map((c: string) => `- ${c}`).join("\n")}

## Verification Commands
${task.verificationCommands.map((c: string) => `- ${c}`).join("\n")}

Please implement this task and ensure all acceptance criteria are met.
`.trim();
  }
}

