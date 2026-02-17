/**
 * Tests for AcpAgentProvider - real implementation connecting to AcpProcessManager
 */

import { AcpAgentProvider } from "../acp-agent-provider";
import { AgentRole } from "../../models/agent";
import { AcpProcessManager } from "../../acp/acp-process-manager";
import { AcpProcess } from "../../acp/acp-process";

// Mock AcpProcessManager
jest.mock("../../acp/acp-process-manager");
jest.mock("../../acp/acp-process");

describe("AcpAgentProvider", () => {
  let provider: AcpAgentProvider;
  let mockProcessManager: jest.Mocked<AcpProcessManager>;
  let mockProcess: jest.Mocked<AcpProcess>;

  beforeEach(() => {
    // Create mock process
    mockProcess = {
      sendRequest: jest.fn(),
      prompt: jest.fn(),
      cancel: jest.fn(),
      alive: true,
    } as any;

    // Create mock process manager
    mockProcessManager = {
      createSession: jest.fn(),
      getProcess: jest.fn(),
      getManagedProcess: jest.fn(),
      killSession: jest.fn(),
    } as any;

    // Setup default mock behaviors
    mockProcessManager.createSession.mockResolvedValue("acp-session-123");
    const managedProcess = {
      process: mockProcess,
      acpSessionId: "acp-session-123",
      presetId: "opencode",
      createdAt: new Date(),
    };
    mockProcessManager.getProcess.mockReturnValue(mockProcess);
    mockProcessManager.getManagedProcess.mockReturnValue(managedProcess);
    mockProcess.sendRequest.mockResolvedValue({});
    mockProcess.prompt.mockResolvedValue({ stopReason: "end_turn" });

    // Create provider
    provider = new AcpAgentProvider(
      {
        presetId: "opencode",
        cwd: "/test/workspace",
      },
      mockProcessManager
    );
  });

  describe("Mode Selection", () => {
    it("should use 'plan' mode for ROUTA role", async () => {
      await provider.run(AgentRole.ROUTA, "routa-1", "Plan this task");

      expect(mockProcess.sendRequest).toHaveBeenCalledWith(
        "session/set_mode",
        {
          sessionId: "acp-session-123",
          modeId: "plan",
        }
      );
    });

    it("should use 'build' mode for CRAFTER role", async () => {
      await provider.run(AgentRole.CRAFTER, "crafter-1", "Implement this");

      expect(mockProcess.sendRequest).toHaveBeenCalledWith(
        "session/set_mode",
        {
          sessionId: "acp-session-123",
          modeId: "build",
        }
      );
    });

    it("should use 'plan' mode for GATE role", async () => {
      await provider.run(AgentRole.GATE, "gate-1", "Verify this");

      expect(mockProcess.sendRequest).toHaveBeenCalledWith(
        "session/set_mode",
        {
          sessionId: "acp-session-123",
          modeId: "plan",
        }
      );
    });
  });

  describe("Session Management", () => {
    it("should create session with correct parameters", async () => {
      await provider.run(AgentRole.CRAFTER, "crafter-1", "Test prompt");

      expect(mockProcessManager.createSession).toHaveBeenCalledWith(
        "crafter-1",
        "/test/workspace",
        expect.any(Function), // notification handler
        "opencode",
        undefined,
        undefined
      );
    });

    it("should send prompt after setting mode", async () => {
      await provider.run(AgentRole.CRAFTER, "crafter-1", "Test prompt");

      expect(mockProcess.prompt).toHaveBeenCalledWith(
        "acp-session-123",
        "Test prompt"
      );
    });

    it("should cleanup session on cleanup", async () => {
      await provider.run(AgentRole.CRAFTER, "crafter-1", "Test");
      await provider.cleanup("crafter-1");

      expect(mockProcessManager.killSession).toHaveBeenCalledWith("crafter-1");
    });
  });

  describe("Streaming", () => {
    it("should handle streaming content updates", async () => {
      const chunks: any[] = [];
      
      // Simulate streaming notifications
      mockProcessManager.createSession.mockImplementation(
        async (sessionId, cwd, onNotification) => {
          // Simulate some content updates
          setTimeout(() => {
            onNotification({
              jsonrpc: "2.0",
              method: "session/update",
              params: { type: "content", content: "Hello " },
            });
            onNotification({
              jsonrpc: "2.0",
              method: "session/update",
              params: { type: "content", content: "World!" },
            });
          }, 10);
          return "acp-session-123";
        }
      );

      await provider.runStreaming(
        AgentRole.CRAFTER,
        "crafter-1",
        "Test",
        (chunk) => chunks.push(chunk)
      );

      // Wait for async notifications
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe("Health Check", () => {
    it("should return true when process is alive", () => {
      mockProcess.alive = true;
      expect(provider.isHealthy("crafter-1")).toBe(true);
    });

    it("should return false when process is not alive", () => {
      mockProcess.alive = false;
      expect(provider.isHealthy("crafter-1")).toBe(false);
    });
  });
});

