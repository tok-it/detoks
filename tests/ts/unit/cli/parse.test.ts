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
      executionMode: "stub",
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
      executionMode: "stub",
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
      executionMode: "stub",
      verbose: false,
      trace: false,
      showHelp: false,
      helpTopic: "session-list",
    });
  });

  it("parses checkpoint list as a read-only session command", () => {
    const parsed = parseCliArgs(["checkpoint", "list", "session_2026_04_27"]);
    expect(parsed).toEqual({
      mode: "run",
      command: "checkpoint-list",
      sessionId: "session_2026_04_27",
      adapter: "codex",
      executionMode: "stub",
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
      executionMode: "stub",
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
      executionMode: "stub",
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
      executionMode: "stub",
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
      executionMode: "stub",
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
      executionMode: "stub",
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
      executionMode: "stub",
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
      executionMode: "stub",
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
    expect(usage).toContain("DeToks CLI 가이드");
    expect(usage).toContain("빠른 시작:");
    expect(usage).toContain("예시:");
    expect(usage).toContain('detoks "현재 저장소 상태를 요약해줘"');
    expect(usage).toContain("detoks --file tests/data/row_data.json --verbose");
    expect(usage).toContain("--file <경로>");
    expect(usage).toContain("detoks repl --adapter codex --model gpt-5 --execution-mode stub");
    expect(usage).toContain("세션 / 체크포인트 명령어:");
    expect(usage).toContain("detoks session list");
    expect(usage).toContain("detoks session continue <세션-id>");
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
    expect(usage).toContain("로컬 LLM 환경 변수 (현재 cwd .env / .env.local에서 읽음):");
    expect(usage).toContain("LOCAL_LLM_API_BASE, LOCAL_LLM_API_KEY, LOCAL_LLM_MODEL_NAME");
    expect(usage).toContain("--model <이름>");
    expect(usage).toContain("--session <id>");
    expect(usage).toContain("실행 모드:");
    expect(usage).toContain("stub = 빠르고 안전한 CLI 테스트를 위한 시뮬레이션 출력");
    expect(usage).toContain("real = 어댑터의 실제 실행 경로를 사용");
    expect(usage).toContain("성공 JSON 전체와 에러 스택 출력");
  });

  it("documents execution mode differences in repl help", () => {
    const usage = getCliUsage("repl");
    expect(usage).toContain("예시:");
    expect(usage).toContain("detoks repl --adapter codex --model gpt-5 --execution-mode stub");
    expect(usage).toContain("/help 입력 시 REPL 내부 도움말 표시");
    expect(usage).toContain("/login 입력 시 화살표 키 어댑터 선택기와 로그인 흐름 시작");
    expect(usage).toContain("/session 입력 시 현재 REPL 세션과 런타임 설정 확인");
    expect(usage).toContain("/adapter codex|gemini 입력 시 이후 프롬프트의 어댑터를 직접 변경");
    expect(usage).toContain("/model 또는 /model <이름> 입력 시 어댑터 모델 확인 또는 변경");
    expect(usage).toContain("/verbose on|off 입력 시 간결/전체 출력을 직접 변경");
    expect(usage).toContain("--model <이름>");
    expect(usage).toContain("exit, quit, .exit, /exit, /quit 입력 시 REPL 종료");
    expect(usage).toContain("execution-mode로 프롬프트가 시뮬레이션 또는 실제 실행을 사용할지 결정합니다");
    expect(usage).toContain("stub = 빠르고 안전한 CLI 테스트를 위한 시뮬레이션 출력");
    expect(usage).toContain("real = 어댑터의 실제 실행 경로를 사용");
    expect(usage).toContain("성공 JSON 전체와 에러 스택 출력");
  });

  it("documents session list as a read-only command with a minimal stdout contract", () => {
    const usage = getCliUsage("session-list");
    expect(usage).toContain("detoks session list");
    expect(usage).toContain("읽기 전용");
    expect(usage).toContain("읽기 전용; 세션 생성·재개·초기화·포크·변경 없음");
    expect(usage).toContain("mutatesState=false");
    expect(usage).toContain("hasSessions");
    expect(usage).toContain("sessionCount");
    expect(usage).toContain("completedTaskCount");
  });

  it("documents session continue as a session resume command", () => {
    const usage = getCliUsage("session-continue");
    expect(usage).toContain("detoks session continue <세션-id>");
    expect(usage).toContain("raw_input을 재실행하여 실행을 재개합니다");
    expect(usage).toContain("이미 완료된 태스크 ID는 건너뛰고");
    expect(usage).toContain("세션이 없거나 저장된 raw_input이 없으면");
    expect(usage).toContain("message");
    expect(usage).toContain("resumeStarted");
    expect(usage).toContain("taskRecords");
  });

  it("documents session fork as a minimal mutation command", () => {
    const usage = getCliUsage("session-fork");
    expect(usage).toContain("detoks session fork <원본-세션-id> <새-세션-id>");
    expect(usage).toContain("기존 세션을 새 세션 ID로 복사합니다");
    expect(usage).toContain("새 세션 ID 중복 방지");
    expect(usage).toContain("실행 재개나 태스크 결과 변경 없음");
    expect(usage).toContain("종료 코드 1");
    expect(usage).toContain("sourceSessionId");
    expect(usage).toContain("newSessionId");
  });

  it("documents session reset as a destructive session mutation command", () => {
    const usage = getCliUsage("session-reset");
    expect(usage).toContain("detoks session reset <세션-id>");
    expect(usage).toContain("세션 상태와 모든 태스크 결과를 삭제합니다");
    expect(usage).toContain("위험; 되돌릴 수 없습니다");
    expect(usage).toContain("mutatesState");
    expect(usage).toContain("종료 코드 1");
    expect(usage).toContain("reset=true");
  });

  it("documents checkpoint list as a read-only command", () => {
    const usage = getCliUsage("checkpoint-list");
    expect(usage).toContain("detoks checkpoint list <세션-id>");
    expect(usage).toContain("읽기 전용");
    expect(usage).toContain("복원 또는 세션 상태 변경 없음");
    expect(usage).toContain("mutatesState=false");
    expect(usage).toContain("hasCheckpoints");
    expect(usage).toContain("checkpoints=[]");
  });

  it("documents checkpoint show as a read-only command", () => {
    const usage = getCliUsage("checkpoint-show");
    expect(usage).toContain("detoks checkpoint show <체크포인트-id>");
    expect(usage).toContain("읽기 전용");
    expect(usage).toContain("복원 또는 세션 상태 변경 없음");
    expect(usage).toContain("mutatesState=false");
    expect(usage).toContain("message");
    expect(usage).toContain("changedFiles");
    expect(usage).toContain("nextAction");
  });

  it("documents checkpoint restore as a checkpoint mutation command", () => {
    const usage = getCliUsage("checkpoint-restore");
    expect(usage).toContain("detoks checkpoint restore <체크포인트-id>");
    expect(usage).toContain("세션을 해당 체크포인트 시점의 상태로 복원합니다");
    expect(usage).toContain("이 체크포인트 이후의 태스크 결과는 삭제됩니다");
    expect(usage).toContain("mutatesState");
    expect(usage).toContain("종료 코드 1");
    expect(usage).toContain("restored=true");
  });

  it("adds actionable guidance to parse errors", () => {
    expect(() => parseCliArgs(["--execution-mode"])).toThrow(
      /`detoks --help`/,
    );
    expect(() => parseCliArgs(["--unknown"])).toThrow(/`detoks --help`/);
    expect(() => parseCliArgs(["hello detoks", "--file", "input.json"])).toThrow(
      /--file을 동시에 사용할 수 없습니다/,
    );
    expect(() => parseCliArgs(["session", "list", "extra"])).toThrow(
      /인수를 받지 않습니다/,
    );
    expect(() => parseCliArgs(["session", "continue"])).toThrow(
      /<세션-id> 하나가 필요합니다/,
    );
    expect(() => parseCliArgs(["session", "reset"])).toThrow(
      /<세션-id> 하나가 필요합니다/,
    );
    expect(() => parseCliArgs(["session", "fork", "source_only"])).toThrow(
      /<새-세션-id> 각각 하나가 필요합니다/,
    );
    expect(() => parseCliArgs(["checkpoint", "list"])).toThrow(
      /<세션-id> 하나가 필요합니다/,
    );
    expect(() => parseCliArgs(["checkpoint", "show"])).toThrow(
      /<체크포인트-id> 하나가 필요합니다/,
    );
    expect(() => parseCliArgs(["checkpoint", "restore"])).toThrow(
      /<체크포인트-id> 하나가 필요합니다/,
    );
  });
});
