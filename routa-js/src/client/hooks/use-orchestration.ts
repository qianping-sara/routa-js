/**
 * Hook for multi-agent orchestration
 *
 * Architecture (matches Kotlin's RoutaViewModel):
 * - initSession(): Initialize orchestration session (once, like RoutaViewModel.initialize())
 * - executeRequest(): Execute user request (can be called multiple times, like RoutaViewModel.execute())
 * - resetSession(): Reset session (clear panels, like "New Session" button)
 */

import { useState, useCallback, useRef, useEffect } from "react";

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

export type OrchestratorEvent =
  | { type: "phase"; data: OrchestratorPhase }
  | { type: "chunk"; data: { agentId: string; chunk: unknown } }
  | { type: "completed"; data: unknown }
  | { type: "error"; data: { error: string } };

export interface OrchestrationSession {
  sessionId: string;
  workspaceId: string;
  status: "initialized" | "started" | "running" | "completed" | "error";
}

export function useOrchestration() {
  const [session, setSession] = useState<OrchestrationSession | null>(null);
  const [events, setEvents] = useState<OrchestratorEvent[]>([]);
  const [currentPhase, setCurrentPhase] = useState<OrchestratorPhase | null>(
    null
  );
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Initialize orchestration session (like Kotlin's RoutaViewModel.initialize())
  const initSession = useCallback(
    async (workspaceId?: string, provider?: string) => {
      try {
        console.log("[useOrchestration] Initializing session...");

        const response = await fetch("/api/orchestrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "init", workspaceId, provider }),
        });

        if (!response.ok) {
          throw new Error(`Failed to initialize session: ${response.statusText}`);
        }

        const data = await response.json();
        setSession(data);

        // Connect to SSE stream
        const eventSource = new EventSource(
          `/api/orchestrate?sessionId=${data.sessionId}`
        );
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
          try {
            const eventData = JSON.parse(event.data) as OrchestratorEvent;
            setEvents((prev) => [...prev, eventData]);

            if (eventData.type === "phase") {
              setCurrentPhase(eventData.data);
            } else if (eventData.type === "completed") {
              setIsRunning(false);
              setSession((prev) =>
                prev ? { ...prev, status: "completed" } : null
              );
            } else if (eventData.type === "error") {
              setIsRunning(false);
              setError(eventData.data.error);
              setSession((prev) => (prev ? { ...prev, status: "error" } : null));
            }
          } catch (err) {
            console.error("Failed to parse SSE event:", err);
          }
        };

        eventSource.onerror = () => {
          console.error("[useOrchestration] SSE connection error");
          setIsRunning(false);
          eventSource.close();
        };

        console.log("[useOrchestration] Session initialized:", data.sessionId);
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    []
  );

  // Execute user request (like Kotlin's RoutaViewModel.execute())
  const executeRequest = useCallback(
    async (userRequest: string) => {
      if (!session) {
        throw new Error("Session not initialized. Call initSession() first.");
      }

      try {
        console.log("[useOrchestration] Executing request:", userRequest.substring(0, 100));
        setIsRunning(true);
        setError(null);

        const response = await fetch("/api/orchestrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "execute",
            sessionId: session.sessionId,
            userRequest,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to execute request: ${response.statusText}`);
        }

        const data = await response.json();
        setSession((prev) => (prev ? { ...prev, status: "started" } : null));

        return data;
      } catch (err) {
        setIsRunning(false);
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [session]
  );

  // Reset session (like Kotlin's "New Session" button)
  const resetSession = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      console.log("[useOrchestration] Resetting session:", session.sessionId);

      const response = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          sessionId: session.sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to reset session: ${response.statusText}`);
      }

      // Clear local state
      setEvents([]);
      setCurrentPhase(null);
      setError(null);
      setIsRunning(false);

      console.log("[useOrchestration] Session reset successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [session]);

  // Stop orchestration
  const stopOrchestration = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsRunning(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    session,
    events,
    currentPhase,
    isRunning,
    error,
    initSession,
    executeRequest,
    resetSession,
    stopOrchestration,
  };
}

