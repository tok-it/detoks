import { describe, expect, it, beforeEach, vi } from "vitest";
import { EmbeddedTerminalPane } from "../../../../../../src/cli/tui/panels/embedded-terminal.js";

describe("EmbeddedTerminalPane", () => {
  let pane: EmbeddedTerminalPane;
  let mockScreen: any;
  let mockContext: any;
  let mockRegion: any;

  beforeEach(() => {
    pane = new EmbeddedTerminalPane();
    mockScreen = {
      cursorMoveTo: vi.fn(),
      write: vi.fn(),
    };
    mockContext = { screen: mockScreen };
    mockRegion = {
      startRow: 5,
      endRow: 10,
      columns: 20,
    };
  });

  it("renders an empty-state placeholder before output arrives", () => {
    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("원본 CLI 출력");
  });

  it("renders chunk output into the pane", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "hello\nworld",
    });

    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("hello");
    expect(output).toContain("world");
  });

  it("renders Korean wide characters without placeholder spacing", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "한글",
    });

    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("한글");
    expect(output).not.toContain("한 글");
  });

  it("preserves ANSI style information in raw chunks passed to the buffer", () => {
    const ansiChunk = "\x1b[32mhello\x1b[0m world";
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: ansiChunk });

    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("\x1b[32m");
    expect(output).toContain("\x1b[0m");
    expect(output).toContain("hello");
    expect(output).toContain("world");
  });

  it("compresses codex metadata lines into a short summary", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "OpenAI Codex v0.130.0\nworkdir: /tmp/demo\n--------\n",
    });

    const lines = pane.getRenderableLines(60);
    const output = lines.map((l) => l.text).join("\n");
    expect(output).toContain("세션 정보");
    expect(output).toContain("OpenAI Codex");
    expect(output).not.toContain("workdir:");
    expect(output).not.toContain("--------");
  });

  it("compresses exec command blocks into a short summary", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "exec",
        `/bin/zsh -lc "rg -n \"new ProjectMemory\" src tests"`,
        "succeeded in 0ms:",
        "src/core/pipeline/orchestrator.ts:34:import { ProjectMemory } from \"../rag/project-memory.js\";",
        "src/core/rag/project-memory.ts:5:import { TaskSequenceMiner } from \"./task-sequence-miner.js\";",
        "",
      ].join("\n"),
    });

    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("명령 실행");
    expect(output).toContain("rg");
    expect(output).not.toContain("succeeded in 0ms");
    expect(output).not.toContain("TaskSequenceMiner");
  });

  it("keeps an in-progress file read compact and exposes it as current activity", () => {
    mockRegion.columns = 140;
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "exec",
        `/bin/zsh -lc "sed -n '1,220p' /Users/choi/.codex/RTK.md" in /Users/choi/Desktop/workspace/detoks`,
        "# verbose file contents",
        "line that should not fill the pane",
      ].join("\n"),
    });

    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("파일 읽기");
    expect(output).toContain("/Users/choi/.codex/RTK.md");
    expect(output).not.toContain("line that should not fill the pane");
    expect(pane.getActivitySnapshot(120)).toMatchObject({
      kind: "file",
      label: "파일 읽기",
      detail: "/Users/choi/.codex/RTK.md",
      status: "running",
    });
  });

  it("summarizes an in-progress search without streaming every match line", () => {
    mockRegion.columns = 140;
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "exec",
        `/bin/zsh -lc "rg -n \\"ProjectMemory\\" src tests"`,
        "src/core/pipeline/orchestrator.ts:34:import { ProjectMemory } from \"../rag/project-memory.js\";",
        "tests/ts/unit/core/rag/project-memory.test.ts:1:import { ProjectMemory } from \"x\";",
      ].join("\n"),
    });

    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("검색");
    expect(output).toContain("ProjectMemory");
    expect(output).not.toContain("orchestrator.ts:34");
    expect(pane.getActivitySnapshot(120)).toMatchObject({
      kind: "search",
      label: "검색",
      detail: "ProjectMemory",
      status: "running",
    });
  });

  it("detects approval prompts as a focused interaction state", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "approval required (y/n)\n",
    });

    pane.render(mockContext, mockRegion);

    expect(pane.getInteractionState(120)).toMatchObject({
      kind: "approval",
      label: "Codex 승인 대기",
      detail: "approval required (y/n)",
    });
  });

  it("does not keep a stale approval prompt after later output arrives", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "approval required (y/n)\n",
    });
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "approved, executing now\n",
    });

    expect(pane.getInteractionState(120)).toBeNull();
  });

  it("renders the live cursor cell with inverse video when the buffer reports a visible cursor", () => {
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "hello" });

    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("\x1b[7m");
  });

  it("forwards resize events to the terminal buffer without writing content", () => {
    // Use a short string that fits within usableWidth (columns 20 - 4 border = 16)
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "output line" });

    // Resize event should update buffer dimensions, not add any text
    pane.addEvent({ type: "resize", timestamp: Date.now(), columns: 120, rows: 40 });

    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("output line");
    // Resize event itself must not inject any visible text
    expect(mockScreen.write.mock.calls.some((call: any) => String(call[0]).includes("resize"))).toBe(false);
  });

  it("ignores non-chunk events other than resize", () => {
    pane.addEvent({ type: "exit", timestamp: Date.now(), data: "0" });

    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("원본 CLI 출력"); // still empty-state
  });

  it("resets its buffer when cleared", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "hello",
    });

    pane.clear();
    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("원본 CLI 출력");
    expect(output).not.toContain("hello");
  });

  it("scrollToBottom resets scroll offset to 0 and new data auto-resets scroll", () => {
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "line1\n" });
    pane.scrollUp();
    pane.scrollUp();
    pane.scrollToBottom();

    // After scrollToBottom, new data should still keep offset at 0
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "line2\n" });
    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("line2");
  });

  it("scrollDown does not go below 0", () => {
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "line\n" });
    // scrollDown at bottom should be a no-op
    pane.scrollDown();
    pane.scrollDown();
    pane.render(mockContext, mockRegion);

    const output = mockScreen.write.mock.calls.map((call: any) => call[0]).join("\n");
    expect(output).toContain("line");
  });

  it("rebuilds compact render lines lazily and reuses them for the same width", () => {
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "line1\n" });
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "line2\n" });

    expect(pane.getDebugStats().renderCacheRebuildCount).toBe(0);

    expect(pane.getRenderableLines(80).length).toBeGreaterThan(0);
    expect(pane.getDebugStats().renderCacheRebuildCount).toBe(1);

    pane.getRenderableLines(80);
    pane.getViewportTrackingInfo(80, 10);
    expect(pane.getDebugStats().renderCacheRebuildCount).toBe(1);

    pane.getRenderableLines(100);
    expect(pane.getDebugStats().renderCacheRebuildCount).toBe(2);
  });

  it("scrollUp clamps at total row count and does not crash on empty buffer", () => {
    // Scrolling on empty pane must not throw
    expect(() => {
      pane.scrollUp();
      pane.scrollUp();
      pane.render(mockContext, mockRegion);
    }).not.toThrow();
  });

  // T1: exec completed — gutter ▎ + ✓ icon
  it("adds ▎ gutter and ✓ icon to completed exec blocks", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "exec",
        `/bin/zsh -lc "rg -n \\"query\\" src"`,
        "succeeded in 125ms:",
        "src/foo.ts:1:result",
        "",
      ].join("\n"),
    });

    const lines = pane.getRenderableLines(80);
    const combined = lines.map((l) => l.text).join("\n");
    expect(combined).toContain("▎");
    expect(combined).toContain("✓");
    expect(combined).not.toContain("succeeded in 125ms");
  });

  // T2: exec failed — gutter ▎ + ✗ icon
  it("adds ▎ gutter and ✗ icon to failed exec blocks", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: ["exec", "git push origin main", "failed in 800ms:", ""].join("\n"),
    });

    const lines = pane.getRenderableLines(80);
    const combined = lines.map((l) => l.text).join("\n");
    expect(combined).toContain("▎");
    expect(combined).toContain("✗");
    expect(combined).not.toContain("failed in 800ms");
  });

  // T4: metadata block — ▎ gutter + ▣ adapter badge
  it("adds ▎ gutter and ▣ badge to metadata blocks", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "OpenAI Codex v0.130.0\nmodel: gpt-4o\nprovider: openai\n--------\n",
    });

    const lines = pane.getRenderableLines(80);
    const combined = lines.map((l) => l.text).join("\n");
    expect(combined).toContain("▎");
    expect(combined).toContain("▣");
    expect(combined).toContain("OpenAI Codex");
  });

  // T5: tool activity icons per type
  it("uses ◐ icon for web search tool activity", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "web search: detoks README\n",
    });

    const lines = pane.getRenderableLines(80);
    const combined = lines.map((l) => l.text).join("\n");
    expect(combined).toContain("▎");
    expect(combined).toContain("◐");
  });

  it("uses ▢ icon for mcp tool activity", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "mcp tool call result\n",
    });

    const lines = pane.getRenderableLines(80);
    const combined = lines.map((l) => l.text).join("\n");
    expect(combined).toContain("▎");
    expect(combined).toContain("▢");
  });

  // T3: spinner frame rotates deterministically from now/runStartedAt
  it("rotates running exec spinner frames deterministically from now/runStartedAt", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: ["exec", "npm test", ""].join("\n"),
    });

    const startedAt = 1_000;
    const frame0 = pane.getRenderableLines(80, undefined, 0, { now: 1_000, runStartedAt: startedAt })
      .map((l) => l.text).join("\n");
    const frame1 = pane.getRenderableLines(80, undefined, 0, { now: 1_250, runStartedAt: startedAt })
      .map((l) => l.text).join("\n");
    const frame4 = pane.getRenderableLines(80, undefined, 0, { now: 2_000, runStartedAt: startedAt })
      .map((l) => l.text).join("\n");

    expect(frame0).toContain("⠋");
    expect(frame1).toContain("⠙");
    expect(frame4).toContain("⠼");
  });

  // T6: elapsed label formatting
  it("shows elapsed label for long-running exec summaries", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: ["exec", "npm run build", ""].join("\n"),
    });

    const seconds = pane.getRenderableLines(80, undefined, 0, { now: 5_000, runStartedAt: 1_000 })
      .map((l) => l.text).join("\n");
    const minutes = pane.getRenderableLines(80, undefined, 0, { now: 73_000, runStartedAt: 1_000 })
      .map((l) => l.text).join("\n");

    expect(seconds).toContain("(4s)");
    expect(minutes).toContain("(1m12s)");
  });

  // T7: getStatusBannerLine — approval pending → banner, otherwise null
  it("getStatusBannerLine returns a warn banner when approval is pending", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "approval required (y/n)\n",
    });

    const banner = pane.getStatusBannerLine(80, { now: Date.now() });
    expect(banner).not.toBeNull();
    expect(banner?.severity).toBe("warn");
    expect(banner?.text).toContain("⚠");
    expect(banner?.text).toContain("승인 대기");
  });

  it("getStatusBannerLine returns null when no approval is pending", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "hello world\n",
    });

    expect(pane.getStatusBannerLine(80, { now: Date.now() })).toBeNull();
  });

  // T8: banner clears after approval resolves
  it("getStatusBannerLine clears after subsequent output resolves approval", () => {
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "approval required (y/n)\n" });
    expect(pane.getStatusBannerLine(80, { now: Date.now() })).not.toBeNull();

    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "approved, continuing\n" });
    expect(pane.getStatusBannerLine(80, { now: Date.now() })).toBeNull();
  });

  // T9: getFocusFooterLine — correct hint per focus state
  it("getFocusFooterLine includes Ctrl+T hint for detoks-input focus", () => {
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "output\n" });
    const footer = pane.getFocusFooterLine(80, "detoks-input");
    expect(footer).toContain("Ctrl+T");
  });

  it("getFocusFooterLine includes Esc/Ctrl+G hint for adapter-terminal focus", () => {
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "output\n" });
    const footer = pane.getFocusFooterLine(80, "adapter-terminal");
    expect(footer).toContain("Esc");
    expect(footer).toContain("Ctrl+G");
  });

  // T10: getScrollIndicator — null when pinned to bottom, indicator when scrolled
  it("getScrollIndicator returns null when pinned to bottom", () => {
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "line1\nline2\n" });
    expect(pane.getScrollIndicator(80, 10)).toBeNull();
  });

  it("getScrollIndicator returns ▒ indicator when scrolled up", () => {
    // Add enough lines to enable scrolling
    for (let i = 0; i < 20; i++) {
      pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: `line ${i}\n` });
    }
    pane.scrollUp();
    pane.scrollUp();
    const indicator = pane.getScrollIndicator(80, 5);
    expect(indicator).not.toBeNull();
    expect(indicator).toContain("▒");
  });

  // T11: narrow terminal (maxWidth < 20) — no gutter
  it("omits the gutter in narrow terminals (maxWidth < 20)", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "exec",
        `/bin/zsh -lc "rg query src"`,
        "succeeded in 0ms:",
        "",
      ].join("\n"),
    });

    const lines = pane.getRenderableLines(15);
    const combined = lines.map((l) => l.text).join("\n");
    expect(combined).not.toContain("▎");
  });

  // T12: spinner-only refresh rebuilds compact lines without rebuilding rows cache
  it("rebuilds only compact lines when spinner frame changes on the same width", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: ["exec", "npm test", ""].join("\n"),
    });

    pane.getRenderableLines(80, undefined, 0, { now: 1_000, runStartedAt: 1_000 });
    const afterFirst = pane.getDebugStats();

    pane.getRenderableLines(80, undefined, 0, { now: 1_250, runStartedAt: 1_000 });
    const afterSpinner = pane.getDebugStats();

    expect(afterFirst.renderCacheRebuildCount).toBe(1);
    expect(afterSpinner.renderCacheRebuildCount).toBe(1);
    expect(afterSpinner.compactRebuildCount).toBeGreaterThan(afterFirst.compactRebuildCount);
  });
});
