import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { extname, join } from "node:path";
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
    // Emit raw stdout/stderr chunks without line-splitting. Use for embedded pane
    // where TerminalEmulatorBuffer needs unmodified ANSI byte sequences.
    rawOutput?: boolean;
    onEvent?: (event: PtyEvent) => void;
  },
): PtySessionController => {
  const backend = resolveInteractiveBackend(request);
  const passthroughInteractiveMode = options?.passthroughUi && request.input === undefined;
  const child = spawn(backend.command, backend.args, {
    cwd: request.cwd,
    env: backend.env,
    shell: false,
    stdio: passthroughInteractiveMode
      ? ["inherit", "inherit", "inherit"]
      : [
          "pipe",
          options?.passthroughUi ? "inherit" : "pipe",
          options?.passthroughUi ? "inherit" : "pipe",
        ],
  });

  const startTime = Date.now();
  const events: PtyEvent[] = [];
  let settled = false;
  let stdout = "";
  let stderr = "";
  let stdoutPending = "";
  let stderrPending = "";

  const emitEvent = (event: Omit<PtyEvent, "timestamp">): void => {
    const fullEvent: PtyEvent = { ...event, timestamp: Date.now() };
    events.push(fullEvent);
    options?.onEvent?.(fullEvent);
  };

  const finish = (code: number, timedOut: boolean): PtyResult => {
    const endTime = Date.now();
    return {
      stdout,
      stderr,
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

    if (!options?.passthroughUi || !passthroughInteractiveMode) {
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");

      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
        emitEvent({ type: "chunk", stream: "stdout", data: chunk });
        if (!options?.rawOutput) {
          stdoutPending = pushLines(chunk, "stdout", stdoutPending);
        }
      });

      child.stderr?.on("data", (chunk: string) => {
        stderr += chunk;
        emitEvent({ type: "chunk", stream: "stderr", data: chunk });
        if (!options?.rawOutput) {
          stderrPending = pushLines(chunk, "stderr", stderrPending);
        }
      });
    }

    child.on("error", (error) => {
      emitEvent({ type: "error", data: String(error) });
      settle(127, false);
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
      settle(typeof code === "number" ? code : signal ? 128 : 1, false);
    });
  });

  return {
    write: (data: string): void => {
      if (request.input !== undefined) {
        emitEvent({ type: "prompt", data });
      }
      child.stdin?.write(data);
    },
    resize: (columns: number, rows: number): void => {
      emitEvent({ type: "resize", columns, rows });
      child.kill("SIGWINCH");
    },
    close: (): void => {
      if (!passthroughInteractiveMode) {
        child.stdin?.end();
      }
    },
    kill: (signal: NodeJS.Signals = "SIGTERM"): void => {
      child.kill(signal);
    },
    result,
  };
};
