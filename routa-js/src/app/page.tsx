"use client";

/**
 * Routa JS - Main Page
 *
 * Full-screen layout:
 *   - Top bar: Logo, Agent selector, protocol badges
 *   - Left sidebar: Provider selector, Sessions, Skills
 *   - Right area: Chat panel
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { SkillPanel } from "@/client/components/skill-panel";
import { ChatPanel } from "@/client/components/chat-panel";
import { SessionPanel } from "@/client/components/session-panel";
import { useAcp } from "@/client/hooks/use-acp";
import { useSkills } from "@/client/hooks/use-skills";
import { useOrchestration } from "@/client/hooks/use-orchestration";

type AgentRole = "CRAFTER" | "ROUTA" | "GATE";
type WorkMode = "single" | "multi";

export default function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentRole>("CRAFTER");
  const [workMode, setWorkMode] = useState<WorkMode>("single");
  const [showModeToast, setShowModeToast] = useState(false);
  const acp = useAcp();
  const skillsHook = useSkills();
  const orchestration = useOrchestration();

  // Auto-connect on mount so providers are loaded immediately
  useEffect(() => {
    if (!acp.connected && !acp.loading) {
      acp.connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bumpRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const ensureConnected = useCallback(async () => {
    if (!acp.connected) {
      await acp.connect();
    }
  }, [acp]);

  const handleCreateSession = useCallback(
    async (provider: string) => {
      await ensureConnected();
      const result = await acp.createSession(undefined, provider);
      if (result?.sessionId) {
        setActiveSessionId(result.sessionId);
        bumpRefresh();
      }
    },
    [acp, ensureConnected, bumpRefresh]
  );

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      await ensureConnected();
      acp.selectSession(sessionId);
      setActiveSessionId(sessionId);
      bumpRefresh();
    },
    [acp, ensureConnected, bumpRefresh]
  );

  const ensureSessionForChat = useCallback(async (cwd?: string, provider?: string): Promise<string | null> => {
    await ensureConnected();
    if (activeSessionId) return activeSessionId;
    const result = await acp.createSession(cwd, provider ?? acp.selectedProvider);
    if (result?.sessionId) {
      setActiveSessionId(result.sessionId);
      bumpRefresh();
      return result.sessionId;
    }
    return null;
  }, [acp, activeSessionId, ensureConnected, bumpRefresh]);

  const handleLoadSkill = useCallback(async (name: string): Promise<string | null> => {
    const skill = await skillsHook.loadSkill(name);
    return skill?.content ?? null;
  }, [skillsHook]);

  const handleAgentChange = useCallback((role: AgentRole) => {
    setSelectedAgent(role);
  }, []);

  const handleModeChange = useCallback((mode: WorkMode) => {
    setWorkMode(mode);
    if (mode === "multi") {
      setShowModeToast(true);
      setTimeout(() => setShowModeToast(false), 3000);
    }
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-[#0f1117]">
      {/* ─── Top Bar ──────────────────────────────────────────────── */}
      <header className="h-[52px] shrink-0 bg-white dark:bg-[#161922] border-b border-gray-200 dark:border-gray-800 flex items-center px-4 gap-4 z-10">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">R</span>
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Routa
          </span>
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />

        {/* Work Mode selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Mode:</span>
          <div className="relative">
            <select
              value={workMode}
              onChange={(e) => handleModeChange(e.target.value as WorkMode)}
              className="appearance-none pl-3 pr-7 py-1 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e2130] text-gray-900 dark:text-gray-100 cursor-pointer focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="single">Single Agent</option>
              <option value="multi">Multi Agent</option>
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Agent selector (only in single mode) */}
        {workMode === "single" && (
          <>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Agent:</span>
              <div className="relative">
                <select
                  value={selectedAgent}
                  onChange={(e) => handleAgentChange(e.target.value as AgentRole)}
                  className="appearance-none pl-3 pr-7 py-1 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e2130] text-gray-900 dark:text-gray-100 cursor-pointer focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="CRAFTER">CRAFTER</option>
                  <option value="ROUTA">ROUTA</option>
                  <option value="GATE">GATE</option>
                </select>
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                ACTIVE
              </span>
            </div>
          </>
        )}

        {/* Multi-agent status (only in multi mode) */}
        {workMode === "multi" && (
          <>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Orchestration:</span>
              <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                orchestration.isRunning
                  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
                  : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              }`}>
                {orchestration.isRunning ? "RUNNING" : "READY"}
              </span>
              {orchestration.currentPhase && (
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {orchestration.currentPhase.type}
                </span>
              )}
            </div>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Protocol badges */}
        <div className="flex items-center gap-2">
          <ProtocolBadge name="MCP" endpoint="/api/mcp" />
          <ProtocolBadge name="ACP" endpoint="/api/acp" />
        </div>

        {/* Connection status */}
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
        <button
          onClick={async () => {
            if (acp.connected) {
              acp.disconnect();
            } else {
              await acp.connect();
            }
          }}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            acp.connected
              ? "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30"
              : "text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${acp.connected ? "bg-green-500" : "bg-gray-400"}`} />
          {acp.connected ? "Connected" : "Disconnected"}
        </button>
      </header>

      {/* ─── Main Area ────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* ─── Left Sidebar ──────────────────────────────────────── */}
        <aside className="w-[300px] shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-[#13151d] flex flex-col overflow-hidden">
          {/* Provider + New Session */}
          <div className="p-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Provider
              </label>
              {acp.providers.length > 0 && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  {acp.providers.filter((p) => p.status === "available").length}/{acp.providers.length} installed
                </span>
              )}
            </div>

            {/* Provider list */}
            <div className="max-h-44 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e2130] divide-y divide-gray-50 dark:divide-gray-800">
              {acp.providers.length === 0 ? (
                <div className="px-3 py-3 text-xs text-gray-400 text-center">
                  Connecting...
                </div>
              ) : (
                acp.providers.map((p) => {
                  const isAvailable = p.status === "available";
                  const isSelected = p.id === acp.selectedProvider;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => acp.setProvider(p.id)}
                      className={`w-full text-left px-2.5 py-2 flex items-center gap-2 transition-colors ${
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-900/20"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      } ${!isAvailable ? "opacity-50" : ""}`}
                    >
                      {/* Status dot */}
                      <span
                        className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                          isAvailable ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
                        }`}
                      />
                      {/* Name + description */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-medium truncate ${isSelected ? "text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-gray-100"}`}>
                            {p.name}
                          </span>
                          <span className="text-[9px] text-gray-400 dark:text-gray-500 font-mono truncate">
                            {p.command}
                          </span>
                        </div>
                      </div>
                      {/* Status badge */}
                      <span
                        className={`shrink-0 px-1.5 py-0.5 text-[9px] font-medium rounded ${
                          isAvailable
                            ? "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                        }`}
                      >
                        {isAvailable ? "Ready" : "Not found"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <button
              onClick={() => handleCreateSession(acp.selectedProvider)}
              disabled={acp.providers.length === 0 || !acp.selectedProvider}
              className="mt-2 w-full px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + New Session
            </button>
          </div>

          {/* Sessions */}
          <div className="flex-1 overflow-y-auto">
            <SessionPanel
              selectedSessionId={activeSessionId}
              onSelect={handleSelectSession}
              refreshKey={refreshKey}
            />

            {/* Divider */}
            <div className="mx-3 my-1 border-t border-gray-100 dark:border-gray-800" />

            {/* Skills */}
            <SkillPanel />
          </div>
        </aside>

        {/* ─── Chat Area ──────────────────────────────────────────── */}
        <main className="flex-1 min-w-0">
          {workMode === "single" ? (
            <ChatPanel
              acp={acp}
              activeSessionId={activeSessionId}
              onEnsureSession={ensureSessionForChat}
              skills={skillsHook.skills}
              onLoadSkill={handleLoadSkill}
            />
          ) : (
            <MultiAgentPanel orchestration={orchestration} />
          )}
        </main>
      </div>

      {/* ─── Mode Toast ──────────────────────────────────────────── */}
      {showModeToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-lg animate-fade-in">
          🚀 Multi-agent mode enabled: ROUTA → CRAFTER → GATE
        </div>
      )}
    </div>
  );
}

function ProtocolBadge({
  name,
  endpoint,
}: {
  name: string;
  endpoint: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-50 dark:bg-[#1e2130] text-[11px] font-medium text-gray-500 dark:text-gray-400">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      {name}
      <span className="text-gray-400 dark:text-gray-500 font-mono text-[10px]">
        {endpoint}
      </span>
    </div>
  );
}

function MultiAgentPanel({ orchestration }: { orchestration: ReturnType<typeof useOrchestration> }) {
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [expandedThoughts, setExpandedThoughts] = useState<Set<number>>(new Set());

  // Initialize session on mount (like Kotlin's RoutaViewModel.initialize())
  useEffect(() => {
    if (!orchestration.session) {
      console.log("[MultiAgentPanel] Initializing orchestration session...");
      // Use current working directory instead of hardcoded "/workspace"
      orchestration.initSession(undefined, "opencode").catch((error) => {
        console.error("[MultiAgentPanel] Failed to initialize session:", error);
        setMessages((prev) => [
          ...prev,
          { role: "error", content: `Failed to initialize: ${error instanceof Error ? error.message : String(error)}` },
        ]);
      });
    }
  }, [orchestration]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: userInput }]);
    const request = userInput;
    setUserInput("");

    try {
      // Execute request (like Kotlin's RoutaViewModel.execute())
      await orchestration.executeRequest(request);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "error", content: `Error: ${error instanceof Error ? error.message : String(error)}` },
      ]);
    }
  };

  const handleReset = async () => {
    try {
      await orchestration.resetSession();
      setMessages([]);
      setUserInput("");
    } catch (error) {
      console.error("[MultiAgentPanel] Failed to reset session:", error);
    }
  };

  // Track processed events to avoid reprocessing
  const processedEventsRef = useRef(0);

  // Add orchestration events to messages
  useEffect(() => {
    // Process only new events
    const newEvents = orchestration.events.slice(processedEventsRef.current);

    if (newEvents.length === 0) return;

    newEvents.forEach((event) => {
      if (event.type === "phase") {
        // Phase events are tracked in orchestration.currentPhase
        // No need to display them as messages
        return;
      } else if (event.type === "chunk") {
        // Handle streaming chunks (matching Single Agent mode's ChatPanel)
        const chunkData = event.data as any;
        const chunk = chunkData.chunk;

        if (!chunk) return;

        setMessages((prev) => {
          const last = prev[prev.length - 1];

          // Handle thinking chunks
          if (chunk.type === "thinking") {
            const newIndex = last && last.role === "thinking" ? prev.length - 1 : prev.length;

            // Auto-expand the thinking message being streamed
            setExpandedThoughts((prevExpanded) => {
              const next = new Set(prevExpanded);
              next.add(newIndex);
              return next;
            });

            if (last && last.role === "thinking") {
              // Append to existing thinking message
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + (chunk.content || "") },
              ];
            }
            // Create new thinking message
            return [...prev, { role: "thinking", content: chunk.content || "" }];
          }

          // Handle text chunks
          if (chunk.type === "text") {
            if (last && last.role === "assistant") {
              // Append to existing assistant message
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + (chunk.content || "") },
              ];
            }
            // Create new assistant message
            return [...prev, { role: "assistant", content: chunk.content || "" }];
          }

          // Handle other chunk types (tool_call, tool_result, error)
          return prev;
        });
      }
    });

    // Update processed count
    processedEventsRef.current = orchestration.events.length;
  }, [orchestration.events]);

  // Auto-collapse thinking messages when orchestration completes
  useEffect(() => {
    if (!orchestration.isRunning && messages.length > 0) {
      // Find all thinking message indices
      const thinkingIndices: number[] = [];
      messages.forEach((msg, i) => {
        if (msg.role === "thinking") {
          thinkingIndices.push(i);
        }
      });

      // Collapse all thinking messages after a short delay
      if (thinkingIndices.length > 0) {
        const timer = setTimeout(() => {
          setExpandedThoughts((prev) => {
            const next = new Set(prev);
            thinkingIndices.forEach((idx) => next.delete(idx));
            return next;
          });
        }, 500); // 500ms delay for smooth transition

        return () => clearTimeout(timer);
      }
    }
  }, [orchestration.isRunning, messages]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#0f1117]">
      {/* Messages area (matching Single Agent mode - centered with max-w-3xl) */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Multi-Agent Orchestration
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
              ROUTA will plan your task, CRAFTER agents will implement it, and GATE will verify the results.
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "thinking" ? (
                // Thinking bubble with streaming support
                <div className="max-w-[90%] w-full">
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedThoughts((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) {
                          next.delete(i);
                        } else {
                          next.add(i);
                        }
                        return next;
                      });
                    }}
                    className="w-full text-left group"
                  >
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-t-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800/50">
                      <svg
                        className={`w-3 h-3 text-purple-400 transition-transform duration-150 ${expandedThoughts.has(i) ? "rotate-90" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="text-[11px] font-medium text-purple-500 dark:text-purple-400 uppercase tracking-wide">
                        Thinking
                      </span>
                    </div>
                    {expandedThoughts.has(i) && (
                      <div className="px-3 py-2 rounded-b-lg bg-purple-50 dark:bg-purple-900/10 border border-t-0 border-purple-100 dark:border-purple-800/50 text-xs text-purple-700 dark:text-purple-300 whitespace-pre-wrap max-h-[5.6em] overflow-y-auto">
                        {msg.content}
                      </div>
                    )}
                  </button>
                </div>
              ) : msg.role === "user" ? (
                // User message bubble (matching Single Agent mode)
                <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-blue-600 text-white text-sm whitespace-pre-wrap">
                  {msg.content}
                </div>
              ) : msg.role === "system" ? (
                // System message
                <div className="max-w-[80%] px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs">
                  {msg.content}
                </div>
              ) : msg.role === "error" ? (
                // Error message
                <div className="max-w-[80%] px-4 py-2 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                  {msg.content}
                </div>
              ) : (
                // Assistant message bubble (matching Single Agent mode)
                <div className="max-w-[85%] px-4 py-3 rounded-2xl rounded-bl-md bg-gray-50 dark:bg-[#1a1d2e] text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                  {msg.content}
                </div>
              )}
            </div>
          ))
        )}
        {orchestration.isRunning && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {orchestration.currentPhase?.type || "Processing..."}
                </span>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Input area (matching Single Agent mode's ChatPanel - NO refresh button) */}
      <div className="border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-[#0f1117]">
        <div className="max-w-3xl mx-auto px-5 py-3">
          <div className="flex gap-2 items-end">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={
                orchestration.session
                  ? "Describe your task for multi-agent orchestration... Enter to send"
                  : "Initializing session..."
              }
              disabled={orchestration.isRunning || !orchestration.session}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e2130] text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
            />
            <button
              onClick={(e) => {
                e.preventDefault();
                handleSubmit(e as any);
              }}
              disabled={orchestration.isRunning || !userInput.trim() || !orchestration.session}
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {orchestration.isRunning ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
