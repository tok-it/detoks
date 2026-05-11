import type {
  SubprocessRequest,
  SubprocessResult,
  SubprocessRunner,
  PtyResult,
  PtyEvent,
  PtyTranscript,
} from "./types.js";
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import * as pty from "node-pty";

const formatCommand = (request: SubprocessRequest): string => {
  const args = request.args.length > 0 ? ` ${request.args.join(" ")}` : "";
  return `${request.command}${args}`;
};

export const createStubSubprocessRunner = (): SubprocessRunner => ({
  async run(request: SubprocessRequest): Promise<SubprocessResult> {
    return {
      stdout: `[stub:subprocess] ${formatCommand(request)}`,
      stderr: "",
      exitCode: 0,
      timedOut: false,
    };
  },
});

const splitPathEntries = (pathValue: string): string[] => {
  if (process.platform !== "win32") {
    return pathValue.split(":").filter(Boolean);
  }

  const entries: string[] = [];
  let start = 0;
  for (let i = 0; i < pathValue.length; i += 1) {
    const char = pathValue[i];
    const next = pathValue[i + 1];
    const afterNext = pathValue[i + 2];
    const afterDrive = pathValue[i + 3];
    const isSemicolon = char === ";";
    const isColonSeparator =
      char === ":" &&
      next !== undefined &&
      afterNext === ":" &&
      (afterDrive === "\\" || afterDrive === "/");

    if (isSemicolon || isColonSeparator) {
      const entry = pathValue.slice(start, i);
      if (entry) entries.push(entry);
      start = i + 1;
    }
  }

  const finalEntry = pathValue.slice(start);
  if (finalEntry) entries.push(finalEntry);
  return entries;
};

const resolveCommandFromPath = (command: string, env: NodeJS.ProcessEnv): string | undefined => {
  if (command.includes("/") || command.includes("\\")) {
    return existsSync(command) ? command : undefined;
  }

  const pathValue = env.PATH ?? env.Path ?? "";
  const extensions = process.platform === "win32"
    ? ["", ...(env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")]
    : [""];

  for (const pathEntry of splitPathEntries(pathValue)) {
    for (const extension of extensions) {
      const candidate = join(pathEntry, `${command}${extension.toLowerCase()}`);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return candidate;
      }
      const upperCandidate = join(pathEntry, `${command}${extension.toUpperCase()}`);
      if (existsSync(upperCandidate) && statSync(upperCandidate).isFile()) {
        return upperCandidate;
      }
    }
  }

  return undefined;
};

const isNodeShebangScript = (filePath: string): boolean => {
  const executableExtensions = new Set([".exe", ".cmd", ".bat", ".com"]);
  if (executableExtensions.has(extname(filePath).toLowerCase())) {
    return false;
  }

  let fd: number | undefined;
  try {
    fd = openSync(filePath, "r");
    const buffer = Buffer.alloc(64);
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8").startsWith("#!/usr/bin/env node");
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      closeSync(fd);
    }
  }
};

export const createRealSubprocessRunner = (): SubprocessRunner => ({
  async run(request: SubprocessRequest): Promise<SubprocessResult> {
    return await new Promise<SubprocessResult>((resolve) => {
      const env = request.env ? { ...process.env, ...request.env } : process.env;
      const resolvedCommand = resolveCommandFromPath(request.command, env);
      const runViaNode = resolvedCommand !== undefined && isNodeShebangScript(resolvedCommand);
      const command = runViaNode
        ? process.execPath
        : resolvedCommand ?? request.command;
      const args = runViaNode
        ? [resolvedCommand, ...request.args]
        : request.args;
      const child = spawn(command, args, {
        cwd: request.cwd,
        env,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let settled = false;
      let stdout = "";
      let stderr = "";

      const finish = (result: SubprocessResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };

      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");

      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
      });

      child.stderr?.on("data", (chunk: string) => {
        stderr += chunk;
      });

      child.on("error", (error) => {
        finish({
          stdout,
          stderr: stderr.length > 0 ? `${stderr}\n${String(error)}` : String(error),
          exitCode: 127,
          timedOut: false,
        });
      });

      child.on("close", (exitCode, signal) => {
        finish({
          stdout,
          stderr,
          exitCode: typeof exitCode === "number" ? exitCode : signal ? 128 : 1,
          timedOut: false,
        });
      });

      if (request.input !== undefined) {
        child.stdin.write(request.input);
      }

      child.stdin.end();
    });
  },
});

interface PtyRunnerOptions {
  onEvent?: (event: PtyEvent) => void;
}

const isCodexJsonStreamRequest = (request: SubprocessRequest): boolean =>
  request.command === "codex" && request.args.includes("--json");

const runStreamingJsonProcess = (
  request: SubprocessRequest,
  options?: PtyRunnerOptions,
): Promise<PtyResult> => {
  return new Promise<PtyResult>((resolve) => {
    const env = request.env ? { ...process.env, ...request.env } : process.env;
    const resolvedCommand = resolveCommandFromPath(request.command, env);
    const runViaNode = resolvedCommand !== undefined && isNodeShebangScript(resolvedCommand);
    const command = runViaNode
      ? process.execPath
      : resolvedCommand ?? request.command;
    const args = runViaNode
      ? [resolvedCommand, ...request.args]
      : request.args;
    const startTime = Date.now();
    const events: PtyEvent[] = [];

    const emitEvent = (event: Omit<PtyEvent, "timestamp">): void => {
      const fullEvent: PtyEvent = { ...event, timestamp: Date.now() };
      events.push(fullEvent);
      options?.onEvent?.(fullEvent);
    };

    const child = spawn(command, args, {
      cwd: request.cwd,
      env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let settled = false;
    let stdout = "";
    let stderr = "";
    let stdoutPending = "";
    let stderrPending = "";

    const finish = (code: number, timedOut: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;

      const endTime = Date.now();
      const transcript: PtyTranscript = {
        events,
        startTime,
        endTime,
        totalDuration: endTime - startTime,
        exitCode: code,
        timedOut,
      };

      emitEvent({
        type: "exit",
        data: String(code),
      });

      resolve({
        stdout,
        stderr,
        exitCode: code,
        timedOut,
        transcript,
      });
    };

    const pushLines = (
      chunk: string,
      stream: "stdout" | "stderr",
      pending: string,
    ): string => {
      const combined = `${pending}${chunk}`.replace(/\r\n/g, "\n");
      const lines = combined.split("\n");
      const nextPending = combined.endsWith("\n") ? "" : (lines.pop() ?? "");

      for (const line of lines) {
        if (line.length > 0) {
          emitEvent({
            type: "chunk",
            stream,
            data: `${line}\n`,
          });
        }
      }

      return nextPending;
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      stdoutPending = pushLines(chunk, "stdout", stdoutPending);
    });

    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
      stderrPending = pushLines(chunk, "stderr", stderrPending);
    });

    child.on("error", (error) => {
      emitEvent({
        type: "error",
        data: String(error),
      });
      finish(127, false);
    });

    child.on("close", (code, signal) => {
      if (stdoutPending.length > 0) {
        emitEvent({
          type: "chunk",
          stream: "stdout",
          data: stdoutPending,
        });
      }
      if (stderrPending.length > 0) {
        emitEvent({
          type: "chunk",
          stream: "stderr",
          data: stderrPending,
        });
      }

      finish(typeof code === "number" ? code : signal ? 128 : 1, false);
    });

    if (request.input !== undefined) {
      emitEvent({
        type: "prompt",
        data: request.input,
      });
      child.stdin.write(request.input);
    }

    child.stdin.end();
  });
};

const runWithNodePty = (
  request: SubprocessRequest,
  options?: PtyRunnerOptions,
): Promise<PtyResult> => {
  const env = request.env ? { ...process.env, ...request.env } : process.env;
  const resolvedCommand = resolveCommandFromPath(request.command, env);
  const runViaNode = resolvedCommand !== undefined && isNodeShebangScript(resolvedCommand);
  const command = runViaNode ? process.execPath : resolvedCommand ?? request.command;
  const args = runViaNode ? [resolvedCommand, ...request.args] : request.args;

  const startTime = Date.now();
  const events: PtyEvent[] = [];

  const emitEvent = (event: Omit<PtyEvent, "timestamp">): void => {
    const fullEvent: PtyEvent = { ...event, timestamp: Date.now() };
    events.push(fullEvent);
    options?.onEvent?.(fullEvent);
  };

  let ptyProcess: pty.IPty;
  try {
    ptyProcess = pty.spawn(command, args, {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: request.cwd ?? process.cwd(),
      env: env as Record<string, string | undefined>,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const endTime = Date.now();
    return Promise.resolve({
      stdout: "",
      stderr: errMsg,
      exitCode: 127,
      timedOut: false,
      transcript: {
        events: [{ type: "error", timestamp: endTime, data: errMsg }],
        startTime,
        endTime,
        totalDuration: endTime - startTime,
        exitCode: 127,
        timedOut: false,
      },
    });
  }

  return new Promise<PtyResult>((resolve) => {
    let stdout = "";
    let settled = false;

    const finish = (code: number, timedOut: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;

      const endTime = Date.now();
      emitEvent({ type: "exit", data: String(code) });

      resolve({
        stdout,
        stderr: "",
        exitCode: code,
        timedOut,
        transcript: {
          events,
          startTime,
          endTime,
          totalDuration: endTime - startTime,
          exitCode: code,
          timedOut,
        },
      });
    };

    ptyProcess.onData((data) => {
      stdout += data;
      emitEvent({ type: "chunk", stream: "stdout", data });
    });

    ptyProcess.onExit(({ exitCode }) => {
      finish(exitCode ?? 0, false);
    });

    if (request.input !== undefined) {
      emitEvent({ type: "prompt", data: request.input });
      ptyProcess.write(request.input);
    }
  });
};

export const createPtySubprocessRunner = (
  options?: PtyRunnerOptions,
): SubprocessRunner & { runWithTranscript: (request: SubprocessRequest) => Promise<PtyResult> } => {
  const baseRunner = createRealSubprocessRunner();

  return {
    run: (request: SubprocessRequest) => baseRunner.run(request),

    async runWithTranscript(request: SubprocessRequest): Promise<PtyResult> {
      if (isCodexJsonStreamRequest(request)) {
        return await runStreamingJsonProcess(request, options);
      }

      return await runWithNodePty(request, options);
    },
  };
};
