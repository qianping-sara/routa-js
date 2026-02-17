/**
 * GateVerificationStage - port of routa-core GateVerificationStage.kt
 *
 * Stage 4: GATE Verification - Verifies completed work and decides next steps.
 */

import { AgentRole } from "../../models/agent";
import { TaskStatus } from "../../models/task";
import { PipelineStage } from "../pipeline-stage";
import { PipelineContext, emitPhase } from "../pipeline-context";
import { StageResult } from "../stage-result";

/**
 * Stage 4: GATE Verification
 *
 * This stage:
 * 1. Creates a GATE agent for tasks in REVIEW_REQUIRED status
 * 2. Builds verification context
 * 3. Runs the GATE agent to verify all completed work
 * 4. Checks the outcome:
 *    - All approved → pipeline completes
 *    - Some need fixes → resets tasks and repeats from CRAFTER
 *    - No verification needed → pipeline completes
 */
export class GateVerificationStage implements PipelineStage {
  name = "gate-verification";
  description = "Verifies completed work against acceptance criteria";

  async execute(context: PipelineContext): Promise<StageResult> {
    await emitPhase(context, {
      type: "verification_starting",
      waveNumber: context.waveNumber,
    });

    // Get tasks that need verification
    const reviewTasks = await context.context.taskStore.listByStatus(
      context.workspaceId,
      TaskStatus.REVIEW_REQUIRED
    );

    if (reviewTasks.length === 0) {
      // No tasks need verification — we're done
      await emitPhase(context, { type: "completed" });
      const allTasks = await context.context.taskStore.listByWorkspace(
        context.workspaceId
      );
      return StageResult.Done({
        type: "success",
        taskSummaries: allTasks.map((t) => t.title),
        planOutput: context.planOutput,
      });
    }

    // Create GATE agent
    const result = await context.context.agentTools.createAgent({
      name: `gate-wave-${context.waveNumber}`,
      role: AgentRole.GATE,
      workspaceId: context.workspaceId,
      parentId: context.routaAgentId,
    });

    if (!result.success || !result.data) {
      return StageResult.Failed("Failed to create GATE agent");
    }

    const gateAgentId = (result.data as { agentId: string }).agentId;
    context.gateAgentId = gateAgentId;

    // Build verification context
    const gatePrompt = await this.buildGatePrompt(context, reviewTasks);

    // Execute GATE
    const gateOutput = await context.provider.runStreaming(
      AgentRole.GATE,
      gateAgentId,
      gatePrompt,
      (chunk) => {
        if (context.onStreamChunk) {
          context.onStreamChunk(gateAgentId, chunk);
        }
      }
    );

    // Parse GATE verdict (simplified - just check for "APPROVED" keyword)
    const allApproved = gateOutput.toUpperCase().includes("APPROVED");

    if (allApproved) {
      // Mark all tasks as COMPLETED
      for (const task of reviewTasks) {
        await context.context.taskStore.save({
          ...task,
          status: TaskStatus.COMPLETED,
        });
      }

      await emitPhase(context, { type: "completed" });
      return StageResult.Done({
        type: "success",
        taskSummaries: reviewTasks.map((t) => t.title),
        planOutput: context.planOutput,
      });
    } else {
      // Some tasks need fixes — reset and repeat
      for (const task of reviewTasks) {
        await context.context.taskStore.save({
          ...task,
          status: TaskStatus.NEEDS_FIX,
        });
      }

      await emitPhase(context, {
        type: "needs_fix",
        waveNumber: context.waveNumber,
      });
      return StageResult.RepeatPipeline("crafter-execution");
    }
  }

  private async buildGatePrompt(
    context: PipelineContext,
    reviewTasks: any[]
  ): Promise<string> {
    const taskSummaries = reviewTasks
      .map(
        (task) => `
# ${task.title}

## Objective
${task.objective}

## Acceptance Criteria
${task.acceptanceCriteria.map((c: string) => `- ${c}`).join("\n")}

## Verification Commands
${task.verificationCommands.map((c: string) => `- ${c}`).join("\n")}
`.trim()
      )
      .join("\n\n---\n\n");

    return `
You are a GATE agent. Your role is to verify that the following tasks have been completed correctly.

For each task, check:
1. All acceptance criteria are met
2. Verification commands pass
3. Code quality is acceptable

${taskSummaries}

## Your Response

If all tasks are approved, respond with "✅ APPROVED".
If any tasks need fixes, respond with "❌ NEEDS FIX" and explain what needs to be fixed.
`.trim();
  }
}

