import { UserRequestSchema } from "../schemas/pipeline.js";
import {
  AdapterValues,
  ExecutionModeValues,
  type CliArgs,
  type CliMode,
  type NormalizedCliRequest,
} from "./types.js";

const DEFAULT_ADAPTER = "codex";
const DEFAULT_EXECUTION_MODE = "real";
const MAIN_HELP_HINT = "사용법은 `detoks --help`를 확인하세요.";
const topicHelpHint = (topic: string): string => `사용법은 \`${topic}\`를 확인하세요.`;
const EXECUTION_MODE_HELP = [
  "실행 모드:",
  "    stub = 빠르고 안전한 CLI 테스트를 위한 모의 출력",
  "    real = 어댑터의 실제 실행 경로를 사용합니다",
].join("\n");
const VERBOSE_HELP =
  "  --verbose                     성공 JSON과 에러 스택을 전체 출력합니다(출력 전용)";
const TRACE_HELP =
  "  --trace                       파이프라인 단계의 입출력을 기록하고 local_config/trace/{sessionId}-trace.json에 저장합니다";
const SESSION_FLAG_HELP =
  "  --session <id>                저장된 세션 id를 이어서 사용합니다";
const HUMAN_FLAG_HELP =
  "  --human                       각 세션의 마지막 작업 요약을 읽기 쉬운 형식으로 표시합니다";
const SESSION_SHOW_VERBOSE_HELP =
  "  --verbose                     JSON 응답에 각 작업의 raw_output 전체를 포함합니다";
const CLI_USAGE_MAIN = [
  "사용법:",
  "  detoks                         인자 없이 실행하면 대화형 REPL로 진입합니다",
  "  detoks repl [--adapter codex|gemini] [--execution-mode stub|real] [--session <id>] [--verbose]",
  "  detoks --file <path> [--verbose]",
  "  detoks session list [--human]",
  "  detoks session show <session-id> [--human]",
  "  detoks session continue <session-id>",
  "  detoks session reset <session-id>",
  "  detoks session fork <source-session-id> <new-session-id>",
  "  detoks checkpoint list <session-id>",
  "  detoks checkpoint show <checkpoint-id>",
  "  detoks checkpoint restore <checkpoint-id>",
  "  detoks repl --help",
  "  detoks --help",
  "",
  "로컬 LLM 환경 변수(현재 cwd의 .env / .env.local에서 읽음):",
  "  LOCAL_LLM_API_BASE, LOCAL_LLM_API_KEY, LOCAL_LLM_MODEL_NAME",
  "",
  "예시:",
  "  detoks",
  "  detoks repl --adapter codex --execution-mode stub",
  "  detoks --file tests/data/row_data.json --verbose",
  "  detoks session list --human",
  "  detoks session show session_2026_04_27 --human",
  "  detoks session continue session_2026_04_27",
  "  detoks session reset session_2026_04_27",
  "  detoks session fork session_2026_04_27 session_2026_04_27_fork",
  "  detoks checkpoint list session_2026_04_27",
  "  detoks checkpoint show session_2026_04_27_checkpoint_001",
  "  detoks checkpoint restore session_2026_04_27_checkpoint_001",
  "",
  "옵션:",
  "  --adapter codex|gemini        대상 어댑터(기본값: codex)",
  "  --execution-mode stub|real    실행 모드(기본값: real)",
  "  --file <path>                 JSON 파일로 일괄 프롬프트 컴파일을 실행합니다",
  SESSION_FLAG_HELP,
  EXECUTION_MODE_HELP,
  VERBOSE_HELP,
  TRACE_HELP,
  "  -h, --help                    이 도움말을 표시합니다",
].join("\n");

const CLI_USAGE_SESSION_LIST = [
  "사용법:",
  "  detoks session list [--human]",
  "",
  "예시:",
  "  detoks session list --human",
  "",
  "세션 참고:",
  "  - 저장된 세션을 전체적으로 보여줍니다",
  "  - 읽기 전용이며 세션 상태를 생성/이어가기/초기화/포크/수정하지 않습니다",
  "  - stdout은 mutatesState=false, hasSessions, sessionCount, message, sessions를 포함한 JSON입니다",
  "  - 각 세션에는 id, updatedAt, currentTaskId, completedTaskCount, taskResultCount, nextAction이 포함됩니다",
  "  - --human을 추가하면 각 세션의 마지막 작업 요약을 읽기 쉬운 목록으로 출력합니다",
  "",
  "옵션:",
  HUMAN_FLAG_HELP,
  "  -h, --help                    이 도움말을 표시합니다",
].join("\n");

const CLI_USAGE_SESSION_CONTINUE = [
  "사용법:",
  "  detoks session continue <session-id>",
  "",
  "예시:",
  "  detoks session continue session_2026_04_27",
  "",
  "세션 이어하기 참고:",
  "  - 저장된 raw_input을 다시 재생해 세션 실행을 이어갑니다",
  "  - 세션에서 이미 완료된 task id는 건너뛰고, 대기/실패 작업만 다시 시도합니다",
  "  - 세션이 없거나 저장된 raw_input이 없으면 왜 다시 시작하지 않았는지 stdout에 설명합니다",
  "  - 세션 재진입 시 이전 세션 요약이 stderr로 자동 출력됩니다",
  "  - 이전 세션의 요약은 resumeOverview로 자동 출력됩니다",
  "  - stdout은 sessionId, canContinue, resumeStarted, mutatesState, message, resumeOverview, summary, nextAction, taskRecords를 포함한 JSON입니다",
  "",
  "옵션:",
  "  -h, --help                    이 도움말을 표시합니다",
].join("\n");

const CLI_USAGE_SESSION_SHOW = [
  "사용법:",
  "  detoks session show <session-id> [--human]",
  "",
  "예시:",
  "  detoks session show session_2026_04_27",
  "  detoks session show session_2026_04_27 --human",
  "",
  "세션 상세 조회 참고:",
  "  - 저장된 세션의 요약과 작업 결과를 읽기 전용으로 보여줍니다",
  "  - 세션이 없으면 stdout에 안내 메시지를 반환합니다",
  "  - --human을 추가하면 세션 요약과 작업별 출력 미리보기를 보기 쉬운 형식으로 출력합니다",
  "  - --verbose를 사용하면 JSON 응답에 각 작업의 raw_output 전체를 포함합니다",
  "",
  "옵션:",
  HUMAN_FLAG_HELP,
  SESSION_SHOW_VERBOSE_HELP,
  "  -h, --help                    이 도움말을 표시합니다",
].join("\n");

const CLI_USAGE_SESSION_RESET = [
  "사용법:",
  "  detoks session reset <session-id>",
  "",
  "예시:",
  "  detoks session reset session_2026_04_27",
  "",
  "세션 초기화 참고:",
  "  - 세션 상태와 모든 task 결과를 삭제합니다",
  "  - 위험합니다. 되돌릴 수 없습니다",
  "  - stdout은 성공 시 sessionId, reset=true, mutatesState=true, message를 포함한 JSON입니다",
  "  - 세션이 없으면 ok=false, mutatesState=false, exit code 1을 반환합니다",
  "",
  "옵션:",
  "  -h, --help                    이 도움말을 표시합니다",
].join("\n");


const CLI_USAGE_SESSION_FORK = [
  "사용법:",
  "  detoks session fork <source-session-id> <new-session-id>",
  "",
  "예시:",
  "  detoks session fork session_2026_04_27 session_2026_04_27_fork",
  "",
  "세션 포크 참고:",
  "  - 기존 저장된 세션을 새 session id로 복사합니다",
  "  - 원본 세션 존재 여부를 확인하고, 이미 존재하는 대상 session id는 덮어쓰지 않습니다",
  "  - 다시 시작 실행을 하지 않으며 task 결과도 수정하지 않습니다",
  "  - stdout은 sourceSessionId, newSessionId, forked, mutatesState, message, nextAction을 포함한 JSON입니다",
  "  - 원본 세션이 없거나 대상 session id가 중복되면 ok=false, mutatesState=false, exit code 1을 반환합니다",
  "",
  "옵션:",
  "  -h, --help                    이 도움말을 표시합니다",
].join("\n");

const CLI_USAGE_CHECKPOINT_LIST = [
  "사용법:",
  "  detoks checkpoint list <session-id>",
  "",
  "예시:",
  "  detoks checkpoint list session_2026_04_27",
  "",
  "체크포인트 참고:",
  "  - 기존 세션의 저장된 체크포인트를 보여줍니다",
  "  - 읽기 전용이며 세션 상태를 복원하거나 수정하지 않습니다",
  "  - stdout은 sessionId, mutatesState=false, hasCheckpoints, checkpointCount, message, checkpoints를 포함한 JSON입니다",
  "  - 체크포인트가 없으면 hasCheckpoints=false, checkpointCount=0, checkpoints=[]를 반환합니다",
  "",
  "옵션:",
  "  -h, --help                    이 도움말을 표시합니다",
].join("\n");


const CLI_USAGE_CHECKPOINT_SHOW = [
  "사용법:",
  "  detoks checkpoint show <checkpoint-id>",
  "",
  "예시:",
  "  detoks checkpoint show session_2026_04_27_checkpoint_001",
  "",
  "체크포인트 참고:",
  "  - checkpoint id로 저장된 체크포인트 메타데이터를 보여줍니다",
  "  - 읽기 전용이며 세션 상태를 복원하거나 수정하지 않습니다",
  "  - stdout은 mutatesState=false, message, changedFiles, nextAction을 포함한 체크포인트 메타데이터 JSON입니다",
  "",
  "옵션:",
  "  -h, --help                    이 도움말을 표시합니다",
].join("\n");

const CLI_USAGE_CHECKPOINT_RESTORE = [
  "사용법:",
  "  detoks checkpoint restore <checkpoint-id>",
  "",
  "예시:",
  "  detoks checkpoint restore session_2026_04_27_checkpoint_001",
  "",
  "체크포인트 복원 참고:",
  "  - 세션을 이 체크포인트 시점의 상태로 복원합니다",
  "  - 이 체크포인트 이후의 task 결과는 잘려 나갑니다",
  "  - stdout은 성공 시 sessionId, checkpointId, restored=true, mutatesState=true, message를 포함한 JSON입니다",
  "  - 잘못된 복원 대상은 ok=false, mutatesState=false, exit code 1을 반환합니다",
  "",
  "옵션:",
  "  -h, --help                    이 도움말을 표시합니다",
].join("\n");

const CLI_USAGE_REPL = [
  "사용법:",
  "  detoks repl [--adapter codex|gemini] [--execution-mode stub|real] [--session <id>] [--verbose]",
  "  detoks repl --help",
  "",
  "예시:",
  "  detoks repl --adapter codex --execution-mode stub",
  "",
  "REPL 참고:",
  "  - 프롬프트를 입력하고 Enter를 누르면 실행됩니다",
  "  - exit, quit, .exit 중 하나를 입력하면 REPL을 종료합니다",
  "  - 각 프롬프트는 별도의 작업 단위로 실행됩니다",
  "  - execution-mode는 프롬프트를 모의 실행으로 할지 실제 실행으로 할지 결정합니다",
  "",
  "옵션:",
  "  --adapter codex|gemini        대상 어댑터(기본값: codex)",
  "  --execution-mode stub|real    실행 모드(기본값: real)",
  SESSION_FLAG_HELP,
  EXECUTION_MODE_HELP,
  VERBOSE_HELP,
  "  -h, --help                    이 도움말을 표시합니다",
].join("\n");

const isAdapter = (value: string): value is (typeof AdapterValues)[number] =>
  AdapterValues.includes(value as (typeof AdapterValues)[number]);

const isExecutionMode = (value: string): value is (typeof ExecutionModeValues)[number] =>
  ExecutionModeValues.includes(value as (typeof ExecutionModeValues)[number]);

const assertPrompt = (prompt: string | undefined): string => {
  const normalized = prompt?.trim();
  if (!normalized) {
    throw new Error(`프롬프트가 없습니다. ${MAIN_HELP_HINT}`);
  }
  return normalized;
};

export const parseCliArgs = (argv: string[]): CliArgs => {
  const positionals: string[] = [];
  let adapter: CliArgs["adapter"] = DEFAULT_ADAPTER;
  let executionMode: CliArgs["executionMode"] = DEFAULT_EXECUTION_MODE;
  let sessionId: string | undefined;
  let inputFile: string | undefined;
  let human = false;
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

    if (current === "--human") {
      human = true;
      continue;
    }

    if (current === "-h" || current === "--help") {
      const helpTopic =
        positionals[0] === "repl"
          ? "repl"
          : positionals[0] === "session" && positionals[1] === "list"
            ? "session-list"
            : positionals[0] === "session" && positionals[1] === "show"
              ? "session-show"
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
        adapter,
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
        throw new Error(`--adapter에는 codex|gemini 값이 필요합니다. ${MAIN_HELP_HINT}`);
      }
      if (!isAdapter(next)) {
        throw new Error(`지원하지 않는 adapter: ${next}. codex 또는 gemini를 사용하세요.`);
      }
      adapter = next;
      i += 1;
      continue;
    }

    if (current.startsWith("--adapter=")) {
      const inline = current.split("=")[1] ?? "";
      if (!isAdapter(inline)) {
        throw new Error(`지원하지 않는 adapter: ${inline}. codex 또는 gemini를 사용하세요.`);
      }
      adapter = inline;
      continue;
    }

    if (current === "--execution-mode") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error(`--execution-mode에는 stub|real 값이 필요합니다. ${MAIN_HELP_HINT}`);
      }
      if (!isExecutionMode(next)) {
        throw new Error(`지원하지 않는 execution mode: ${next}. stub 또는 real을 사용하세요.`);
      }
      executionMode = next;
      i += 1;
      continue;
    }

    if (current.startsWith("--execution-mode=")) {
      const inline = current.split("=")[1] ?? "";
      if (!isExecutionMode(inline)) {
        throw new Error(`지원하지 않는 execution mode: ${inline}. stub 또는 real을 사용하세요.`);
      }
      executionMode = inline;
      continue;
    }

    if (current === "--session" || current === "--session-id") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error(`${current}에는 값이 필요합니다. ${MAIN_HELP_HINT}`);
      }
      sessionId = next;
      i += 1;
      continue;
    }

    if (current.startsWith("--session=")) {
      sessionId = current.split("=")[1] ?? "";
      if (!sessionId) {
        throw new Error(`--session에는 값이 필요합니다. ${MAIN_HELP_HINT}`);
      }
      continue;
    }

    if (current.startsWith("--session-id=")) {
      sessionId = current.split("=")[1] ?? "";
      if (!sessionId) {
        throw new Error(`--session-id에는 값이 필요합니다. ${MAIN_HELP_HINT}`);
      }
      continue;
    }

    if (current === "--file") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error(`--file에는 경로가 필요합니다. ${MAIN_HELP_HINT}`);
      }
      inputFile = next;
      i += 1;
      continue;
    }

    if (current.startsWith("--file=")) {
      inputFile = current.split("=")[1] ?? "";
      if (!inputFile) {
        throw new Error(`--file에는 경로가 필요합니다. ${MAIN_HELP_HINT}`);
      }
      continue;
    }

    if (current.startsWith("--")) {
      throw new Error(`알 수 없는 플래그: ${current}. ${MAIN_HELP_HINT}`);
    }

    positionals.push(current);
  }

  const first = positionals[0];
  if (first === "session") {
    if (inputFile) {
      throw new Error(`세션 명령은 --file을 지원하지 않습니다. ${topicHelpHint("detoks session list --help")}`);
    }

    if (positionals[1] === "list") {
      if (positionals.length > 2) {
        throw new Error(`세션 목록은 인수를 받지 않습니다. ${topicHelpHint("detoks session list --help")}`);
      }
      return {
        mode: "run",
        command: "session-list",
        ...(human ? { human: true } : {}),
        adapter,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "session-list",
      };
    }

    if (positionals[1] === "show") {
      const sessionIdToShow = positionals[2]?.trim();
      if (!sessionIdToShow || positionals.length > 3) {
        throw new Error(`세션 show에는 <session-id> 하나만 필요합니다. ${topicHelpHint("detoks session show --help")}`);
      }
      return {
        mode: "run",
        command: "session-show",
        sessionId: sessionIdToShow,
        ...(human ? { human: true } : {}),
        adapter,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "session-show",
      };
    }

    if (positionals[1] === "continue") {
      const sessionIdFromPos = positionals[2]?.trim();
      if (!sessionIdFromPos || positionals.length > 3) {
        throw new Error(`세션 continue에는 <session-id> 하나만 필요합니다. ${topicHelpHint("detoks session continue --help")}`);
      }
      return {
        mode: "run",
        command: "session-continue",
        sessionId: sessionIdFromPos,
        adapter,
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
        throw new Error(`세션 reset에는 <session-id> 하나만 필요합니다. ${topicHelpHint("detoks session reset --help")}`);
      }
      return {
        mode: "run",
        command: "session-reset",
        sessionId: sessionIdToReset,
        adapter,
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
        throw new Error(`세션 fork에는 <source-session-id> 하나와 <new-session-id> 하나가 필요합니다. ${topicHelpHint("detoks session fork --help")}`);
      }
      return {
        mode: "run",
        command: "session-fork",
        sessionId: sourceSessionId,
        newSessionId,
        adapter,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "session-fork",
      };
    }

    throw new Error(`지원하지 않는 세션 명령입니다. ${topicHelpHint("detoks session list --help")}, ${topicHelpHint("detoks session show --help")}, ${topicHelpHint("detoks session continue --help")}, ${topicHelpHint("detoks session fork --help")}를 확인하세요.`);
  }

  if (first === "checkpoint") {
    if (inputFile) {
      throw new Error(`체크포인트 명령은 --file을 지원하지 않습니다. ${topicHelpHint("detoks checkpoint list --help")}`);
    }

    if (positionals[1] === "list") {
      const sessionId = positionals[2]?.trim();
      if (!sessionId || positionals.length > 3) {
        throw new Error(`체크포인트 list에는 <session-id> 하나만 필요합니다. ${topicHelpHint("detoks checkpoint list --help")}`);
      }
      return {
        mode: "run",
        command: "checkpoint-list",
        sessionId,
        adapter,
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
        throw new Error(`체크포인트 show에는 <checkpoint-id> 하나만 필요합니다. ${topicHelpHint("detoks checkpoint show --help")}`);
      }
      return {
        mode: "run",
        command: "checkpoint-show",
        checkpointId,
        adapter,
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
        throw new Error(`체크포인트 restore에는 <checkpoint-id> 하나만 필요합니다. ${topicHelpHint("detoks checkpoint restore --help")}`);
      }
      return {
        mode: "run",
        command: "checkpoint-restore",
        checkpointId,
        adapter,
        executionMode,
        verbose,
        trace,
        showHelp: false,
        helpTopic: "checkpoint-restore",
      };
    }

    throw new Error(`지원하지 않는 체크포인트 명령입니다. ${topicHelpHint("detoks checkpoint list --help")}, ${topicHelpHint("detoks checkpoint show --help")}, ${topicHelpHint("detoks checkpoint restore --help")}를 확인하세요.`);
  }

  if (first === "repl") {
    if (inputFile) {
      throw new Error(`REPL 모드는 --file을 지원하지 않습니다. ${topicHelpHint("detoks repl --help")}`);
    }
    if (positionals.length > 1) {
      throw new Error(
        `REPL 모드는 프롬프트 인수를 받지 않습니다. ${topicHelpHint("detoks repl --help")}`,
      );
    }
    return { mode: "repl", adapter, executionMode, verbose, trace, showHelp: false, helpTopic: "repl" };
  }

  if (inputFile) {
    if (positionals.length > 0) {
      throw new Error(`프롬프트 입력과 --file은 함께 사용할 수 없습니다. ${MAIN_HELP_HINT}`);
    }
    return {
      mode: "run",
      inputFile,
      adapter,
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
    ...(sessionId ? { sessionId } : {}),
    adapter,
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
    | "session-show"
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
  if (topic === "session-show") {
    return CLI_USAGE_SESSION_SHOW;
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
    adapter: args.adapter,
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
