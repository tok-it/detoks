import { UserRequestSchema } from "../schemas/pipeline.js";
import {
  AdapterValues,
  ExecutionModeValues,
  type CliArgs,
  type CliMode,
  type NormalizedCliRequest,
} from "./types.js";

const DEFAULT_ADAPTER = "codex";
const DEFAULT_EXECUTION_MODE = "stub";
const EXECUTION_MODE_HELP = [
  "실행 모드:",
  "    stub = 빠르고 안전한 CLI 테스트를 위한 시뮬레이션 출력",
  "    real = 어댑터의 실제 실행 경로를 사용",
].join("\n");
const VERBOSE_HELP =
  "  --verbose                     성공 JSON 전체와 에러 스택 출력 (출력 전용)";
const TRACE_HELP =
  "  --trace                       파이프라인 단계 I/O를 기록하고 local_config/trace/{sessionId}-trace.json에 저장";
const SESSION_FLAG_HELP =
  "  --session <id>                특정 세션 ID를 재개하거나 지정";
const MODEL_FLAG_HELP =
  "  --model <이름>                선택한 어댑터 CLI에 모델 이름을 전달";
const CLI_USAGE_MAIN = [
  "DeToks CLI 가이드",
  "",
  "빠른 시작:",
  '  detoks "현재 저장소 상태를 요약해줘"',
  "  detoks repl",
  "  detoks session list",
  "",
  "사용법:",
  '  detoks "<프롬프트>" [--adapter codex|gemini] [--model <이름>] [--execution-mode stub|real] [--session <id>] [--verbose] [--trace]',
  "  detoks --file <경로> [--verbose]",
  "  detoks repl [--adapter codex|gemini] [--model <이름>] [--execution-mode stub|real] [--session <id>] [--verbose]",
  "",
  "세션 / 체크포인트 명령어:",
  "  detoks session list",
  "  detoks session continue <세션-id>",
  "  detoks session reset <세션-id>",
  "  detoks session fork <원본-세션-id> <새-세션-id>",
  "  detoks checkpoint list <세션-id>",
  "  detoks checkpoint show <체크포인트-id>",
  "  detoks checkpoint restore <체크포인트-id>",
  "  detoks repl --help",
  "  detoks --help",
  "",
  "로컬 LLM 환경 변수 (현재 cwd .env / .env.local에서 읽음):",
  "  LOCAL_LLM_API_BASE, LOCAL_LLM_API_KEY, LOCAL_LLM_MODEL_NAME",
  "",
  "예시:",
  '  detoks "현재 저장소 상태를 요약해줘"',
  '  detoks "파이썬으로 버블 정렬 짜줘" --session session_123',
  "  detoks --file tests/data/row_data.json --verbose",
  "  detoks repl --adapter codex --model gpt-5 --execution-mode stub",
  "  detoks session list",
  "  detoks session continue session_2026_04_27",
  "  detoks session reset session_2026_04_27",
  "  detoks session fork session_2026_04_27 session_2026_04_27_fork",
  "  detoks checkpoint list session_2026_04_27",
  "  detoks checkpoint show session_2026_04_27_checkpoint_001",
  "  detoks checkpoint restore session_2026_04_27_checkpoint_001",
  "",
  "옵션:",
  "  --adapter codex|gemini        대상 어댑터 (기본값: codex)",
  MODEL_FLAG_HELP,
  "  --execution-mode stub|real    실행 모드 (기본값: stub)",
  "  --file <경로>                 JSON 파일에서 배치 프롬프트 컴파일 실행",
  SESSION_FLAG_HELP,
  EXECUTION_MODE_HELP,
  VERBOSE_HELP,
  TRACE_HELP,
  "  -h, --help                    도움말 표시",
].join("\n");

const CLI_USAGE_SESSION_LIST = [
  "사용법:",
  "  detoks session list",
  "",
  "예시:",
  "  detoks session list",
  "",
  "세션 목록 안내:",
  "  - 저장된 세션을 개요 형태로 나열합니다",
  "  - 읽기 전용; 세션 생성·재개·초기화·포크·변경 없음",
  "  - stdout은 JSON으로 mutatesState=false, hasSessions, sessionCount, message, sessions 포함",
  "  - 각 세션에는 id, updatedAt, currentTaskId, completedTaskCount, taskResultCount, nextAction 포함",
  "",
  "옵션:",
  "  -h, --help                    도움말 표시",
].join("\n");

const CLI_USAGE_SESSION_CONTINUE = [
  "사용법:",
  "  detoks session continue <세션-id>",
  "",
  "예시:",
  "  detoks session continue session_2026_04_27",
  "",
  "세션 재개 안내:",
  "  - 저장된 세션의 raw_input을 재실행하여 실행을 재개합니다",
  "  - 이미 완료된 태스크 ID는 건너뛰고 대기 중/실패한 작업을 재시도합니다",
  "  - 세션이 없거나 저장된 raw_input이 없으면 stdout에 사유를 설명합니다",
  "  - stdout은 JSON으로 sessionId, canContinue, resumeStarted, mutatesState, message, summary, nextAction, taskRecords 포함",
  "",
  "옵션:",
  "  -h, --help                    도움말 표시",
].join("\n");

const CLI_USAGE_SESSION_RESET = [
  "사용법:",
  "  detoks session reset <세션-id>",
  "",
  "예시:",
  "  detoks session reset session_2026_04_27",
  "",
  "세션 초기화 안내:",
  "  - 세션 상태와 모든 태스크 결과를 삭제합니다",
  "  - 위험; 되돌릴 수 없습니다",
  "  - 성공 시 stdout은 JSON으로 sessionId, reset=true, mutatesState=true, message 포함",
  "  - 없는 세션은 ok=false, mutatesState=false를 반환하고 종료 코드 1",
  "",
  "옵션:",
  "  -h, --help                    도움말 표시",
].join("\n");


const CLI_USAGE_SESSION_FORK = [
  "사용법:",
  "  detoks session fork <원본-세션-id> <새-세션-id>",
  "",
  "예시:",
  "  detoks session fork session_2026_04_27 session_2026_04_27_fork",
  "",
  "세션 포크 안내:",
  "  - 기존 세션을 새 세션 ID로 복사합니다",
  "  - 원본 세션 존재 여부 확인, 새 세션 ID 중복 방지",
  "  - 실행 재개나 태스크 결과 변경 없음",
  "  - stdout은 JSON으로 sourceSessionId, newSessionId, forked, mutatesState, message, nextAction 포함",
  "  - 없는 원본 세션 또는 중복 대상 ID는 ok=false, mutatesState=false를 반환하고 종료 코드 1",
  "",
  "옵션:",
  "  -h, --help                    도움말 표시",
].join("\n");

const CLI_USAGE_CHECKPOINT_LIST = [
  "사용법:",
  "  detoks checkpoint list <세션-id>",
  "",
  "예시:",
  "  detoks checkpoint list session_2026_04_27",
  "",
  "체크포인트 목록 안내:",
  "  - 기존 세션의 저장된 체크포인트를 나열합니다",
  "  - 읽기 전용; 복원 또는 세션 상태 변경 없음",
  "  - stdout은 JSON으로 sessionId, mutatesState=false, hasCheckpoints, checkpointCount, message, checkpoints 포함",
  "  - 빈 세션은 hasCheckpoints=false, checkpointCount=0, checkpoints=[] 반환",
  "",
  "옵션:",
  "  -h, --help                    도움말 표시",
].join("\n");


const CLI_USAGE_CHECKPOINT_SHOW = [
  "사용법:",
  "  detoks checkpoint show <체크포인트-id>",
  "",
  "예시:",
  "  detoks checkpoint show session_2026_04_27_checkpoint_001",
  "",
  "체크포인트 조회 안내:",
  "  - 체크포인트 ID로 저장된 메타데이터를 조회합니다",
  "  - 읽기 전용; 복원 또는 세션 상태 변경 없음",
  "  - stdout은 JSON으로 mutatesState=false, message, changedFiles, nextAction 등 체크포인트 메타데이터 포함",
  "",
  "옵션:",
  "  -h, --help                    도움말 표시",
].join("\n");

const CLI_USAGE_CHECKPOINT_RESTORE = [
  "사용법:",
  "  detoks checkpoint restore <체크포인트-id>",
  "",
  "예시:",
  "  detoks checkpoint restore session_2026_04_27_checkpoint_001",
  "",
  "체크포인트 복원 안내:",
  "  - 세션을 해당 체크포인트 시점의 상태로 복원합니다",
  "  - 이 체크포인트 이후의 태스크 결과는 삭제됩니다",
  "  - 성공 시 stdout은 JSON으로 sessionId, checkpointId, restored=true, mutatesState=true, message 포함",
  "  - 유효하지 않은 복원 대상은 ok=false, mutatesState=false를 반환하고 종료 코드 1",
  "",
  "옵션:",
  "  -h, --help                    도움말 표시",
].join("\n");

const CLI_USAGE_REPL = [
  "사용법:",
  "  detoks repl [--adapter codex|gemini] [--model <이름>] [--execution-mode stub|real] [--session <id>] [--verbose]",
  "  detoks repl --help",
  "",
  "예시:",
  "  detoks repl --adapter codex --model gpt-5 --execution-mode stub",
  "",
  "REPL 안내:",
  "  - 프롬프트를 입력하고 Enter를 눌러 실행합니다",
  "  - 프롬프트에 현재 소스가 detoks[<어댑터>[:<모델>]] 형태로 표시됩니다",
  "  - / 입력 시 REPL 명령어 목록 UI를 표시합니다",
  "  - --adapter를 지정하지 않으면 시작 시 어댑터 선택 UI를 표시합니다",
  "  - 프로젝트에 저장된 REPL 세션이 있으면 시작 시 화살표 키 선택기로 재개하거나 새로 시작할 수 있습니다",
  "  - /help 입력 시 REPL 내부 도움말 표시",
  "  - /login 입력 시 화살표 키 어댑터 선택기와 로그인 흐름 시작",
  "  - /session 입력 시 현재 REPL 세션과 런타임 설정 확인",
  "  - /adapter 입력 시 화살표 키 어댑터 선택기 표시",
  "  - /adapter codex|gemini 입력 시 이후 프롬프트의 어댑터를 직접 변경",
  "  - /model 또는 /model <이름> 입력 시 어댑터 모델 확인 또는 변경",
  "  - /verbose 입력 시 화살표 키 상세 출력 선택기 표시",
  "  - /verbose on|off 입력 시 간결/전체 출력을 직접 변경",
  "  - exit, quit, .exit, /exit, /quit 입력 시 REPL 종료",
  "  - 각 프롬프트는 독립적인 작업 단위로 실행됩니다",
  "  - execution-mode로 프롬프트가 시뮬레이션 또는 실제 실행을 사용할지 결정합니다",
  "",
  "옵션:",
  "  --adapter codex|gemini        대상 어댑터 (기본값: codex)",
  MODEL_FLAG_HELP,
  "  --execution-mode stub|real    실행 모드 (기본값: stub)",
  SESSION_FLAG_HELP,
  EXECUTION_MODE_HELP,
  VERBOSE_HELP,
  "  -h, --help                    도움말 표시",
].join("\n");

const isAdapter = (value: string): value is (typeof AdapterValues)[number] =>
  AdapterValues.includes(value as (typeof AdapterValues)[number]);

const isExecutionMode = (value: string): value is (typeof ExecutionModeValues)[number] =>
  ExecutionModeValues.includes(value as (typeof ExecutionModeValues)[number]);

const assertPrompt = (prompt: string | undefined): string => {
  const normalized = prompt?.trim();
  if (!normalized) {
    throw new Error(
      "프롬프트가 없습니다. 사용법은 `detoks --help`를 참고하세요.",
    );
  }
  return normalized;
};

export const parseCliArgs = (argv: string[]): CliArgs => {
  if (argv.length === 0) {
    return {
      mode: "run",
      adapter: DEFAULT_ADAPTER,
      executionMode: DEFAULT_EXECUTION_MODE,
      verbose: false,
      trace: false,
      showHelp: true,
      helpTopic: "main",
    };
  }

  const positionals: string[] = [];
  let adapter: CliArgs["adapter"] | undefined;
  let executionMode: CliArgs["executionMode"] = DEFAULT_EXECUTION_MODE;
  let sessionId: string | undefined;
  let inputFile: string | undefined;
  let model: string | undefined;
  let verbose = false;
  let trace = false;

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current) {
      continue;
    }

    if (current === "--verbose") {
      verbose = true;
      continue;
    }

    if (current === "--trace") {
      trace = true;
      continue;
    }

    if (current === "-h" || current === "--help") {
      const helpTopic =
        positionals[0] === "repl"
          ? "repl"
          : positionals[0] === "session" && positionals[1] === "list"
            ? "session-list"
            : positionals[0] === "session" && positionals[1] === "continue"
              ? "session-continue"
            : positionals[0] === "session" && positionals[1] === "reset"
              ? "session-reset"
            : positionals[0] === "session" && positionals[1] === "fork"
              ? "session-fork"
            : positionals[0] === "checkpoint" && positionals[1] === "list"
            ? "checkpoint-list"
            : positionals[0] === "checkpoint" && positionals[1] === "show"
              ? "checkpoint-show"
            : positionals[0] === "checkpoint" && positionals[1] === "restore"
              ? "checkpoint-restore"
              : "main";
      return {
        mode: "run",
        adapter: adapter ?? DEFAULT_ADAPTER,
        executionMode,
        verbose,
        trace,
        showHelp: true,
        helpTopic,
      };
    }

    if (current === "--adapter") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--adapter 값이 필요합니다: codex|gemini. 사용법은 `detoks --help`를 참고하세요.");
      }
      if (!isAdapter(next)) {
        throw new Error(`지원하지 않는 어댑터: ${next}. codex 또는 gemini를 사용하세요.`);
      }
      adapter = next;
      i += 1;
      continue;
    }

    if (current.startsWith("--adapter=")) {
      const inline = current.split("=")[1] ?? "";
      if (!isAdapter(inline)) {
        throw new Error(`지원하지 않는 어댑터: ${inline}. codex 또는 gemini를 사용하세요.`);
      }
      adapter = inline;
      continue;
    }

    if (current === "--model") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--model 값이 필요합니다. 사용법은 `detoks --help`를 참고하세요.");
      }
      model = next;
      i += 1;
      continue;
    }

    if (current.startsWith("--model=")) {
      const inline = current.split("=")[1] ?? "";
      if (!inline) {
        throw new Error("--model 값이 필요합니다. 사용법은 `detoks --help`를 참고하세요.");
      }
      model = inline;
      continue;
    }

    if (current === "--execution-mode") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error(
          "--execution-mode 값이 필요합니다: stub|real. 사용법은 `detoks --help`를 참고하세요.",
        );
      }
      if (!isExecutionMode(next)) {
        throw new Error(`지원하지 않는 실행 모드: ${next}. stub 또는 real을 사용하세요.`);
      }
      executionMode = next;
      i += 1;
      continue;
    }

    if (current.startsWith("--execution-mode=")) {
      const inline = current.split("=")[1] ?? "";
      if (!isExecutionMode(inline)) {
        throw new Error(`지원하지 않는 실행 모드: ${inline}. stub 또는 real을 사용하세요.`);
      }
      executionMode = inline;
      continue;
    }

    if (current === "--session" || current === "--session-id") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error(
          `${current} 값이 필요합니다. 사용법은 \`detoks --help\`를 참고하세요.`,
        );
      }
      sessionId = next;
      i += 1;
      continue;
    }

    if (current.startsWith("--session=")) {
      sessionId = current.split("=")[1] ?? "";
      if (!sessionId) {
        throw new Error("--session 값이 필요합니다. 사용법은 `detoks --help`를 참고하세요.");
      }
      continue;
    }

    if (current.startsWith("--session-id=")) {
      sessionId = current.split("=")[1] ?? "";
      if (!sessionId) {
        throw new Error("--session-id 값이 필요합니다. 사용법은 `detoks --help`를 참고하세요.");
      }
      continue;
    }

    if (current === "--file") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--file 경로가 필요합니다. 사용법은 `detoks --help`를 참고하세요.");
      }
      inputFile = next;
      i += 1;
      continue;
    }

    if (current.startsWith("--file=")) {
      inputFile = current.split("=")[1] ?? "";
      if (!inputFile) {
        throw new Error("--file 경로가 필요합니다. 사용법은 `detoks --help`를 참고하세요.");
      }
      continue;
    }

    if (current.startsWith("--")) {
      throw new Error(`알 수 없는 플래그: ${current}. 사용법은 \`detoks --help\`를 참고하세요.`);
    }

    positionals.push(current);
  }

  const first = positionals[0];
  if (first === "session") {
    if (inputFile) {
      throw new Error("session 명령어는 --file을 지원하지 않습니다. 사용법은 `detoks session list --help`를 참고하세요.");
    }

    if (positionals[1] === "list") {
      if (positionals.length > 2) {
        throw new Error("session list는 인수를 받지 않습니다. 사용법은 `detoks session list --help`를 참고하세요.");
      }
      return {
        mode: "run",
        command: "session-list",
        adapter: adapter ?? DEFAULT_ADAPTER,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "session-list",
      };
    }

    if (positionals[1] === "continue") {
      const sessionIdFromPos = positionals[2]?.trim();
      if (!sessionIdFromPos || positionals.length > 3) {
        throw new Error("session continue는 <세션-id> 하나가 필요합니다. 사용법은 `detoks session continue --help`를 참고하세요.");
      }
      return {
        mode: "run",
        command: "session-continue",
        sessionId: sessionIdFromPos,
        adapter: adapter ?? DEFAULT_ADAPTER,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "session-continue",
      };
    }

    if (positionals[1] === "reset") {
      const sessionIdToReset = positionals[2]?.trim();
      if (!sessionIdToReset || positionals.length > 3) {
        throw new Error("session reset은 <세션-id> 하나가 필요합니다. 사용법은 `detoks session reset --help`를 참고하세요.");
      }
      return {
        mode: "run",
        command: "session-reset",
        sessionId: sessionIdToReset,
        adapter: adapter ?? DEFAULT_ADAPTER,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "session-reset",
      };
    }

    if (positionals[1] === "fork") {
      const sourceSessionId = positionals[2]?.trim();
      const newSessionId = positionals[3]?.trim();
      if (!sourceSessionId || !newSessionId || positionals.length > 4) {
        throw new Error("session fork는 <원본-세션-id>와 <새-세션-id> 각각 하나가 필요합니다. 사용법은 `detoks session fork --help`를 참고하세요.");
      }
      return {
        mode: "run",
        command: "session-fork",
        sessionId: sourceSessionId,
        newSessionId,
        adapter: adapter ?? DEFAULT_ADAPTER,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "session-fork",
      };
    }

    throw new Error("지원하지 않는 session 명령어입니다. `detoks session list --help`, `detoks session continue --help`, `detoks session fork --help`를 참고하세요.");
  }

  if (first === "checkpoint") {
    if (inputFile) {
      throw new Error("checkpoint 명령어는 --file을 지원하지 않습니다. 사용법은 `detoks checkpoint --help`를 참고하세요.");
    }

    if (positionals[1] === "list") {
      const sessionId = positionals[2]?.trim();
      if (!sessionId || positionals.length > 3) {
        throw new Error("checkpoint list는 <세션-id> 하나가 필요합니다. 사용법은 `detoks checkpoint list --help`를 참고하세요.");
      }
      return {
        mode: "run",
        command: "checkpoint-list",
        sessionId,
        adapter: adapter ?? DEFAULT_ADAPTER,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "checkpoint-list",
      };
    }

    if (positionals[1] === "show") {
      const checkpointId = positionals[2]?.trim();
      if (!checkpointId || positionals.length > 3) {
        throw new Error("checkpoint show는 <체크포인트-id> 하나가 필요합니다. 사용법은 `detoks checkpoint show --help`를 참고하세요.");
      }
      return {
        mode: "run",
        command: "checkpoint-show",
        checkpointId,
        adapter: adapter ?? DEFAULT_ADAPTER,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "checkpoint-show",
      };
    }

    if (positionals[1] === "restore") {
      const checkpointId = positionals[2]?.trim();
      if (!checkpointId || positionals.length > 3) {
        throw new Error("checkpoint restore는 <체크포인트-id> 하나가 필요합니다. 사용법은 `detoks checkpoint restore --help`를 참고하세요.");
      }
      return {
        mode: "run",
        command: "checkpoint-restore",
        checkpointId,
        adapter: adapter ?? DEFAULT_ADAPTER,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "checkpoint-restore",
      };
    }

    throw new Error("지원하지 않는 checkpoint 명령어입니다. `detoks checkpoint list --help`, `detoks checkpoint show --help`, `detoks checkpoint restore --help`를 참고하세요.");
  }

  if (first === "repl") {
    if (inputFile) {
      throw new Error("repl 모드는 --file을 지원하지 않습니다. 사용법은 `detoks repl --help`를 참고하세요.");
    }
    if (positionals.length > 1) {
      throw new Error(
        "repl 모드는 프롬프트 인수를 받지 않습니다. 사용법은 `detoks repl --help`를 참고하세요.",
      );
    }
    return {
      mode: "repl",
      ...(adapter !== undefined ? { adapter } : {}),
      ...(model !== undefined ? { model } : {}),
      executionMode,
      verbose,
      trace,
      showHelp: false,
      helpTopic: "repl",
    };
  }

  if (inputFile) {
    if (positionals.length > 0) {
      throw new Error("프롬프트와 --file을 동시에 사용할 수 없습니다. 사용법은 `detoks --help`를 참고하세요.");
    }
    return {
      mode: "run",
      inputFile,
      adapter: adapter ?? DEFAULT_ADAPTER,
      ...(model !== undefined ? { model } : {}),
      executionMode,
      verbose,
      trace,
      showHelp: false,
      helpTopic: "main",
    };
  }

  const prompt = assertPrompt(positionals.join(" "));
  return {
    mode: "run",
    prompt,
    ...(sessionId !== undefined ? { sessionId } : {}),
    adapter: adapter ?? DEFAULT_ADAPTER,
    ...(model !== undefined ? { model } : {}),
    executionMode,
    verbose,
    trace,
    showHelp: false,
    helpTopic: "main",
  };
};

export const getCliUsage = (
  topic:
    | "main"
    | "repl"
    | "session-list"
    | "session-continue"
    | "session-reset"
    | "session-fork"
    | "checkpoint-list"
    | "checkpoint-show"
    | "checkpoint-restore" = "main",
): string => {
  if (topic === "repl") {
    return CLI_USAGE_REPL;
  }
  if (topic === "session-list") {
    return CLI_USAGE_SESSION_LIST;
  }
  if (topic === "session-continue") {
    return CLI_USAGE_SESSION_CONTINUE;
  }
  if (topic === "session-reset") {
    return CLI_USAGE_SESSION_RESET;
  }
  if (topic === "session-fork") {
    return CLI_USAGE_SESSION_FORK;
  }
  if (topic === "checkpoint-list") {
    return CLI_USAGE_CHECKPOINT_LIST;
  }
  if (topic === "checkpoint-show") {
    return CLI_USAGE_CHECKPOINT_SHOW;
  }
  if (topic === "checkpoint-restore") {
    return CLI_USAGE_CHECKPOINT_RESTORE;
  }
  return CLI_USAGE_MAIN;
};

export const toNormalizedRequest = (
  args: CliArgs,
  options?: { cwd?: string; sessionId?: string; mode?: CliMode; prompt?: string },
): NormalizedCliRequest => {
  const mode = options?.mode ?? args.mode;
  const promptSource = options?.prompt ?? args.prompt;
  const prompt = mode === "repl" ? promptSource ?? "" : assertPrompt(promptSource);
  const sessionId = options?.sessionId ?? args.sessionId;

  return {
    mode,
    adapter: args.adapter ?? DEFAULT_ADAPTER,
    ...(args.model !== undefined ? { model: args.model } : {}),
    executionMode: args.executionMode,
    verbose: args.verbose,
    trace: args.trace,
    userRequest: UserRequestSchema.parse({
      raw_input: prompt,
      cwd: options?.cwd ?? process.cwd(),
      session_id: sessionId,
      timestamp: new Date().toISOString(),
    }),
  };
};
