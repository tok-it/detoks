import { describe, expect, it } from "vitest";
import { getCliUsage, parseCliArgs } from "../../../../src/cli/parse.js";

describe("parseCliArgs", () => {
  it("treats an empty invocation as a main help request", () => {
    const parsed = parseCliArgs([]);
    expect(parsed).toEqual({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      trace: false,
      showHelp: true,
      helpTopic: "main",
    });
  });

  it("parses one-shot mode with defaults", () => {
    const parsed = parseCliArgs(["hello detoks"]);
    expect(parsed).toEqual({
      mode: "run",
      prompt: "hello detoks",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "main",
    });
  });

  it("parses repl mode with flags", () => {
    const parsed = parseCliArgs([
      "repl",
      "--adapter",
      "gemini",
      "--model",
      "gemini-2.5-pro",
      "--execution-mode",
      "real",
      "--verbose",
    ]);
    expect(parsed).toEqual({
      mode: "repl",
      adapter: "gemini",
      model: "gemini-2.5-pro",
      executionMode: "real",
      verbose: true,
      trace: false,
      showHelp: false,
      helpTopic: "repl",
    });
  });

  it("parses repl mode without an adapter so startup can prompt for one", () => {
    const parsed = parseCliArgs(["repl"]);
    expect(parsed).toEqual({
      mode: "repl",
      executionMode: "stub",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "repl",
    });
  });

  it("parses batch file mode", () => {
    const parsed = parseCliArgs(["--file", "tests/data/row_data.json", "--verbose"]);
    expect(parsed).toEqual({
      mode: "run",
      inputFile: "tests/data/row_data.json",
      adapter: "codex",
      executionMode: "real",
      verbose: true,
      trace: false,
      showHelp: false,
      helpTopic: "main",
    });
  });

  it("parses session list as the read-only session entrypoint", () => {
    const parsed = parseCliArgs(["session", "list"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "session-list",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "session-list",
    });
  });

  it("parses session list human output mode", () => {
    const parsed = parseCliArgs(["session", "list", "--human"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "session-list",
      human: true,
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "session-list",
    });
  });

  it("parses session show as the read-only session detail entrypoint", () => {
    const parsed = parseCliArgs(["session", "show", "session_2026_04_27"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "session-show",
      sessionId: "session_2026_04_27",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "session-show",
    });
  });

  it("parses session show human output mode", () => {
    const parsed = parseCliArgs(["session", "show", "session_2026_04_27", "--human"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "session-show",
      sessionId: "session_2026_04_27",
      human: true,
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "session-show",
    });
  });

  it("parses checkpoint list as a read-only session command", () => {
    const parsed = parseCliArgs(["checkpoint", "list", "session_2026_04_27"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "checkpoint-list",
      sessionId: "session_2026_04_27",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "checkpoint-list",
    });
  });

  it("parses session continue as a session resume entrypoint", () => {
    const parsed = parseCliArgs(["session", "continue", "session_2026_04_27"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "session-continue",
      sessionId: "session_2026_04_27",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "session-continue",
    });
  });

  it("parses session fork as a session mutation entrypoint", () => {
    const parsed = parseCliArgs(["session", "fork", "session_2026_04_27", "session_2026_04_27_fork"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "session-fork",
      sessionId: "session_2026_04_27",
      newSessionId: "session_2026_04_27_fork",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "session-fork",
    });
  });

  it("parses session reset as a destructive session mutation entrypoint", () => {
    const parsed = parseCliArgs(["session", "reset", "session_2026_04_27"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "session-reset",
      sessionId: "session_2026_04_27",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "session-reset",
    });
  });

  it("parses checkpoint show as the next read-only checkpoint command", () => {
    const parsed = parseCliArgs(["checkpoint", "show", "session_2026_04_27_checkpoint_001"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "checkpoint-show",
      checkpointId: "session_2026_04_27_checkpoint_001",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "checkpoint-show",
    });
  });

  it("parses checkpoint restore as a checkpoint mutation entrypoint", () => {
    const parsed = parseCliArgs(["checkpoint", "restore", "session_2026_04_27_checkpoint_001"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "checkpoint-restore",
      checkpointId: "session_2026_04_27_checkpoint_001",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "checkpoint-restore",
    });
  });

  it("parses help flags without treating them as errors", () => {
    const parsed = parseCliArgs(["--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      adapter: "codex",
      executionMode: "real",
      verbose: false,
      showHelp: true,
      helpTopic: "main",
    });
  });

  it("accepts -h as a help alias", () => {
    const parsed = parseCliArgs(["-h"]);
    expect(parsed).toMatchObject({
      showHelp: true,
      helpTopic: "main",
    });
  });

  it("treats help as higher priority than normal parsing", () => {
    const parsed = parseCliArgs(["hello detoks", "--help"]);
    expect(parsed).toMatchObject({
      showHelp: true,
      adapter: "codex",
      executionMode: "real",
      helpTopic: "main",
    });
  });

  it("parses repl help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["repl", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "repl",
    });
  });

  it("parses session list help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["session", "list", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "session-list",
    });
  });

  it("parses session continue help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["session", "continue", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "session-continue",
    });
  });

  it("parses session show help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["session", "show", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "session-show",
    });
  });

  it("parses session fork help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["session", "fork", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "session-fork",
    });
  });

  it("parses session reset help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["session", "reset", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "session-reset",
    });
  });

  it("parses checkpoint list help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["checkpoint", "list", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "checkpoint-list",
    });
  });

  it("parses checkpoint show help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["checkpoint", "show", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "checkpoint-show",
    });
  });

  it("parses checkpoint restore help as a topic-specific help request", () => {
    const parsed = parseCliArgs(["checkpoint", "restore", "--help"]);
    expect(parsed).toMatchObject({
      mode: "run",
      showHelp: true,
      helpTopic: "checkpoint-restore",
    });
  });

  it("documents execution mode differences in main help", () => {
    const usage = getCliUsage("main");
    expect(usage).toContain("예시:");
    expect(usage).toContain("detoks");
    expect(usage).toContain("detoks                         인자 없이 실행하면 대화형 REPL로 진입합니다");
    expect(usage).toContain("detoks repl [--adapter codex|gemini] [--execution-mode stub|real] [--session <id>] [--verbose]");
    expect(usage).toContain("detoks --file tests/data/row_data.json --verbose");
    expect(usage).toContain("--file <경로>");
    expect(usage).toContain("detoks repl --adapter codex --model gpt-5 --execution-mode stub");
    expect(usage).toContain("세션 / 체크포인트 명령어:");
    expect(usage).toContain("detoks session list");
    expect(usage).toContain("detoks session list --human");
    expect(usage).toContain("detoks session show <session-id> [--human]");
    expect(usage).toContain("detoks session show session_2026_04_27");
    expect(usage).toContain("detoks session show session_2026_04_27 --human");
    expect(usage).toContain("detoks session continue <session-id>");
    expect(usage).toContain("detoks session continue session_2026_04_27");
    expect(usage).toContain("detoks session reset <세션-id>");
    expect(usage).toContain("detoks session reset session_2026_04_27");
    expect(usage).toContain("detoks session fork <원본-세션-id> <새-세션-id>");
    expect(usage).toContain("detoks session fork session_2026_04_27 session_2026_04_27_fork");
    expect(usage).toContain("detoks checkpoint list <세션-id>");
    expect(usage).toContain("detoks checkpoint show <체크포인트-id>");
    expect(usage).toContain("detoks checkpoint list session_2026_04_27");
    expect(usage).toContain("detoks checkpoint show session_2026_04_27_checkpoint_001");
    expect(usage).toContain("detoks checkpoint restore <체크포인트-id>");
    expect(usage).toContain("detoks checkpoint restore session_2026_04_27_checkpoint_001");
    expect(usage).toContain("인자 없이 실행하면 대화형 REPL로 진입합니다");
    expect(usage).toContain("로컬 LLM 환경 변수(현재 cwd의 .env / .env.local에서 읽음):");
    expect(usage).toContain("LOCAL_LLM_API_BASE, LOCAL_LLM_API_KEY, LOCAL_LLM_MODEL_NAME");
    expect(usage).toContain("--model <이름>");
    expect(usage).toContain("--session <id>");
    expect(usage).toContain("실행 모드:");
    expect(usage).toContain("stub = 빠르고 안전한 CLI 테스트를 위한 모의 출력");
    expect(usage).toContain("real = 어댑터의 실제 실행 경로를 사용합니다");
    expect(usage).toContain("성공 JSON과 에러 스택을 전체 출력합니다(출력 전용)");
  });

  it("documents execution mode differences in repl help", () => {
    const usage = getCliUsage("repl");
    expect(usage).toContain("예시:");
    expect(usage).toContain("detoks repl --adapter codex --execution-mode stub");
    expect(usage).toContain("execution-mode는 프롬프트를 모의 실행으로 할지 실제 실행으로 할지 결정합니다");
    expect(usage).toContain("stub = 빠르고 안전한 CLI 테스트를 위한 모의 출력");
    expect(usage).toContain("real = 어댑터의 실제 실행 경로를 사용합니다");
    expect(usage).toContain("성공 JSON과 에러 스택을 전체 출력합니다(출력 전용)");
  });

  it("documents session list as a read-only command with a minimal stdout contract", () => {
    const usage = getCliUsage("session-list");
    expect(usage).toContain("detoks session list [--human]");
    expect(usage).toContain("읽기 전용이며 세션 상태를 생성/이어가기/초기화/포크/수정하지 않습니다");
    expect(usage).toContain("mutatesState=false");
    expect(usage).toContain("hasSessions");
    expect(usage).toContain("sessionCount");
    expect(usage).toContain("completedTaskCount");
    expect(usage).toContain("--human");
    expect(usage).toContain("마지막 작업 요약");
  });

  it("documents session show as a read-only command with stored task output previews", () => {
    const usage = getCliUsage("session-show");
    expect(usage).toContain("detoks session show <session-id> [--human]");
    expect(usage).toContain("저장된 세션의 요약과 작업 결과를 읽기 전용으로 보여줍니다");
    expect(usage).toContain("세션이 없으면 stdout에 안내 메시지를 반환합니다");
    expect(usage).toContain("--human");
    expect(usage).toContain("--verbose");
    expect(usage).toContain("raw_output 전체");
  });

  it("documents session continue as a session resume command", () => {
    const usage = getCliUsage("session-continue");
    expect(usage).toContain("detoks session continue <session-id>");
    expect(usage).toContain("저장된 raw_input을 다시 재생해 세션 실행을 이어갑니다");
    expect(usage).toContain("세션에서 이미 완료된 task id는 건너뛰고, 대기/실패 작업만 다시 시도합니다");
    expect(usage).toContain("세션이 없거나 저장된 raw_input이 없으면 왜 다시 시작하지 않았는지 stdout에 설명합니다");
    expect(usage).toContain("stderr로 자동 출력");
    expect(usage).toContain("resumeOverview");
    expect(usage).toContain("message");
    expect(usage).toContain("resumeStarted");
    expect(usage).toContain("taskRecords");
  });

  it("documents session fork as a minimal mutation command", () => {
    const usage = getCliUsage("session-fork");
    expect(usage).toContain("detoks session fork <source-session-id> <new-session-id>");
    expect(usage).toContain("기존 저장된 세션을 새 session id로 복사합니다");
    expect(usage).toContain("원본 세션 존재 여부를 확인하고, 이미 존재하는 대상 session id는 덮어쓰지 않습니다");
    expect(usage).toContain("다시 시작 실행을 하지 않으며 task 결과도 수정하지 않습니다");
    expect(usage).toContain("exit code 1");
    expect(usage).toContain("sourceSessionId");
    expect(usage).toContain("newSessionId");
  });

  it("documents session reset as a destructive session mutation command", () => {
    const usage = getCliUsage("session-reset");
    expect(usage).toContain("detoks session reset <session-id>");
    expect(usage).toContain("세션 상태와 모든 task 결과를 삭제합니다");
    expect(usage).toContain("위험합니다. 되돌릴 수 없습니다");
    expect(usage).toContain("mutatesState");
    expect(usage).toContain("종료 코드 1");
    expect(usage).toContain("reset=true");
  });

  it("documents checkpoint list as a read-only command", () => {
    const usage = getCliUsage("checkpoint-list");
    expect(usage).toContain("detoks checkpoint list <session-id>");
    expect(usage).toContain("읽기 전용이며 세션 상태를 복원하거나 수정하지 않습니다");
    expect(usage).toContain("mutatesState=false");
    expect(usage).toContain("hasCheckpoints");
    expect(usage).toContain("checkpoints=[]");
  });

  it("documents checkpoint show as a read-only command", () => {
    const usage = getCliUsage("checkpoint-show");
    expect(usage).toContain("detoks checkpoint show <checkpoint-id>");
    expect(usage).toContain("읽기 전용이며 세션 상태를 복원하거나 수정하지 않습니다");
    expect(usage).toContain("mutatesState=false");
    expect(usage).toContain("message");
    expect(usage).toContain("changedFiles");
    expect(usage).toContain("nextAction");
  });

  it("documents checkpoint restore as a checkpoint mutation command", () => {
    const usage = getCliUsage("checkpoint-restore");
    expect(usage).toContain("detoks checkpoint restore <checkpoint-id>");
    expect(usage).toContain("세션을 이 체크포인트 시점의 상태로 복원합니다");
    expect(usage).toContain("이 체크포인트 이후의 task 결과는 잘려 나갑니다");
    expect(usage).toContain("mutatesState");
    expect(usage).toContain("종료 코드 1");
    expect(usage).toContain("restored=true");
  });

  it("adds actionable guidance to parse errors", () => {
    expect(() => parseCliArgs(["--execution-mode"])).toThrow(
      /사용법은 `detoks --help`를 확인하세요/,
    );
    expect(() => parseCliArgs(["--unknown"])).toThrow(/사용법은 `detoks --help`를 확인하세요/);
    expect(() => parseCliArgs(["hello detoks", "--file", "input.json"])).toThrow(
      /프롬프트 입력과 --file은 함께 사용할 수 없습니다/,
    );
    expect(() => parseCliArgs(["session", "list", "extra"])).toThrow(
      /세션 목록은 인수를 받지 않습니다/,
    );
    expect(() => parseCliArgs(["session", "continue"])).toThrow(
      /세션 continue에는 <session-id> 하나만 필요합니다/,
    );
    expect(() => parseCliArgs(["session", "show"])).toThrow(
      /세션 show에는 <session-id> 하나만 필요합니다/,
    );
    expect(() => parseCliArgs(["session", "show", "extra", "arg"])).toThrow(
      /세션 show에는 <session-id> 하나만 필요합니다/,
    );
    expect(() => parseCliArgs(["session", "reset"])).toThrow(
      /세션 reset에는 <session-id> 하나만 필요합니다/,
    );
    expect(() => parseCliArgs(["session", "fork", "source_only"])).toThrow(
      /세션 fork에는 <source-session-id> 하나와 <new-session-id> 하나가 필요합니다/,
    );
    expect(() => parseCliArgs(["checkpoint", "list"])).toThrow(
      /체크포인트 list에는 <session-id> 하나만 필요합니다/,
    );
    expect(() => parseCliArgs(["checkpoint", "show"])).toThrow(
      /체크포인트 show에는 <checkpoint-id> 하나만 필요합니다/,
    );
    expect(() => parseCliArgs(["checkpoint", "restore"])).toThrow(
      /체크포인트 restore에는 <checkpoint-id> 하나만 필요합니다/,
    );
  });
});
