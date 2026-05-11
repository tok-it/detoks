import { describe, expect, it } from "vitest";
import { createInteractivePtySession } from "../../../../../src/integrations/subprocess/pty-session.js";

describe("interactive PTY session", () => {
  it("captures child output and emits resize events", async () => {
    const events: Array<{ type: string; data?: string; columns?: number; rows?: number }> = [];
    const session = createInteractivePtySession(
      {
        command: process.execPath,
        args: ["-e", "process.stdout.write('ok')"],
      },
      {
        onEvent: (event) => {
          events.push(event);
        },
      },
    );

    session.resize(100, 30);
    session.close();

    const result = await session.result;

    expect(result.stdout).toContain("ok");
    expect(result.exitCode).toBe(0);
    expect(events.some((event) => event.type === "resize" && event.columns === 100 && event.rows === 30)).toBe(true);
  });
});
