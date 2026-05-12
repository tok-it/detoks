import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import * as pty from "node-pty";
import type {
  PtyEvent,
  PtyResult,
  PtySessionController,
  SubprocessRequest,
} from "./types.js";

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

interface InteractivePtyBackend {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

const buildFailedInteractivePtySession = (
  error: unknown,
  onEvent?: (event: PtyEvent) => void,
): PtySessionController => {
  const startTime = Date.now();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const events: PtyEvent[] = [
    { type: "error", timestamp: startTime, data: errorMessage },
    { type: "exit", timestamp: startTime, data: "127" },
  ];
  for (const event of events) {
    onEvent?.(event);
  }

  return {
    write: () => {},
    resize: () => {},
    close: () => {},
    kill: () => {},
    result: Promise.resolve({
      stdout: "",
      stderr: errorMessage,
      exitCode: 127,
      timedOut: false,
      transcript: {
        events,
        startTime,
        endTime: startTime,
        totalDuration: 0,
        exitCode: 127,
        timedOut: false,
      },
    }),
  };
};

const resolveInteractiveBackend = (
  request: SubprocessRequest,
): InteractivePtyBackend => {
  const env = request.env ? { ...process.env, ...request.env } : process.env;
  const resolvedCommand = resolveCommandFromPath(request.command, env);
  const runViaNode = resolvedCommand !== undefined && isNodeShebangScript(resolvedCommand);
  return {
    command: runViaNode ? process.execPath : (resolvedCommand ?? request.command),
    args: runViaNode ? [resolvedCommand, ...request.args] : request.args,
    env,
  };
};

export const createInteractivePtySession = (
  request: SubprocessRequest,
  options?: {
    passthroughUi?: boolean;
    // Emit raw PTY chunks without line-splitting. Use for embedded pane
    // where TerminalEmulatorBuffer needs unmodified ANSI byte sequences.
    rawOutput?: boolean;
    onEvent?: (event: PtyEvent) => void;
  },
): PtySessionController => {
  const backend = resolveInteractiveBackend(request);
  let ptyProcess: pty.IPty;
  try {
    ptyProcess = pty.spawn(backend.command, backend.args, {
      name: backend.env.TERM ?? process.env.TERM ?? "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: request.cwd ?? process.cwd(),
      env: backend.env as Record<string, string | undefined>,
      encoding: "utf8",
    });
  } catch (error) {
    return buildFailedInteractivePtySession(error, options?.onEvent);
  }

  const startTime = Date.now();
  const events: PtyEvent[] = [];
  let settled = false;
  let stdout = "";
  let stdoutPending = "";

  const emitEvent = (event: Omit<PtyEvent, "timestamp">): void => {
    const fullEvent: PtyEvent = { ...event, timestamp: Date.now() };
    events.push(fullEvent);
    options?.onEvent?.(fullEvent);
  };

  const finish = (code: number, timedOut: boolean): PtyResult => {
    const endTime = Date.now();
    return {
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
    };
  };

  const result = new Promise<PtyResult>((resolve) => {
    const settle = (code: number, timedOut: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      emitEvent({ type: "exit", data: String(code) });
      resolve(finish(code, timedOut));
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

    let dataDisposable: pty.IDisposable | undefined;
    let exitDisposable: pty.IDisposable | undefined;

    dataDisposable = ptyProcess.onData((data) => {
      stdout += data;
      emitEvent({ type: "chunk", stream: "stdout", data });
      if (!options?.rawOutput) {
        stdoutPending = pushLines(data, "stdout", stdoutPending);
      }
    });

    exitDisposable = ptyProcess.onExit(({ exitCode, signal }) => {
      if (stdoutPending.length > 0) {
        emitEvent({
          type: "chunk",
          stream: "stdout",
          data: stdoutPending,
        });
        stdoutPending = "";
      }

      dataDisposable?.dispose();
      exitDisposable?.dispose();

      settle(
        signal !== undefined
          ? 128
          : typeof exitCode === "number"
            ? exitCode
            : 1,
        false,
      );
    });
  });

  return {
    write: (data: string): void => {
      if (request.input !== undefined) {
        emitEvent({ type: "prompt", data });
      }
      ptyProcess.write(data);
    },
    resize: (columns: number, rows: number): void => {
      emitEvent({ type: "resize", columns, rows });
      ptyProcess.resize(columns, rows);
    },
    close: (): void => {
      ptyProcess.kill("SIGTERM");
    },
    kill: (signal: NodeJS.Signals = "SIGTERM"): void => {
      ptyProcess.kill(signal);
    },
    result,
  };
};
