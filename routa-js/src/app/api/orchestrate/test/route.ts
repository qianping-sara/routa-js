/**
 * Test endpoint for multi-agent orchestration
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Multi-agent orchestration API is available",
    endpoints: {
      POST: "/api/orchestrate - Start orchestration",
      GET: "/api/orchestrate?sessionId=xxx - SSE stream for events",
    },
  });
}

