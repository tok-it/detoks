import { describe, expect, it } from "vitest";
import { createRealSubprocessRunner } from "../../../../../src/integrations/subprocess/runner.js";

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
});
