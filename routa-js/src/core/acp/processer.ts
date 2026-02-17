/**
 * AcpProcess - Manages an ACP-compliant agent child process
 *
 * Spawns any ACP agent CLI (opencode, gemini, codex-acp, auggie, copilot, etc.)
 * with piped stdio and communicates via JSON-RPC (NDJSON).
 *
 * Handles:
 *   - Sending JSON-RPC requests to the agent (stdin)
 *   - Parsing JSON-RPC responses/notifications from the agent (stdout)
 *   - Forwarding `session/update` notifications to the caller
 *   - Handling agent→client requests (fs, terminal, permissions) with auto-responses
 *
 * Provider selection is driven by AcpAgentPreset configurations.
 * See acp-presets.ts for available presets.
 */

import { type AcpAgentPreset, getPresetById, resolveCommand } from "./acp-presets";
import { which } from "./utils";
import { AcpProcess } from "@/core/acp/acp-process";
import { AcpProcessManager } from "@/core/acp/acp-process-manager";

export type NotificationHandler = (msg: JsonRpcMessage) => void;

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Configuration for creating an AcpProcess.
 * Can be created from a preset or custom command.
 */
export interface AcpProcessConfig {
  /** The preset being used (if any) */
  preset?: AcpAgentPreset;
  /** Resolved command to execute */
  command: string;
  /** Command-line arguments (preset args + any additional args like --cwd) */
  args: string[];
  /** Working directory */
  cwd: string;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Display name for logging */
  displayName: string;
}

/**
 * Build an AcpProcessConfig from a preset ID and working directory.
 * Resolves the command via PATH (which) when not set by env override, so the
 * server can find the binary even if it's not in the same PATH as the shell.
 */
export async function buildConfigFromPreset(
  presetId: string,
  cwd: string,
  extraArgs?: string[],
  extraEnv?: Record<string, string>
): Promise<AcpProcessConfig> {
  const preset = getPresetById(presetId);
  if (!preset) {
    throw new Error(
      `Unknown ACP preset: "${presetId}". Use one of: opencode, gemini, codex, copilot, auggie, kimi`
    );
  }
  if (preset.nonStandardApi) {
    throw new Error(
      `Preset "${presetId}" uses a non-standard API and is not supported by AcpProcess. ` +
        `It requires a separate implementation.`
    );
  }

  let command = resolveCommand(preset);
  const isAbsolute = command.startsWith("/") || (process.platform === "win32" && /^[a-zA-Z]:[\\/]/.test(command));
  if (!isAbsolute) {
    const resolved = await which(command);
    if (resolved) command = resolved;
  }

  const args = [...preset.args];

  // Append --cwd if the preset uses positional cwd (like opencode)
  // For others, we rely on the process cwd
  if (preset.id === "opencode") {
    args.push("--cwd", cwd);
  }

  if (extraArgs) {
    args.push(...extraArgs);
  }

  return {
    preset,
    command,
    args,
    cwd,
    env: extraEnv,
    displayName: preset.name,
  };
}

/**
 * Build a default config (opencode) for backward compatibility.
 */
export async function buildDefaultConfig(cwd: string): Promise<AcpProcessConfig> {
  return buildConfigFromPreset("opencode", cwd);
}

// ─── Backward-compatible alias ─────────────────────────────────────────

/**
 * @deprecated Use `AcpProcess` instead. This alias exists for backward compatibility.
 */
export const Processer = AcpProcess;

// ─── Process Manager (manages multiple ACP agent processes) ────────────

export interface ManagedProcess {
  process: AcpProcess;
  acpSessionId: string; // Session ID from the agent
  presetId: string; // Which preset was used
  createdAt: Date;
}

// ─── Singleton Manager ─────────────────────────────────────────────────

// Singleton instance - initialized lazily to avoid circular dependency
let singleton: any | undefined;

/**
 * Get the singleton AcpProcessManager instance.
 */
export function getAcpProcessManager(): any {
  if (!singleton) {
    // Import dynamically to avoid circular dependency
    const { AcpProcessManager } = require('./acp-process-manager');
    singleton = new AcpProcessManager();
  }
  return singleton;
}

/**
 * @deprecated Use `getAcpProcessManager()` instead. This alias exists for backward compatibility.
 */
export const getOpenCodeProcessManager = getAcpProcessManager;
