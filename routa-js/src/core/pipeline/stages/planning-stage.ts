/**
 * PlanningStage - port of routa-core PlanningStage.kt
 *
 * Stage 1: ROUTA Planning - Creates the coordinator agent and generates the plan.
 */

import { AgentRole } from "../../models/agent";
import { PipelineStage } from "../pipeline-stage";
import { PipelineContext, emitPhase } from "../pipeline-context";
import { StageResult } from "../stage-result";

/**
 * Stage 1: ROUTA Planning
 *
 * This stage:
 * 1. Initializes the coordinator (creates ROUTA agent)
 * 2. Builds the planning prompt
 * 3. Executes ROUTA via the provider
 * 4. Stores the plan output in context
 */
export class PlanningStage implements PipelineStage {
  name = "planning";
  description = "ROUTA analyzes the request and creates @@@task blocks";

  async execute(context: PipelineContext): Promise<StageResult> {
    await emitPhase(context, { type: "planning" });

    // Initialize the coordinator — creates the ROUTA agent
    const routaAgentId = await context.context.agentStore
      .listByWorkspace(context.workspaceId)
      .then((agents) => agents.find((a) => a.role === AgentRole.ROUTA)?.id);

    if (!routaAgentId) {
      // Create ROUTA agent if it doesn't exist
      const result = await context.context.agentTools.createAgent({
        name: `routa-${Date.now()}`,
        role: AgentRole.ROUTA,
        workspaceId: context.workspaceId,
      });

      if (!result.success || !result.data) {
        return StageResult.Failed("Failed to create ROUTA agent");
      }

      context.routaAgentId = (result.data as { agentId: string }).agentId;
    } else {
      context.routaAgentId = routaAgentId;
    }

    // Build the planning prompt
    const planPrompt = this.buildPlanPrompt(context.userRequest);

    // Execute ROUTA via streaming provider
    const planOutput = await context.provider.runStreaming(
      AgentRole.ROUTA,
      context.routaAgentId,
      planPrompt,
      (chunk) => {
        if (context.onStreamChunk) {
          context.onStreamChunk(context.routaAgentId, chunk);
        }
      }
    );

    context.planOutput = planOutput;
    await emitPhase(context, { type: "plan_ready", planOutput });

    return StageResult.Continue();
  }

  private buildPlanPrompt(userRequest: string): string {
    return `
You are ROUTA, the planning coordinator in a multi-agent development system.

Your role is to:
1. Analyze the user's request
2. Break it down into concrete, actionable tasks
3. Output each task in the @@@task format

## Task Format

Each task must be wrapped in @@@task ... @@@ markers:

\`\`\`
@@@task
# Task Title

## Objective
Clear statement of what needs to be done

## Scope
- file1.ts
- file2.ts

## Definition of Done
- Acceptance criteria 1
- Acceptance criteria 2

## Verification
- npm test
@@@
\`\`\`

## User Request

${userRequest}

## Your Response

Analyze the request and create @@@task blocks for each task.
`.trim();
  }
}

