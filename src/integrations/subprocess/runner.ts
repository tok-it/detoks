import type { SubprocessRequest, SubprocessResult, SubprocessRunner } from "./types.js";
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { extname, join } from "node:path";

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
