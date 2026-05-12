import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createPtySubprocessRunner,
  createRealSubprocessRunner,
} from "../../../../../src/integrations/subprocess/runner.js";

const tempDirs: string[] = [];

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "detoks-runner-"));
  tempDirs.push(dir);
  vi.stubEnv("HOME", dir);
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }

  vi.unstubAllEnvs();
});

describe("createRealSubprocessRunner", () => {
  it("captures stdout, stderr, and exit code from a real process", async () => {
    const runner = createRealSubprocessRunner();
    const result = await runner.run({
      command: process.execPath,
      args: [
        "-e",
        "process.stdout.write('out'); process.stderr.write('err'); process.exit(7);",
      ],
    });

    expect(result.stdout).toBe("out");
    expect(result.stderr).toBe("err");
    expect(result.exitCode).toBe(7);
    expect(result.timedOut).toBe(false);
  });

  it("reports a clear failure for missing commands", async () => {
    const runner = createRealSubprocessRunner();
    const result = await runner.run({
      command: "__detoks_missing_binary__",
      args: [],
    });

    expect(result.exitCode).toBe(127);
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(result.timedOut).toBe(false);
  });

  it("streams transcript events from the PTY-aware runner", async () => {
    const runner = createPtySubprocessRunner();
    const result = await runner.runWithTranscript({
      command: process.execPath,
      args: [
        "-e",
        [
          "process.stdout.write('first\\n');",
          "setTimeout(() => {",
          "  process.stdout.write('second\\n');",
          "  process.exit(0);",
          "}, 50);",
        ].join(" "),
      ],
    });

    expect(result.stdout).toContain("first");
    expect(result.stdout).toContain("second");
    expect(result.transcript.events.filter((event) => event.type === "chunk").length).toBeGreaterThanOrEqual(2);
  });

  it(
    "submits one-shot PTY input so stdin-only commands can finish",
    async () => {
      const dir = tempDirs.at(-1)!;
      const codexScript = join(dir, "codex");
      writeFileSync(
        codexScript,
        [
          "#!/usr/bin/env node",
          'let input = "";',
          'process.stdin.setEncoding("utf8");',
          'process.stdin.on("data", (chunk) => { input += chunk; });',
          'process.stdin.on("end", () => {',
          "  process.stdout.write(input);",
          "  process.exit(0);",
          "});",
          "process.stdin.resume();",
        ].join("\n"),
        "utf8",
      );
      chmodSync(codexScript, 0o755);

      const runner = createPtySubprocessRunner();
      const result = await runner.runWithTranscript({
        command: "codex",
        args: ["exec", "-", "--sandbox", "workspace-write"],
        input: "hello\nworld",
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH ?? ""}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("hello");
      expect(result.stdout).toContain("world");
    },
    10_000,
  );

  it("streams Codex JSON output without waiting for a PTY wrapper", async () => {
    const dir = tempDirs.at(-1)!;
    const codexScript = join(dir, "codex");
    writeFileSync(
      codexScript,
      [
        "#!/usr/bin/env node",
        "process.stdout.write('{\"type\":\"turn.started\"}\\n');",
        "setTimeout(() => {",
        "  process.stdout.write('{\"type\":\"message.delta\",\"delta\":\"Hello\"}\\n');",
        "  process.exit(0);",
        "}, 25);",
      ].join("\n"),
      "utf8",
    );
    chmodSync(codexScript, 0o755);

    const runner = createPtySubprocessRunner();
    const result = await runner.runWithTranscript({
      command: "codex",
      args: ["exec", "--json", "-", "--output-last-message", join(dir, "last-message.txt")],
      input: "Hello\n",
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH ?? ""}`,
      },
    });

    expect(result.stdout).toContain("turn.started");
    expect(result.transcript.events.some((event) => event.type === "chunk" && event.stream === "stdout")).toBe(true);
  });
});
