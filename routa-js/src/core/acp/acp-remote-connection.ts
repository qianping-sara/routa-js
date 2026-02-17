/**
 * ACP Remote Connection - connect to an ACP-compatible endpoint over HTTP.
 *
 * Use when the "agent" is a remote service (e.g. deployed OpenCode at a URL)
 * that exposes the same ACP JSON-RPC (POST) and session/update (SSE) as our /api/acp.
 *
 * Expects the remote to:
 *   - POST to baseUrl: JSON-RPC body { jsonrpc, id, method, params }
 *   - GET baseUrl?sessionId=<id>: SSE stream with session/update events
 */

import type { NotificationHandler } from "./processer";

const DEFAULT_TIMEOUT_MS = 30000;
const PROMPT_TIMEOUT_MS = 300000;

export interface AcpRemoteConnectionConfig {
  baseUrl: string;
  displayName: string;
}

export class AcpRemoteConnection {
  private baseUrl: string;
  private displayName: string;
  private requestId = 0;
  private sessionIdToSseAbort = new Map<string, () => void>();

  constructor(config: AcpRemoteConnectionConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.displayName = config.displayName;
  }

  get alive(): boolean {
    return true;
  }

  /**
   * Initialize the ACP protocol with the remote.
   */
  async initialize(): Promise<unknown> {
    const result = await this.sendRequest("initialize", {
      protocolVersion: 1,
    });
    console.log(
      `[AcpRemoteConnection:${this.displayName}] Initialized:`,
      JSON.stringify(result)
    );
    return result;
  }

  /**
   * Create a new session on the remote. Returns the remote's session ID.
   * Starts an SSE subscription and forwards session/update to onNotification with ourSessionId.
   */
  async newSession(
    cwd: string,
    ourSessionId: string,
    onNotification: NotificationHandler
  ): Promise<string> {
    const result = (await this.sendRequest("session/new", {
      cwd,
      provider: "opencode",
      mcpServers: [],
    })) as { sessionId: string };

    const remoteSessionId = result.sessionId;
    console.log(
      `[AcpRemoteConnection:${this.displayName}] Session created: ${remoteSessionId} (our: ${ourSessionId})`
    );

    this.attachSse(remoteSessionId, ourSessionId, onNotification);

    return remoteSessionId;
  }

  /**
   * Send a prompt to the remote session.
   */
  async prompt(
    remoteSessionId: string,
    text: string
  ): Promise<{ stopReason: string }> {
    const result = (await this.sendRequest(
      "session/prompt",
      {
        sessionId: remoteSessionId,
        prompt: [{ type: "text", text }],
      },
      PROMPT_TIMEOUT_MS
    )) as { stopReason: string };
    return result;
  }

  /**
   * Cancel the current prompt on the remote session.
   */
  async cancel(remoteSessionId: string): Promise<void> {
    await this.sendNotification("session/cancel", { sessionId: remoteSessionId });
  }

  /**
   * Stop forwarding SSE for a session (e.g. when session is killed).
   */
  detachSse(remoteSessionId: string): void {
    const abort = this.sessionIdToSseAbort.get(remoteSessionId);
    if (abort) {
      abort();
      this.sessionIdToSseAbort.delete(remoteSessionId);
    }
  }

  private attachSse(
    remoteSessionId: string,
    ourSessionId: string,
    onNotification: NotificationHandler
  ): void {
    const url = `${this.baseUrl}?sessionId=${encodeURIComponent(remoteSessionId)}`;
    const ac = new AbortController();
    this.sessionIdToSseAbort.set(remoteSessionId, () => ac.abort());

    fetch(url, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      signal: ac.signal,
    })
      .then((res) => {
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const push = (chunk: string) => {
          buffer += chunk;
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const event of events) {
            const line = event.split("\n").find((l) => l.startsWith("data:"));
            if (line) {
              try {
                const data = JSON.parse(line.slice(5).trim());
                if (data.method === "session/update" && data.params) {
                  onNotification({
                    jsonrpc: "2.0",
                    method: "session/update",
                    params: { ...data.params, sessionId: ourSessionId },
                  });
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        };

        const read = (): Promise<void> =>
          reader.read().then(({ done, value }) => {
            if (done) return;
            push(decoder.decode(value, { stream: true }));
            return read();
          });

        return read();
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        console.error(
          `[AcpRemoteConnection:${this.displayName}] SSE error for ${remoteSessionId}:`,
          err
        );
      });
  }

  private async sendRequest(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<unknown> {
    const id = ++this.requestId;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = (await response.json()) as {
      jsonrpc: string;
      id?: number;
      result?: unknown;
      error?: { code: number; message: string };
    };

    if (data.error) {
      throw new Error(
        `ACP Error [${data.error.code}]: ${data.error.message}`
      );
    }

    return data.result;
  }

  private async sendNotification(
    method: string,
    params: Record<string, unknown>
  ): Promise<void> {
    await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
      }),
    });
  }
}
