/**
 * RoutaOrchestrator - port of routa-core RoutaOrchestrator.kt
 *
 * The multi-agent orchestration entry point.
 */

import { AgentProvider, StreamChunk } from "../provider/agent-provider";
import { AgentExecutionContext } from "../coordinator/routa-coordinator";
import {
  PipelineContext,
  createPipelineContext,
  OrchestratorPhase,
} from "../pipeline/pipeline-context";
import { OrchestrationPipeline } from "./orchestration-pipeline";
import { OrchestratorResult } from "../pipeline/stage-result";

/**
 * Configuration for the orchestrator.
 */
export interface OrchestratorConfig {
  /** The agent execution context (stores, tools, event bus) */
  context: AgentExecutionContext;

  /** The agent execution provider */
  provider: AgentProvider;

  /** The workspace identifier */
  workspaceId: string;

  /** Maximum pipeline iterations (default: 3) */
  maxWaves?: number;

  /** Whether CRAFTERs execute in parallel within a wave */
  parallelCrafters?: boolean;

  /** Callback for orchestration phase changes */
  onPhaseChange?: (phase: OrchestratorPhase) => void | Promise<void>;

  /** Callback for agent streaming chunks */
  onStreamChunk?: (agentId: string, chunk: StreamChunk) => void;

  /** Custom pipeline (if null, uses default) */
  pipeline?: OrchestrationPipeline;
}

/**
 * The multi-agent orchestration entry point.
 *
 * Delegates to a composable OrchestrationPipeline that executes
 * independent, testable stages in sequence. The default pipeline
 * implements the full ROUTA → CRAFTER → GATE workflow:
 *
 * ```
 * User Request
 *   → [PlanningStage] ROUTA plans (@@@task blocks)
 *     → [TaskRegistrationStage] Parse and register tasks
 *       → [CrafterExecutionStage] CRAFTER agents execute tasks
 *         → [GateVerificationStage] GATE verifies work
 *           → APPROVED: done
 *           → NOT APPROVED: repeat from CrafterExecution
 * ```
 */
export class RoutaOrchestrator {
  private context: AgentExecutionContext;
  private provider: AgentProvider;
  private workspaceId: string;
  private maxWaves: number;
  private parallelCrafters: boolean;
  private onPhaseChange?: (phase: OrchestratorPhase) => void | Promise<void>;
  private onStreamChunk?: (agentId: string, chunk: StreamChunk) => void;
  private pipeline: OrchestrationPipeline;

  constructor(config: OrchestratorConfig) {
    this.context = config.context;
    this.provider = config.provider;
    this.workspaceId = config.workspaceId;
    this.maxWaves = config.maxWaves ?? 3;
    this.parallelCrafters = config.parallelCrafters ?? false;
    this.onPhaseChange = config.onPhaseChange;
    this.onStreamChunk = config.onStreamChunk;
    this.pipeline =
      config.pipeline ?? OrchestrationPipeline.default(this.maxWaves);
  }

  /**
   * Execute the full multi-agent orchestration flow.
   *
   * Creates a PipelineContext and delegates execution to the OrchestrationPipeline.
   *
   * @param userRequest The user's requirement/task description
   * @returns The orchestration result
   */
  async execute(userRequest: string): Promise<OrchestratorResult> {
    const pipelineContext = createPipelineContext({
      context: this.context,
      provider: this.provider,
      workspaceId: this.workspaceId,
      userRequest,
      parallelCrafters: this.parallelCrafters,
      onPhaseChange: this.onPhaseChange,
      onStreamChunk: this.onStreamChunk,
    });

    return this.pipeline.execute(pipelineContext);
  }
}

