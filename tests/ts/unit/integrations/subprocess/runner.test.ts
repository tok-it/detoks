import { describe, expect, it } from "vitest";
import { createStubSubprocessRunner } from "../../../../../src/integrations/subprocess/runner.js";

describe("createStubSubprocessRunner", () => {
  it("returns a stub subprocess result", async () => {
    const runner = createStubSubprocessRunner();
    const result = await runner.run({
      command: "codex",
      args: ["--help"],
    });

    expect(result.stdout).toBe("[stub:subprocess] codex --help");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });
});
