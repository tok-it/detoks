import { describe, expect, it } from "vitest";
import { buildEmbeddedNativeCliRequest } from "../../../../../src/cli/tui/native-cli-session.js";

describe("native-cli-session", () => {
  it("builds a passthrough codex request without prompt input", () => {
    const request = buildEmbeddedNativeCliRequest({
      adapter: "codex",
      cwd: "/tmp/project",
      verbose: false,
      model: "gpt-5.4-mini",
      sessionId: "session-123",
    });

    expect(request.command).toBe("codex");
    expect(request.input).toBeUndefined();
    expect(request.cwd).toBe("/tmp/project");
    expect(request.args.join(" ")).toContain("--model gpt-5.4-mini");
  });

  it("builds a passthrough claude request without prompt input", () => {
    const request = buildEmbeddedNativeCliRequest({
      adapter: "claude",
      cwd: "/tmp/project",
      verbose: true,
      model: "claude-sonnet-4-6",
    });

    expect(request.command).toBe("claude");
    expect(request.input).toBeUndefined();
    expect(request.args.join(" ")).toContain("--model claude-sonnet-4-6");
  });
});
