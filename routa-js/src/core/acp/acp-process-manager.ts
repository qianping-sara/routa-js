import { AcpProcess } from "@/core/acp/acp-process";
import { buildConfigFromPreset, ManagedProcess, NotificationHandler } from "@/core/acp/processer";
import { ClaudeCodeProcess, buildClaudeCodeConfig } from "@/core/acp/claude-code-process";
import { AcpRemoteConnection } from "@/core/acp/acp-remote-connection";

/**
 * A managed Claude Code process (separate from standard ACP).
 */
export interface ManagedClaudeProcess {
    process: ClaudeCodeProcess;
    acpSessionId: string;
    presetId: string;
    createdAt: Date;
}

/** Handle for a remote ACP session: same interface as AcpProcess for prompt/cancel. */
export interface RemoteAcpHandle {
    alive: boolean;
    prompt(acpSessionId: string, text: string): Promise<{ stopReason: string }>;
    cancel(acpSessionId: string): Promise<void>;
}

export interface ManagedRemoteProcess {
    handle: RemoteAcpHandle;
    acpSessionId: string;
    presetId: string;
    createdAt: Date;
    connection: AcpRemoteConnection;
}

/**
 * Singleton manager for ACP agent processes.
 * Maps our session IDs to ACP process instances.
 * Supports spawning different agent types via presets, including Claude Code.
 */
export class AcpProcessManager {
    private processes = new Map<string, ManagedProcess>();
    private claudeProcesses = new Map<string, ManagedClaudeProcess>();
    private remoteProcesses = new Map<string, ManagedRemoteProcess>();
    private remoteConnection: AcpRemoteConnection | null = null;

    /**
     * Spawn a new ACP agent process (or connect to remote), initialize, and create a session.
     *
     * @param sessionId - Our internal session ID
     * @param cwd - Working directory for the agent
     * @param onNotification - Handler for session/update notifications
     * @param presetId - Which ACP agent to use (default: "opencode"); use "opencode-remote" for remote URL
     * @param extraArgs - Additional command-line arguments
     * @param extraEnv - Additional environment variables
     * @param remoteBaseUrl - For opencode-remote: base URL (overrides OPENCODE_REMOTE_URL env)
     * @returns The agent's ACP session ID
     */
    async createSession(
        sessionId: string,
        cwd: string,
        onNotification: NotificationHandler,
        presetId: string = "opencode",
        extraArgs?: string[],
        extraEnv?: Record<string, string>,
        remoteBaseUrl?: string
    ): Promise<string> {
        if (presetId === "opencode-remote") {
            return this.createRemoteSession(sessionId, cwd, onNotification, remoteBaseUrl);
        }

        const config = await buildConfigFromPreset(presetId, cwd, extraArgs, extraEnv);
        const proc = new AcpProcess(config, onNotification);

        await proc.start();
        await proc.initialize();
        const acpSessionId = await proc.newSession(cwd);

        this.processes.set(sessionId, {
            process: proc,
            acpSessionId,
            presetId,
            createdAt: new Date(),
        });

        return acpSessionId;
    }

    /**
     * Create a session backed by a remote ACP endpoint (e.g. deployed OpenCode).
     * Uses OPENCODE_REMOTE_URL env or remoteBaseUrl param.
     */
    async createRemoteSession(
        sessionId: string,
        cwd: string,
        onNotification: NotificationHandler,
        remoteBaseUrl?: string
    ): Promise<string> {
        const baseUrl =
            remoteBaseUrl?.replace(/\/$/, "") ??
            process.env.OPENCODE_REMOTE_URL?.replace(/\/$/, "");

        if (!baseUrl) {
            throw new Error(
                "Remote OpenCode URL is required. Set OPENCODE_REMOTE_URL or pass remoteBaseUrl (e.g. https://opencode-nine.vercel.app/api/acp)."
            );
        }

        if (!this.remoteConnection) {
            this.remoteConnection = new AcpRemoteConnection({
                baseUrl,
                displayName: "OpenCode (Remote)",
            });
            await this.remoteConnection.initialize();
        }

        const acpSessionId = await this.remoteConnection.newSession(
            cwd,
            sessionId,
            onNotification
        );

        const connection = this.remoteConnection;

        const handle: RemoteAcpHandle = {
            alive: true,
            prompt: (sid, text) => connection.prompt(sid, text),
            cancel: (sid) => connection.cancel(sid),
        };

        this.remoteProcesses.set(sessionId, {
            handle,
            acpSessionId,
            presetId: "opencode-remote",
            createdAt: new Date(),
            connection,
        });

        return acpSessionId;
    }

    /**
     * Spawn a new Claude Code process with stream-json mode.
     *
     * @param sessionId - Our internal session ID
     * @param cwd - Working directory
     * @param onNotification - Handler for translated session/update notifications
     * @param mcpConfigs - MCP config JSON strings to pass to Claude Code
     * @param extraEnv - Additional environment variables
     * @returns A synthetic session ID for Claude Code
     */
    async createClaudeSession(
        sessionId: string,
        cwd: string,
        onNotification: NotificationHandler,
        mcpConfigs?: string[],
        extraEnv?: Record<string, string>,
    ): Promise<string> {
        const config = buildClaudeCodeConfig(cwd, mcpConfigs, extraEnv);
        const proc = new ClaudeCodeProcess(config, onNotification);

        await proc.start();

        // Claude Code doesn't have a separate "initialize" or "newSession" step.
        // The session ID comes from the "system" init message on first prompt.
        // We use our sessionId as the ACP session ID for consistency.
        const acpSessionId = sessionId;

        this.claudeProcesses.set(sessionId, {
            process: proc,
            acpSessionId,
            presetId: "claude",
            createdAt: new Date(),
        });

        return acpSessionId;
    }

    /**
     * Get the ACP process or remote handle for a session.
     */
    getProcess(sessionId: string): AcpProcess | RemoteAcpHandle | undefined {
        const local = this.processes.get(sessionId)?.process;
        if (local) return local;
        return this.remoteProcesses.get(sessionId)?.handle;
    }

    /**
     * Get the full ManagedProcess for a session.
     */
    getManagedProcess(sessionId: string): ManagedProcess | undefined {
        return this.processes.get(sessionId);
    }

    /**
     * Get the Claude Code process for a session.
     */
    getClaudeProcess(sessionId: string): ClaudeCodeProcess | undefined {
        return this.claudeProcesses.get(sessionId)?.process;
    }

    /**
     * Check if a session is a Claude Code session.
     */
    isClaudeSession(sessionId: string): boolean {
        return this.claudeProcesses.has(sessionId);
    }

    /**
     * Get the agent's ACP session ID for our session.
     */
    getAcpSessionId(sessionId: string): string | undefined {
        return (
            this.processes.get(sessionId)?.acpSessionId ??
            this.claudeProcesses.get(sessionId)?.acpSessionId ??
            this.remoteProcesses.get(sessionId)?.acpSessionId
        );
    }

    /**
     * Get the preset ID used for a session.
     */
    getPresetId(sessionId: string): string | undefined {
        return (
            this.processes.get(sessionId)?.presetId ??
            this.claudeProcesses.get(sessionId)?.presetId ??
            this.remoteProcesses.get(sessionId)?.presetId
        );
    }

    /**
     * List all active sessions (ACP, Claude Code, and remote).
     */
    listSessions(): Array<{
        sessionId: string;
        acpSessionId: string;
        presetId: string;
        alive: boolean;
        createdAt: Date;
    }> {
        const acpSessions = Array.from(this.processes.entries()).map(([sessionId, managed]) => ({
            sessionId,
            acpSessionId: managed.acpSessionId,
            presetId: managed.presetId,
            alive: managed.process.alive,
            createdAt: managed.createdAt,
        }));

        const claudeSessions = Array.from(this.claudeProcesses.entries()).map(([sessionId, managed]) => ({
            sessionId,
            acpSessionId: managed.acpSessionId,
            presetId: managed.presetId,
            alive: managed.process.alive,
            createdAt: managed.createdAt,
        }));

        const remoteSessions = Array.from(this.remoteProcesses.entries()).map(([sessionId, managed]) => ({
            sessionId,
            acpSessionId: managed.acpSessionId,
            presetId: managed.presetId,
            alive: managed.handle.alive,
            createdAt: managed.createdAt,
        }));

        return [...acpSessions, ...claudeSessions, ...remoteSessions];
    }

    /**
     * Kill a session's agent process or detach remote SSE.
     */
    killSession(sessionId: string): void {
        const managed = this.processes.get(sessionId);
        if (managed) {
            managed.process.kill();
            this.processes.delete(sessionId);
            return;
        }

        const claudeManaged = this.claudeProcesses.get(sessionId);
        if (claudeManaged) {
            claudeManaged.process.kill();
            this.claudeProcesses.delete(sessionId);
            return;
        }

        const remoteManaged = this.remoteProcesses.get(sessionId);
        if (remoteManaged) {
            remoteManaged.connection.detachSse(remoteManaged.acpSessionId);
            this.remoteProcesses.delete(sessionId);
        }
    }

    /**
     * Kill all processes and remote sessions.
     */
    killAll(): void {
        for (const [, managed] of this.processes) {
            managed.process.kill();
        }
        this.processes.clear();

        for (const [, managed] of this.claudeProcesses) {
            managed.process.kill();
        }
        this.claudeProcesses.clear();

        for (const [, managed] of this.remoteProcesses) {
            managed.connection.detachSse(managed.acpSessionId);
        }
        this.remoteProcesses.clear();
        this.remoteConnection = null;
    }
}