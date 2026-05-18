import { describe, expect, it, beforeEach, vi } from "vitest";
import { EmbeddedTerminalPane } from "../../../../../../src/cli/tui/panels/embedded-terminal.js";
import { measureDisplayWidth } from "../../../../../../src/cli/tui/renderer.js";

const stripAnsi = (value: string): string =>
  value.replace(/\x1b\[[0-9;]*m/g, "");

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

  it("tracks appended final answers for embedded fallback dedupe", () => {
    expect(pane.hasFinalAnswer()).toBe(false);
    expect(pane.getLastFinalAnswer()).toBeNull();

    pane.appendFinalAnswer("final answer");

    expect(pane.hasFinalAnswer()).toBe(true);
    expect(pane.getLastFinalAnswer()).toBe("final answer");
  });

  it("extracts final answers from codex json events", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "{\"type\":\"item.completed\",\"item\":{\"type\":\"assistant_message\",\"text\":\"Detoks is the CLI workspace.\"}}\n",
    });
    pane.addEvent({ type: "exit", timestamp: Date.now(), data: "0" });

    expect(pane.getLastFinalAnswer()).toBe("Detoks is the CLI workspace.");
    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("Detoks is the CLI workspace.");
  });

  it("keeps streamed final-answer candidates hidden until exit", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "{\"type\":\"item.completed\",\"item\":{\"type\":\"assistant_message\",\"text\":\"임시 목표 문장입니다.\"}}\n",
    });

    expect(pane.getLastFinalAnswer()).toBeNull();
    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).not.toContain("최종 결과");
    expect(output).not.toContain("임시 목표 문장입니다.");
  });

  it("does not promote started assistant messages into the final result block", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "{\"type\":\"item.started\",\"item\":{\"type\":\"assistant_message\",\"text\":\"숨김 상태 디렉터리에 목적 단서가 있을 수 있어 그 안도 확인하겠습니다.\"}}",
        "{\"type\":\"item.completed\",\"item\":{\"type\":\"assistant_message\",\"text\":\"최종 요약 결과입니다.\"}}",
      ].join("\n"),
    });
    pane.addEvent({ type: "exit", timestamp: Date.now(), data: "0" });

    expect(pane.getLastFinalAnswer()).toBe("최종 요약 결과입니다.");
    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("최종 요약 결과입니다.");
    expect(output).not.toContain("숨김 상태 디렉터리에 목적 단서가 있을 수 있어 그 안도 확인하겠습니다.");
  });

  it("renders goal-prefixed assistant messages as live output instead of final answer", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "{\"type\":\"item.completed\",\"item\":{\"type\":\"assistant_message\",\"text\":\"Goal: 현재 디렉터리 프로젝트의 목적을 파악합니다.\"}}\n",
    });

    expect(pane.getLastFinalAnswer()).toBeNull();
    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("Goal: 현재 디렉터리 프로젝트의 목적을 파악합니다.");
    expect(output).not.toContain("최종 결과");
  });

  it("renders started goal-prefixed assistant messages as live output", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "{\"type\":\"item.started\",\"item\":{\"type\":\"assistant_message\",\"text\":\"Goal: 현재 디렉터리 프로젝트의 목적을 파악합니다.\"}}\n",
    });

    expect(pane.getLastFinalAnswer()).toBeNull();
    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("Goal: 현재 디렉터리 프로젝트의 목적을 파악합니다.");
    expect(output).not.toContain("최종 결과");
  });

  it("pins the latest final answer as a dedicated footer block after long activity history", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "{\"type\":\"item.completed\",\"item\":{\"type\":\"command_execution\",\"command\":\"ls -la\",\"exit_code\":0,\"aggregated_output\":\"file1\\nfile2\"}}",
        "{\"type\":\"item.completed\",\"item\":{\"type\":\"assistant_message\",\"text\":\"The workspace contains the detoks CLI project.\"}}",
      ].join("\n"),
    });
    pane.addEvent({ type: "exit", timestamp: Date.now(), data: "0" });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("최종 결과");
    expect(output).toContain("The workspace contains the detoks CLI project.");
    expect(output).not.toContain("┌");
    expect(output).not.toContain("└");
  });

  it("keeps the final result header visible when the answer is taller than the pane", () => {
    pane.appendFinalAnswer([
      "첫 줄입니다.",
      "둘째 줄입니다.",
      "셋째 줄입니다.",
      "넷째 줄입니다.",
      "다섯째 줄입니다.",
    ].join("\n"));

    const output = pane.getRenderableLines(20, 4).map((line) => line.text).join("\n");
    expect(output).toContain("최종 결과");
    expect(output).toContain("첫 줄입니다.");
    expect(output).not.toContain("다섯째 줄입니다.");
  });

  it("wraps Korean final answer text by display width", () => {
    pane.appendFinalAnswer(
      "현대 IT팀 다음 주 미팅용 15장 발표 구조안을 정리해 두었습니다. 이전 미팅에서 나온 핵심 이슈를 반영했습니다.",
    );

    const rendered = pane.getRenderableLines(24).map((line) => stripAnsi(line.text));
    const bodyLines = rendered
      .filter((line) => line.trim().length > 0)
      .filter((line) => !line.includes("최종 결과"));

    expect(bodyLines.length).toBeGreaterThan(1);
    for (const line of bodyLines) {
      expect(measureDisplayWidth(line.trimEnd())).toBeLessThanOrEqual(24);
    }
  });

  it("formats final answer bullets with readable continuation indentation", () => {
    pane.appendFinalAnswer([
      "## 다음 단계",
      "1. 현대 IT팀 질문 대응용 Q&A 스크립트를 한 페이지로 정리합니다.",
      "2. 임원용 축약본을 별도 문서로 만듭니다.",
    ].join("\n"));

    const rendered = pane.getRenderableLines(34).map((line) => stripAnsi(line.text).trimEnd());
    const bodyLines = rendered
      .filter((line) => line.trim().length > 0)
      .filter((line) => !line.includes("최종 결과"));

    expect(bodyLines.some((line) => line.includes("##"))).toBe(false);
    expect(bodyLines).toContain(" 다음 단계");
    expect(bodyLines.some((line) => line.startsWith(" 1. "))).toBe(true);
    expect(bodyLines.some((line) => line.startsWith("    ") && line.trim().length > 0)).toBe(true);
    for (const line of bodyLines) {
      expect(measureDisplayWidth(line)).toBeLessThanOrEqual(34);
    }
  });

  it("maps codex web_search json events into the existing tool activity card", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "{\"type\":\"item.started\",\"item\":{\"type\":\"web_search\",\"query\":\"detoks cli docs\"}}\n",
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("웹 검색");
    expect(output).toContain("detoks cli docs");
    expect(pane.getActivitySnapshot(120)).toMatchObject({
      kind: "tool",
      label: "웹 검색",
      detail: "detoks cli docs",
      status: "running",
    });
  });

  it("maps codex command_execution json events into the existing file read activity card", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "{\"type\":\"item.completed\",\"item\":{\"type\":\"command_execution\",\"command\":\"printf 'hello'\",\"exit_code\":0,\"aggregated_output\":\"line1\\nline2\"}}\n",
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("명령 실행");
    expect(output).toContain("printf");
    expect(pane.getActivitySnapshot(120)).toMatchObject({
      kind: "command",
      label: "명령 실행",
      detail: "printf",
      status: "completed",
    });
    expect(output).not.toContain("\nexec\n");
  });

  it("labels goal-like command previews as intent instead of completed", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "{\"type\":\"item.completed\",\"item\":{\"type\":\"command_execution\",\"command\":\"find . -maxdepth 1\",\"exit_code\":0,\"aggregated_output\":\"Goal: 현재 디렉터리 프로젝트의 목적을 파악합니다.\"}}\n",
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("완료");
    expect(output).toContain("Goal: 현재 디렉터리 프로젝트의 목적을 파악합니다.");
  });

  it("shows intent lines for native exec blocks with goal output", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "exec",
        "/bin/zsh -lc 'find . -maxdepth 1'",
        "succeeded in 42ms",
        "Goal: 현재 디렉터리 프로젝트의 목적을 파악합니다.",
      ].join("\n"),
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("성공");
    expect(output).toContain("Goal: 현재 디렉터리 프로젝트의 목적을 파악합니다.");
  });

  it("renders standalone goal lines as plain output", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "Goal: 현재 디렉터리 프로젝트의 목적을 파악합니다.\n",
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("Goal: 현재 디렉터리 프로젝트의 목적을 파악합니다.");
  });

  it("never leaves a raw exec sentinel behind for structured codex command events", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "{\"type\":\"item.started\",\"item\":{\"type\":\"command_execution\"}}\n",
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("명령 실행");
    expect(output).not.toContain("\nexec\n");
  });

  it("maps codex file_change json events into the existing edit activity card", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "{\"type\":\"item.completed\",\"item\":{\"type\":\"file_change\",\"changes\":[{\"path\":\"src/cli/tui/index.ts\",\"kind\":\"update\"}]}}\n",
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("Edit src/cli/tui/index.ts");
    expect(pane.getActivitySnapshot(120)).toMatchObject({
      kind: "edit",
      label: "Edit",
      detail: "src/cli/tui/index.ts",
      status: "completed",
    });
  });

  it("does not render codex lifecycle json lines in the embedded pane", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "{\"type\":\"turn.started\"}\n",
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).not.toContain("turn.started");
  });

  it("drops codex router stdin-closed noise after command completion", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stderr",
      data: "2026-05-18T14:49:28.081255Z ERROR codex_core::tools::router: error=write_stdin failed: stdin is closed for this session; rerun exec_command with tty=true to keep stdin open\n",
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).not.toContain("write_stdin failed");
    expect(output).toContain("원본 CLI 출력");
  });

  it("drops codex router stdin-closed noise from mixed stderr chunks", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stderr",
      data: [
        "실제 경고는 유지합니다.",
        "2026-05-18T14:49:28.081255Z ERROR codex_core::tools::router: error=write_stdin failed: stdin is closed for this session; rerun exec_command with tty=true to keep stdin open",
        "",
      ].join("\n"),
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("실제 경고는 유지합니다.");
    expect(output).not.toContain("write_stdin failed");
  });

  it("drops ansi-prefixed lifecycle json lines in the embedded pane", () => {
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: "\u001b[2m{\"type\":\"thread.started\"}\u001b[0m\n",
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).not.toContain("thread.started");
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

  it("compacts native Read blocks into title + detail lines", () => {
    mockRegion.columns = 120;
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "Read index.ts (lines 1883–1912)",
        "타입체크를 먼저 실행해서 오류를 확인합니다.",
      ].join("\n"),
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("[1883–1912]");
    expect(output).toContain("Read index.ts");
    expect(output).toContain("[NOTE]");
    expect(output).toContain("타입체크를 먼저 실행해서 오류를 확인합니다.");
    expect(pane.getActivitySnapshot(120)).toMatchObject({
      kind: "read",
      label: "Read",
      detail: "index.ts",
      status: "completed",
    });
  });

  it("compacts native Edit blocks and hides code preview noise", () => {
    mockRegion.columns = 140;
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "Edit index.ts",
        "Added 21 lines",
        "if (normalizedPrompt.startsWith(\"/\")) {",
        "Click to expand",
      ].join("\n"),
    });

    const output = pane.getRenderableLines(140).map((line) => line.text).join("\n");
    expect(output).toContain("Edit index.ts");
    expect(output).toContain("Added 21 lines");
    expect(output).not.toContain("Click to expand");
    expect(output).not.toContain("normalizedPrompt.startsWith");
    expect(pane.getActivitySnapshot(140)).toMatchObject({
      kind: "edit",
      label: "Edit",
      detail: "index.ts",
      status: "completed",
    });
  });

  it("shows inline code preview for small Edit blocks without expand hints", () => {
    mockRegion.columns = 140;
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "Edit index.ts",
        "Added 2 lines",
        "+ const syncScrollback = () => {",
        "+   runBlockScrollback.setEntries([]);",
      ].join("\n"),
    });

    const output = pane.getRenderableLines(140).map((line) => line.text).join("\n");
    expect(output).toContain("Edit index.ts");
    expect(output).toContain("[+2]");
    expect(output).toContain("Added 2 lines");
    expect(output).toContain("+ const syncScrollback = () => {");
    expect(output).toContain("+   runBlockScrollback.setEntries([]);");
  });

  it("shows mixed edit count badge when both added and removed lines exist", () => {
    mockRegion.columns = 140;
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "Edit index.ts",
        "Added 2 lines",
        "Removed 1 line",
      ].join("\n"),
    });

    const output = pane.getRenderableLines(140).map((line) => line.text).join("\n");
    expect(output).toContain("[+2/-1]");
  });

  it("compacts native Bash blocks into concise summaries", () => {
    mockRegion.columns = 120;
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "Bash Push dev branch to remote",
        "IN git push origin dev 2>&1",
        "OUT Exit code 1",
      ].join("\n"),
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("Bash Push dev branch to remote");
    expect(output).toContain("[git]");
    expect(output).toContain("[IN]");
    expect(output).toContain("git push origin dev 2>&1");
    expect(output).toContain("[OUT]");
    expect(output).toContain("Exit code 1");
    expect(pane.getActivitySnapshot(120)).toMatchObject({
      kind: "command",
      label: "Bash",
      detail: "Push dev branch to remote",
      status: "failed",
    });
  });

  it("classifies bash test commands with a [test] badge", () => {
    mockRegion.columns = 120;
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "Bash Run validation",
        "IN npm test -- --runInBand",
        "OUT Exit code 0",
      ].join("\n"),
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("[test]");
    expect(output).toContain("[OK]");
  });

  it("classifies bash read commands with a [read] badge", () => {
    mockRegion.columns = 120;
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "Bash Inspect file",
        "IN sed -n '1,20p' src/index.ts",
      ].join("\n"),
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("[read]");
  });

  it("classifies unknown bash commands with a [cmd] badge", () => {
    mockRegion.columns = 120;
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "Bash Custom step",
        "IN echo hello",
      ].join("\n"),
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("[cmd]");
  });

  it("formats Thought title rows with the same compact card typography", () => {
    mockRegion.columns = 120;
    pane.addEvent({
      type: "chunk",
      timestamp: Date.now(),
      stream: "stdout",
      data: [
        "Thought for 3s",
        "/clear 명령 처리를 handleSlashCommand 호출 전에 삽입합니다.",
      ].join("\n"),
    });

    const output = pane.getRenderableLines(120).map((line) => line.text).join("\n");
    expect(output).toContain("Thought");
    expect(output).toContain("3s");
    expect(output).toContain("handleSlashCommand");
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
    expect(combined).toContain("succeeded in 125ms");
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
    expect(combined).toContain("failed in 800ms");
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

  // T8b: multi-row approval dialog (verb on one row, [y/N] hint on another)
  it("getStatusBannerLine detects multi-row approval when verb and hint are on separate rows", () => {
    // Simulate codex box-style approval dialog
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "╭─ Execute Command? ───────────────────╮\n" });
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "│ curl -I https://api.github.com      │\n" });
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "│ Allow? [y/N]                        │\n" });
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "╰──────────────────────────────────────╯\n" });

    const banner = pane.getStatusBannerLine(80, { now: Date.now() });
    expect(banner).not.toBeNull();
    expect(banner?.severity).toBe("warn");
    expect(banner?.text).toContain("승인 대기");
  });

  it("getStatusBannerLine clears multi-row approval when subsequent non-approval output appears", () => {
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "│ Allow? [y/N]                        │\n" });
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "╰──────────────────────────────────────╯\n" });
    expect(pane.getStatusBannerLine(80, { now: Date.now() })).not.toBeNull();

    // Non-approval output appears — approval resolved
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "HTTP/2 200\n" });
    expect(pane.getStatusBannerLine(80, { now: Date.now() })).toBeNull();
  });

  it("getStatusBannerLine does not detect approval from decorative-only border lines", () => {
    pane.addEvent({ type: "chunk", timestamp: Date.now(), stream: "stdout", data: "╰──────────────────────────────────────╯\n" });
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
