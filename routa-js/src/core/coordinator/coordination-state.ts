/**
 * CoordinationState - port of routa-core CoordinationState.kt
 *
 * Represents the state of the multi-agent coordination workflow.
 */

/**
 * The current phase of the coordination workflow.
 */
export enum CoordinationPhase {
  /** ROUTA is planning tasks from user request */
  PLANNING = "PLANNING",

  /** Tasks have been registered, ready to execute */
  READY = "READY",

  /** CRAFTER agents are executing tasks */
  EXECUTING = "EXECUTING",

  /** A wave of CRAFTERs has completed, ready for next wave or verification */
  WAVE_COMPLETE = "WAVE_COMPLETE",

  /** GATE agent is verifying completed work */
  VERIFYING = "VERIFYING",

  /** All tasks completed and verified */
  COMPLETED = "COMPLETED",

  /** Workflow encountered an error */
  ERROR = "ERROR",
}

/**
 * The coordination state machine state.
 */
export interface CoordinationState {
  /** The workspace being coordinated */
  workspaceId: string;

  /** The ROUTA (coordinator) agent ID */
  routaAgentId: string;

  /** Current workflow phase */
  phase: CoordinationPhase;

  /** IDs of all tasks in this coordination session */
  taskIds: string[];

  /** IDs of currently active CRAFTER agents */
  activeCrafterIds: string[];

  /** ID of the current GATE agent (if any) */
  gateAgentId?: string;

  /** Current wave number (for parallel execution) */
  waveNumber: number;

  /** Error message if phase is ERROR */
  error?: string;
}

/**
 * Create an initial coordination state.
 */
export function createCoordinationState(
  workspaceId: string,
  routaAgentId: string
): CoordinationState {
  return {
    workspaceId,
    routaAgentId,
    phase: CoordinationPhase.PLANNING,
    taskIds: [],
    activeCrafterIds: [],
    waveNumber: 0,
  };
}

