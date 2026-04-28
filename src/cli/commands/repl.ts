import { randomInt } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { formatError, formatSuccess } from "../format.js";
import { toNormalizedRequest } from "../parse.js";
import type { CliArgs } from "../types.js";
import { ProjectDetector } from "../ProjectDetector.js";
import { SessionStateManager } from "../../core/state/SessionStateManager.js";
import { ReplRegistry, type ReplSession } from "../repl/ReplRegistry.js";
import { runCommand } from "./run.js";

const EXIT_COMMANDS = new Set(["exit", "quit", ".exit"]);
const SESSION_ID_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

async function allocateReplSessionId(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const sessionId = `repl-${Array.from({ length: 16 }, () => SESSION_ID_CHARSET[randomInt(SESSION_ID_CHARSET.length)]!).join("")}`;
    if (!(await SessionStateManager.sessionExists(sessionId))) {
      return sessionId;
    }
  }
  throw new Error("Unable to allocate a unique REPL session id after 10 attempts");
}

interface ResolveReplSessionIdOptions {
  explicitSessionId: string | undefined;
  lastSession: ReplSession | null;
  canPromptForResume: boolean;
  hasStoredSession: (sessionId: string) => Promise<boolean>;
  allocateSessionId: () => Promise<string>;
  promptToResume?: (lastSession: ReplSession) => Promise<boolean>;
  updateLastResumed: () => Promise<void>;
}

export const resolveReplSessionId = async ({
  explicitSessionId,
  lastSession,
  canPromptForResume,
  hasStoredSession,
  allocateSessionId,
  promptToResume,
  updateLastResumed,
}: ResolveReplSessionIdOptions): Promise<string> => {
  if (explicitSessionId) {
    return explicitSessionId;
  }

  if (!lastSession || !(await hasStoredSession(lastSession.session_id))) {
    return allocateSessionId();
  }

  const shouldResume = canPromptForResume
    ? await (promptToResume?.(lastSession) ?? Promise.resolve(false))
    : true;

  if (shouldResume) {
    await updateLastResumed();
    return lastSession.session_id;
  }

  return allocateSessionId();
};

export const runReplCommand = async (baseArgs: CliArgs): Promise<void> => {
  const cwd = process.cwd();
  const project = await ProjectDetector.detect(cwd);
  const lastSession = await ReplRegistry.loadLastSession(project.projectId, cwd);
  const rl = createInterface({ input, output });
  const sessionId = await resolveReplSessionId({
    explicitSessionId: baseArgs.sessionId,
    lastSession,
    canPromptForResume: Boolean(input.isTTY && output.isTTY),
    hasStoredSession: (existingSessionId) => SessionStateManager.sessionExists(existingSessionId),
    allocateSessionId: allocateReplSessionId,
    promptToResume: async (existingSession) => {
      const response = (
        await rl.question(
          `Found existing session: ${existingSession.session_id} (last used ${existingSession.last_resumed_at})\nContinue previous session? (y/N): `,
        )
      )
        .trim()
        .toLowerCase();

      if (response === "y" || response === "yes") {
        output.write(`Resuming session: ${existingSession.session_id}\n`);
        return true;
      }

      output.write("Starting a new session.\n");
      return false;
    },
    updateLastResumed: () => ReplRegistry.updateLastResumed(cwd),
  });

  output.write(
    `detoks repl started (adapter=${baseArgs.adapter}, executionMode=${baseArgs.executionMode}, verbose=${String(baseArgs.verbose)}, session=${sessionId}). stub = simulated output; real = adapter's real execution path. type "exit" to quit.\n`,
  );

  const isTTY = Boolean(input.isTTY && output.isTTY);

  try {
    while (true) {
      let line: string;
      try {
        if (!isTTY) {
          output.write("detoks> ");
        }
        line = (await rl.question(isTTY ? "detoks> " : "")).trim();
      } catch (error) {
        if (error instanceof Error && error.message === "readline was closed") {
          break;
        }
        throw error;
      }
      if (!line) {
        continue;
      }
      if (EXIT_COMMANDS.has(line)) {
        break;
      }

      try {
        const request = toNormalizedRequest(
          { ...baseArgs, mode: "run", prompt: line },
          { mode: "repl", sessionId },
        );
        const result = await runCommand(request);
        output.write(`${formatSuccess(result, baseArgs.verbose)}\n`);

        // 입력 번역 로깅 (P3)
        if (result.compiledPrompt && result.compiledPrompt !== line) {
          await SessionStateManager.logInputTranslation(
            sessionId,
            line,
            result.compiledPrompt,
          );
        }
      } catch (error) {
        output.write(`${formatError(error, baseArgs.verbose)}\n`);
      }
    }
  } finally {
    await ReplRegistry.saveSession(
      project.projectId,
      sessionId,
      baseArgs.adapter,
      baseArgs.executionMode,
      cwd,
    );
    rl.close();
    // 현재 세션 로그 정리 (P3)
    await SessionStateManager.clearCurrentSessionLog();
    output.write("detoks repl closed.\n");
  }
};
