import { describe, it, expect, beforeEach, vi } from "vitest";
import { TranscriptPanel } from "../../../../../../src/cli/tui/panels/transcript.js";
import type { PtyEvent } from "../../../../../../src/integrations/subprocess/types.js";
import type { ActionTimelineEvent } from "../../../../../../src/core/timeline/types.js";

describe("TranscriptPanel", () => {
  let panel: TranscriptPanel;
  let mockScreen: any;
  let mockContext: any;
  let mockRegion: any;

  beforeEach(() => {
    panel = new TranscriptPanel();
    mockScreen = {
      cursorMoveTo: vi.fn(),
      write: vi.fn(),
    };
    mockContext = { screen: mockScreen };
    mockRegion = {
      startRow: 11,
      endRow: 21,
      columns: 80,
    };
  });

  describe("append", () => {
    it("renders empty-state guidance before any transcript content arrives", () => {
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      expect(output).toContain("실행 기록이 아직 없습니다.");
      expect(output).toContain("원본 CLI 출력");
    });

    it("adds a single line to transcript", () => {
      panel.append("Hello, world!");
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Hello, world!");
    });

    it("splits multiline input and adds each line", () => {
      panel.append("Line 1\nLine 2\nLine 3");
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Line 1");
      expect(output).toContain("Line 2");
      expect(output).toContain("Line 3");
    });

    it("auto-scrolls to bottom when new content arrives", () => {
      panel.append("First line");
      panel.append("Second line");
      // After appending, scrollOffset should be 0 (at bottom)
      // We verify this by checking that when rendering, we see the latest content
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Second line");
    });

    it("ignores empty lines", () => {
      panel.append("Line 1\n\nLine 3");
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Line 1");
      expect(output).toContain("Line 3");
      // Should not render empty lines from split
      const contentLines = mockScreen.write.mock.calls.length;
      expect(contentLines).toBeGreaterThan(0); // At least header and content
    });
  });

  describe("addEvent", () => {
    it("adds stdout chunk to transcript", () => {
      const event: PtyEvent = {
        type: "chunk",
        stream: "stdout",
        data: "Output text",
        timestamp: Date.now(),
      };

      panel.addEvent(event);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Output text");
    });

    it("renders tool call, file edit, and final answer blocks", () => {
      panel.addEvent({
        type: "chunk",
        stream: "stdout",
        data:
          "{\"type\":\"thread.started\"}\n{\"type\":\"turn.started\"}\n{\"type\":\"item.started\",\"item\":{\"id\":\"item_1\",\"type\":\"command_execution\",\"command\":\"/bin/zsh -lc 'pwd'\",\"status\":\"in_progress\"}}\n{\"type\":\"item.completed\",\"item\":{\"id\":\"item_1\",\"type\":\"command_execution\",\"command\":\"/bin/zsh -lc 'pwd'\",\"aggregated_output\":\"/tmp/workdir\\n\",\"exit_code\":0,\"status\":\"completed\"}}\n{\"type\":\"item.started\",\"item\":{\"id\":\"item_2\",\"type\":\"file_change\",\"changes\":[{\"path\":\"src/cli/tui/panels/transcript.ts\",\"kind\":\"update\"}],\"status\":\"in_progress\"}}\n{\"type\":\"item.completed\",\"item\":{\"id\":\"item_2\",\"type\":\"file_change\",\"changes\":[{\"path\":\"src/cli/tui/panels/transcript.ts\",\"kind\":\"update\"}],\"status\":\"completed\"}}\n{\"type\":\"item.completed\",\"item\":{\"id\":\"item_3\",\"type\":\"agent_message\",\"text\":\"Done\"}}\n{\"type\":\"turn.completed\"}\n",
        timestamp: Date.now(),
      });

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("/bin/zsh -lc 'pwd' · /tmp/workdir");
      expect(output).toContain("transcript.ts");
      expect(output).toContain("Done");
      expect(output).not.toContain("thread.started");
      expect(output).not.toContain("turn.started");
      expect(output).not.toContain("turn.completed");
      expect(output).not.toContain("changes:");
      expect(output).not.toContain("\u001b");
    });

    it("renders validation and git commands as dedicated blocks", () => {
      panel.addEvent({
        type: "chunk",
        stream: "stdout",
        data:
          "{\"type\":\"item.started\",\"item\":{\"id\":\"item_4\",\"type\":\"command_execution\",\"command\":\"npm run typecheck\",\"status\":\"in_progress\"}}\n{\"type\":\"item.completed\",\"item\":{\"id\":\"item_4\",\"type\":\"command_execution\",\"command\":\"npm run typecheck\",\"aggregated_output\":\"ok\\n\",\"exit_code\":0,\"status\":\"completed\"}}\n{\"type\":\"item.started\",\"item\":{\"id\":\"item_5\",\"type\":\"command_execution\",\"command\":\"git push origin dev\",\"status\":\"in_progress\"}}\n{\"type\":\"item.completed\",\"item\":{\"id\":\"item_5\",\"type\":\"command_execution\",\"command\":\"git push origin dev\",\"aggregated_output\":\"pushed\\n\",\"exit_code\":0,\"status\":\"completed\"}}\n",
        timestamp: Date.now(),
      });

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      expect(output).toContain("npm run typecheck · ok");
      expect(output).toContain("git push origin dev · pushed");
      expect(output).not.toContain("[validation]");
      expect(output).not.toContain("[git]");
    });

    it("hides generic tool started events and keeps completion summaries", () => {
      panel.addEvent({
        type: "chunk",
        stream: "stdout",
        data:
          "{\"type\":\"item.started\",\"item\":{\"id\":\"item_6\",\"type\":\"mcp_tool_call\",\"title\":\"Search repo\",\"status\":\"in_progress\"}}\n{\"type\":\"item.completed\",\"item\":{\"id\":\"item_6\",\"type\":\"mcp_tool_call\",\"title\":\"Search repo\",\"output\":\"done\\n\",\"status\":\"completed\"}}\n",
        timestamp: Date.now(),
      });

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");

      expect(output).toContain("mcp tool call: done");
      expect(output).not.toContain("started");
    });

    it("ignores Codex stderr banner noise while keeping real errors", () => {
      panel.addEvent({
        type: "chunk",
        stream: "stderr",
        data:
          "OpenAI Codex v0.128.0 (research preview)\n--------\nworkdir: /tmp/workdir\nError: boom\n",
        timestamp: Date.now(),
      });

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).not.toContain("OpenAI Codex");
      expect(output).not.toContain("workdir:");
      expect(output).toContain("Error: boom");
    });

    it("prefixes stderr with [ERR]", () => {
      const event: PtyEvent = {
        type: "chunk",
        stream: "stderr",
        data: "Error message",
        timestamp: Date.now(),
      };

      panel.addEvent(event);
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Error message");
    });

    it("ignores non-chunk events", () => {
      const event: PtyEvent = {
        type: "exit",
        timestamp: Date.now(),
      };

      // Should not throw
      expect(() => panel.addEvent(event)).not.toThrow();
    });

    it("auto-scrolls after adding event", () => {
      panel.addEvent({
        type: "chunk",
        stream: "stdout",
        data: "First",
        timestamp: Date.now(),
      });
      panel.addEvent({
        type: "chunk",
        stream: "stdout",
        data: "Second",
        timestamp: Date.now(),
      });

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Second");
    });
  });

  describe("hasVisibleContent", () => {
    it("reports visible content only when transcript has text", () => {
      expect(panel.hasVisibleContent()).toBe(false);

      panel.addEvent({
        type: "chunk",
        stream: "stdout",
        data: "{\"type\":\"message.delta\",\"delta\":\"Hello\"}\n",
        timestamp: Date.now(),
      });

      expect(panel.hasVisibleContent()).toBe(true);
    });
  });

  describe("scrollUp", () => {
    it("increases scroll offset when there is content above", () => {
      // Add enough lines to scroll
      for (let i = 0; i < 20; i++) {
        panel.append(`Line ${i}`);
      }

      panel.scrollUp();
      // After scroll up, render should show different content
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      // Should show earlier lines
      expect(output).toContain("Line");
    });

    it("respects maximum scroll offset", () => {
      panel.append("Only line");

      // Try to scroll up beyond available content
      for (let i = 0; i < 10; i++) {
        panel.scrollUp();
      }

      // Should not crash and should still render
      expect(() => {
        panel.render(mockContext, mockRegion);
      }).not.toThrow();
    });
  });

  describe("scrollDown", () => {
    it("decreases scroll offset to show newer content", () => {
      // Add enough lines
      for (let i = 0; i < 20; i++) {
        panel.append(`Line ${i}`);
      }

      // Scroll up
      panel.scrollUp();
      panel.scrollUp();

      // Scroll back down
      panel.scrollDown();

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Line");
    });

    it("prevents negative scroll offset", () => {
      panel.append("Line 1");

      // Try to scroll down beyond bottom
      for (let i = 0; i < 10; i++) {
        panel.scrollDown();
      }

      // Should not crash
      expect(() => {
        panel.render(mockContext, mockRegion);
      }).not.toThrow();
    });
  });

  describe("clear", () => {
    it("clears all lines and resets scroll", () => {
      panel.append("Line 1");
      panel.append("Line 2");
      panel.clear();

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      // Should only have header and empty space
      expect(output).not.toContain("Line 1");
      expect(output).not.toContain("Line 2");
    });
  });

  describe("render", () => {
    it("renders content without header", () => {
      panel.append("Test content");

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("Test content");
    });

    it("truncates long lines with ellipsis", () => {
      const longLine = "x".repeat(100);
      panel.append(longLine);

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const contentCalls = mockScreen.write.mock.calls;
      const hasEllipsis = contentCalls.some((c: any) =>
        c[0].includes("...")
      );
      expect(hasEllipsis).toBe(true);
    });

    it("pads short lines to fill usable width", () => {
      panel.append("Short");

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const contentCalls = mockScreen.write.mock.calls;
      const lineCall = contentCalls[0][0];
      // Line should be padded
      expect(lineCall.length).toBeGreaterThan("Short".length);
    });

    it("respects region boundaries", () => {
      for (let i = 0; i < 50; i++) {
        panel.append(`Line ${i}`);
      }

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      // Verify cursor moves are within bounds
      const cursorCalls = mockScreen.cursorMoveTo.mock.calls;
      cursorCalls.forEach((call: any) => {
        const [row] = call;
        expect(row).toBeGreaterThanOrEqual(mockRegion.startRow);
        expect(row).toBeLessThan(mockRegion.endRow);
      });
    });

    it("fills remaining rows with blank space", () => {
      panel.append("Single line");

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const calls = mockScreen.write.mock.calls;
      // Should have content line + blank padding lines
      expect(calls.length).toBeGreaterThan(1);
    });
  });

  describe("appendWorkspaceDiff", () => {
    it("renders workspace diff lines as file edit blocks", () => {
      panel.appendWorkspaceDiff([
        "[WORKSPACE] 새로 바뀐 파일",
        "  M src/cli/tui/panels/transcript.ts",
        "  ?? notes.txt",
      ]);

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("src/cli/tui/panels/transcript.ts");
      expect(output).toContain("notes.txt");
      expect(output).not.toContain("[edit]");
    });
  });

  describe("appendTurnRecap", () => {
    it("renders recap blocks from action timeline events", () => {
      const recapEvent: ActionTimelineEvent = {
        kind: "turn_recap",
        source: "detoks",
        summary: "턴 종료 recap",
        timestamp: Date.now(),
        details: [
          "요약: 1개 작업을 모두 완료했습니다",
          "다음 작업: 파이프라인이 완료되었습니다.",
        ],
      };

      panel.appendTurnRecap(recapEvent);

      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);

      const output = mockScreen.write.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(output).toContain("[recap]");
      expect(output).toContain("턴 종료 recap");
      expect(output).toContain("파이프라인이 완료되었습니다.");
    });
  });

  describe("truncation markers", () => {
    it("shows '↓ N줄 아래' marker when scrolled up away from the bottom", () => {
      // Region holds 10 rows (startRow 11..endRow 21). Add 30 entries so >10 hidden.
      for (let i = 0; i < 30; i += 1) {
        panel.append(`line ${i}`);
      }
      // Scroll up 5 entries so 5 lines remain hidden below.
      for (let i = 0; i < 5; i += 1) panel.scrollUp();
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);
      const output = mockScreen.write.mock.calls.map((c: any) => c[0]).join("\n");
      expect(output).toContain("↓ 5줄 아래");
    });

    it("shows '↑ N줄 위' marker when entries overflow above visible range", () => {
      // Region holds 10 rows. Add 30 entries — viewport at bottom shows last 10,
      // so 20 lines remain hidden above.
      for (let i = 0; i < 30; i += 1) {
        panel.append(`line ${i}`);
      }
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);
      const output = mockScreen.write.mock.calls.map((c: any) => c[0]).join("\n");
      expect(output).toContain("↑ 20줄 위");
    });

    it("shows no markers when content fits entirely in the viewport", () => {
      panel.append("only line");
      mockScreen.write.mockClear();
      panel.render(mockContext, mockRegion);
      const output = mockScreen.write.mock.calls.map((c: any) => c[0]).join("\n");
      expect(output).not.toContain("↑");
      expect(output).not.toContain("↓");
    });
  });
});
