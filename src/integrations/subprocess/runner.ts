import type { SubprocessRequest, SubprocessResult, SubprocessRunner } from "./types.js";
import { spawn } from "node:child_process";

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

export const createRealSubprocessRunner = (): SubprocessRunner => ({
  async run(request: SubprocessRequest): Promise<SubprocessResult> {
    return await new Promise<SubprocessResult>((resolve) => {
      const child = spawn(request.command, request.args, {
        cwd: request.cwd,
        env: request.env ? { ...process.env, ...request.env } : process.env,
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
