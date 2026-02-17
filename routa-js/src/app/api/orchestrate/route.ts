/**
 * Multi-Agent Orchestration API Route - /api/orchestrate
 *
 * Executes the full ROUTA → CRAFTER → GATE workflow.
 *
 * Architecture (matches Kotlin's RoutaViewModel):
 * - POST /api/orchestrate/init: Initialize orchestration session (once)
 * - POST /api/orchestrate/execute: Execute user request (can be called multiple times)
 * - POST /api/orchestrate/reset: Reset session (clear panels, like "New Session" button)
 * - GET /api/orchestrate/stream: SSE stream for orchestration events
 */

import { NextRequest, NextResponse } from "next/server";
import { orchestrationSessionManager } from "@/core/orchestrator/orchestration-session-manager";
import { v4 as uuidv4 } from "uuid";
import { OrchestratorPhase } from "@/core/pipeline/pipeline-context";
import { StreamChunk } from "@/core/provider/agent-provider";

export const dynamic = "force-dynamic";

// SSE controllers for streaming
const sseControllers = new Map<string, ReadableStreamDefaultController>();

// ─── Helper: Push events to SSE stream ─────────────────────────────────

async function pushEvent(sessionId: string, type: string, data: unknown) {
  const event = { type, data, timestamp: Date.now() };
  const session = await orchestrationSessionManager.getSession(sessionId);
  if (session) {
    session.events.push(event);
  }

  const controller = sseControllers.get(sessionId);
  if (controller) {
    const eventData = JSON.stringify(event);
    controller.enqueue(new TextEncoder().encode(`data: ${eventData}\n\n`));
  }
}

// ─── GET: SSE stream for orchestration events ──────────────────────────

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing sessionId query param" },
      { status: 400 }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      sseControllers.set(sessionId, controller);

      // Send existing events
      const session = await orchestrationSessionManager.getSession(sessionId);
      if (session) {
        for (const event of session.events) {
          const data = JSON.stringify(event);
          controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
        }
      }

      request.signal.addEventListener("abort", () => {
        sseControllers.delete(sessionId);
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
    },
  });
}

// ─── POST: Route to different actions ──────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body as { action?: string };

    console.log(`[Orchestrate POST] Received action: ${action || "legacy"}, body:`, JSON.stringify(body).substring(0, 200));

    // Route to different handlers based on action
    if (action === "init") {
      console.log("[Orchestrate POST] Routing to handleInit");
      return handleInit(body);
    } else if (action === "execute") {
      console.log("[Orchestrate POST] Routing to handleExecute");
      return handleExecute(body);
    } else if (action === "reset") {
      console.log("[Orchestrate POST] Routing to handleReset");
      return handleReset(body);
    } else {
      console.log("[Orchestrate POST] Routing to handleLegacyExecute (backward compatibility)");
      // Default: backward compatibility - treat as execute with auto-init
      return handleLegacyExecute(body);
    }
  } catch (error) {
    console.error("[Orchestrate Route] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal error",
      },
      { status: 500 }
    );
  }
}

// ─── Handler: Initialize orchestration session ─────────────────────────

async function handleInit(body: unknown) {
  const { workspaceId, provider } = body as {
    workspaceId?: string;
    provider?: string;
  };

  const sessionId = uuidv4();
  const workspace = workspaceId ?? process.cwd();
  const providerName = provider ?? "opencode";

  console.log(`[handleInit] Creating session ${sessionId} with provider ${providerName}`);

  // Create session using singleton manager (like Kotlin's IdeaRoutaService.getInstance())
  await orchestrationSessionManager.createSession(
    sessionId,
    workspace,
    providerName,
    async (phase: OrchestratorPhase) => {
      await pushEvent(sessionId, "phase", phase);
    },
    async (agentId: string, chunk: StreamChunk) => {
      await pushEvent(sessionId, "chunk", { agentId, chunk });
    }
  );

  console.log(`[handleInit] Session ${sessionId} created successfully`);

  return NextResponse.json({
    sessionId,
    workspaceId: workspace,
    provider: providerName,
    status: "initialized",
  });
}

// ─── Handler: Execute user request ─────────────────────────────────────

async function handleExecute(body: unknown) {
  const { sessionId, userRequest } = body as {
    sessionId: string;
    userRequest: string;
  };

  console.log(`[handleExecute] Called with sessionId: ${sessionId}, userRequest: ${userRequest?.substring(0, 50)}`);

  if (!sessionId) {
    console.error("[handleExecute] Missing sessionId");
    return NextResponse.json(
      { error: "Missing sessionId" },
      { status: 400 }
    );
  }

  if (!userRequest) {
    console.error("[handleExecute] Missing userRequest");
    return NextResponse.json(
      { error: "Missing userRequest" },
      { status: 400 }
    );
  }

  const session = await orchestrationSessionManager.getSession(sessionId);
  if (!session) {
    console.error(`[handleExecute] Session ${sessionId} not found. Available sessions:`, orchestrationSessionManager.listSessions());
    return NextResponse.json(
      { error: `Session ${sessionId} not found. Call init first.` },
      { status: 404 }
    );
  }

  if (session.status === "running") {
    console.warn(`[handleExecute] Session ${sessionId} is already running`);
    return NextResponse.json(
      { error: "Session is already running" },
      { status: 409 }
    );
  }

  console.log(`[handleExecute] Executing request in session ${sessionId}: ${userRequest.substring(0, 100)}...`);

  // Update status
  session.status = "running";

  // Execute in background (like Kotlin's RoutaViewModel.execute())
  (async () => {
    try {
      console.log(`[handleExecute] Starting orchestrator.execute() for session ${sessionId}`);
      const result = await session.orchestrator.execute(userRequest);

      session.status = "completed";
      session.result = result;

      await pushEvent(sessionId, "completed", result);
      console.log(`[handleExecute] Session ${sessionId} completed successfully`);
    } catch (error) {
      session.status = "error";
      session.error =
        error instanceof Error ? error.message : String(error);

      await pushEvent(sessionId, "error", {
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`[handleExecute] Session ${sessionId} failed:`, error);
    }
  })();

  console.log(`[handleExecute] Returning response for session ${sessionId}`);
  return NextResponse.json({
    sessionId,
    status: "started",
  });
}

// ─── Handler: Reset session ────────────────────────────────────────────

async function handleReset(body: unknown) {
  const { sessionId } = body as { sessionId: string };

  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing sessionId" },
      { status: 400 }
    );
  }

  const session = await orchestrationSessionManager.getSession(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: `Session ${sessionId} not found` },
      { status: 404 }
    );
  }

  console.log(`[Orchestrate] Resetting session ${sessionId}`);

  // Clear events (like Kotlin's clearAllPanels())
  session.events = [];
  session.status = "idle";
  session.result = undefined;
  session.error = undefined;

  // Note: We keep the orchestrator and stores intact
  // This matches Kotlin's behavior where reset() doesn't reinitialize the ViewModel

  return NextResponse.json({
    sessionId,
    status: "reset",
  });
}

// ─── Handler: Legacy execute (backward compatibility) ──────────────────

async function handleLegacyExecute(body: unknown) {
  const { userRequest, workspaceId, provider } = body as {
    userRequest: string;
    workspaceId?: string;
    provider?: string;
  };

  if (!userRequest) {
    return NextResponse.json(
      { error: "Missing userRequest" },
      { status: 400 }
    );
  }

  // Auto-init a new session
  const initResponse = await handleInit({ workspaceId, provider });
  const initData = await initResponse.json();

  if (!initData.sessionId) {
    return NextResponse.json(
      { error: "Failed to initialize session" },
      { status: 500 }
    );
  }

  // Execute the request
  return handleExecute({
    sessionId: initData.sessionId,
    userRequest,
  });
}

