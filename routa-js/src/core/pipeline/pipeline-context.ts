/**
 * PipelineContext - port of routa-core PipelineContext.kt
 *
 * Shared context flowing through all pipeline stages.
 */

import { AgentProvider, StreamChunk } from "../provider/agent-provider";
import { AgentExecutionContext } from "../coordinator/routa-coordinator";

/**
 * Orchestrator phase types
 */
export type OrchestratorPhase =
  | { type: "initializing" }
  | { type: "planning" }
  | { type: "plan_ready"; planOutput: string }
  | { type: "tasks_registered"; count: number }
  | { type: "wave_starting"; waveNumber: number }
  | { type: "wave_complete"; waveNumber: number }
  | { type: "verification_starting"; waveNumber: number }
  | { type: "needs_fix"; waveNumber: number }
  | { type: "completed" };

/**
 * Shared context for pipeline execution.
 *
 * This is the communication channel between stages.
 */
export interface PipelineContext {
  /** The agent execution context (stores, tools, event bus) */
  context: AgentExecutionContext;

  /** The agent execution provider */
  provider: AgentProvider;

  /** The workspace identifier */
  workspaceId: string;

  /** The original user request */
  userRequest: string;

  /** Whether to execute CRAFTERs in parallel */
  parallelCrafters: boolean;

  /** Callback for phase changes */
  onPhaseChange?: (phase: OrchestratorPhase) => void | Promise<void>;

  /** Callback for streaming chunks */
  onStreamChunk?: (agentId: string, chunk: StreamChunk) => void;

  // ── Mutable state (written by stages) ──

  /** The ROUTA agent's ID */
  routaAgentId: string;

  /** The raw plan output from ROUTA */
  planOutput: string;

  /** List of task IDs created */
  taskIds: string[];

  /** Current wave number */
  waveNumber: number;

  /** List of (agentId, taskId) delegations */
  delegations: Array<[string, string]>;

  /** The GATE agent's ID */
  gateAgentId?: string;

  /** Metadata for custom stage communication */
  metadata: Map<string, unknown>;
}

/**
 * Create a new pipeline context.
 */
export function createPipelineContext(params: {
  context: AgentExecutionContext;
  provider: AgentProvider;
  workspaceId: string;
  userRequest: string;
  parallelCrafters?: boolean;
  onPhaseChange?: (phase: OrchestratorPhase) => void | Promise<void>;
  onStreamChunk?: (agentId: string, chunk: StreamChunk) => void;
}): PipelineContext {
  return {
    context: params.context,
    provider: params.provider,
    workspaceId: params.workspaceId,
    userRequest: params.userRequest,
    parallelCrafters: params.parallelCrafters ?? false,
    onPhaseChange: params.onPhaseChange,
    onStreamChunk: params.onStreamChunk,
    routaAgentId: "",
    planOutput: "",
    taskIds: [],
    waveNumber: 0,
    delegations: [],
    metadata: new Map(),
  };
}

/**
 * Helper to emit phase changes
 */
export async function emitPhase(
  context: PipelineContext,
  phase: OrchestratorPhase
): Promise<void> {
  if (context.onPhaseChange) {
    await context.onPhaseChange(phase);
  }
}

