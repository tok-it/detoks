import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createInteractivePtySession } from "../../../../../src/integrations/subprocess/pty-session.js";

class FakeStream extends EventEmitter {
  setEncoding = vi.fn();
  write = vi.fn();
  end = vi.fn();
}

class FakeChildProcess extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  stdin = new FakeStream();
  kill = vi.fn();
}

const childProcessMocks = vi.hoisted(() => {
  const spawn = vi.fn();
  return { spawn };
});

vi.mock("node:child_process", () => ({
  spawn: childProcessMocks.spawn,
}));

describe("interactive PTY session", () => {
  it("keeps stdin inherited and open for foreground passthrough sessions without canned input", async () => {
    const child = new FakeChildProcess();
    childProcessMocks.spawn.mockReturnValueOnce(child as unknown as never);

    const session = createInteractivePtySession(
      {
        command: process.execPath,
        args: ["-e", "process.stdout.write('ok')"],
      },
      {
        passthroughUi: true,
        onEvent: vi.fn(),
      },
    );

    expect(childProcessMocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      ["-e", "process.stdout.write('ok')"],
      expect.objectContaining({
        shell: false,
        stdio: ["inherit", "inherit", "inherit"],
      }),
    );

    session.resize(100, 30);
    expect(child.kill).toHaveBeenCalledWith("SIGWINCH");

    session.close();
    expect(child.stdin.end).not.toHaveBeenCalled();

    const resultPromise = session.result;
    child.emit("close", 0, null);
    await expect(resultPromise).resolves.toMatchObject({
      exitCode: 0,
      timedOut: false,
    });
  });

  it("keeps stdin writable for interactive passthrough sessions with canned input", async () => {
    const child = new FakeChildProcess();
    childProcessMocks.spawn.mockReturnValueOnce(child as unknown as never);

    const session = createInteractivePtySession(
      {
        command: process.execPath,
        args: ["-e", "process.stdout.write('ok')"],
        input: "hello detoks\n",
      },
      {
        passthroughUi: true,
        onEvent: vi.fn(),
      },
    );

    expect(childProcessMocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      ["-e", "process.stdout.write('ok')"],
      expect.objectContaining({
        shell: false,
        stdio: ["pipe", "inherit", "inherit"],
      }),
    );

    session.write("hello detoks\n");
    expect(child.stdin.write).toHaveBeenCalledWith("hello detoks\n");

    session.close();
    expect(child.stdin.end).toHaveBeenCalled();

    const resultPromise = session.result;
    child.emit("close", 0, null);
    await expect(resultPromise).resolves.toMatchObject({
      exitCode: 0,
      timedOut: false,
    });
  });

  it("captures child output and emits resize events outside passthrough mode", async () => {
    const child = new FakeChildProcess();
    childProcessMocks.spawn.mockReturnValueOnce(child as unknown as never);
    const onEvent = vi.fn();

    const session = createInteractivePtySession(
      {
        command: process.execPath,
        args: ["-e", "process.stdout.write('ok')"],
      },
      {
        onEvent,
      },
    );

    child.stdout.emit("data", "ok");
    child.stderr.emit("data", "err");
    session.resize(100, 30);
    session.close();

    const resultPromise = session.result;
    child.emit("close", 0, null);
    const result = await resultPromise;

    expect(result.stdout).toContain("ok");
    expect(result.stderr).toContain("err");
    expect(result.exitCode).toBe(0);
    expect(onEvent.mock.calls.some(([event]) => event.type === "resize" && event.columns === 100 && event.rows === 30)).toBe(true);
    expect(onEvent.mock.calls.some(([event]) => event.type === "chunk" && event.stream === "stdout")).toBe(true);
  });

  it("rawOutput: true emits only raw chunks and no additional line-split events", async () => {
    const child = new FakeChildProcess();
    childProcessMocks.spawn.mockReturnValueOnce(child as unknown as never);
    const onEvent = vi.fn();

    const session = createInteractivePtySession(
      { command: process.execPath, args: [] },
      { rawOutput: true, onEvent },
    );

    child.stdout.emit("data", "line1\nline2\n");
    session.close();
    child.emit("close", 0, null);
    await session.result;

    const chunkEvents = onEvent.mock.calls
      .map((args: any[]) => args[0])
      .filter((e: any) => e.type === "chunk");

    // rawOutput mode: exactly one chunk event per emit, no line-split duplicates
    expect(chunkEvents.length).toBe(1);
    expect(chunkEvents[0].data).toBe("line1\nline2\n");
  });

  it("kill forwards the given signal to the child process", async () => {
    const child = new FakeChildProcess();
    childProcessMocks.spawn.mockReturnValueOnce(child as unknown as never);

    const session = createInteractivePtySession(
      { command: process.execPath, args: [] },
      { onEvent: vi.fn() },
    );

    session.kill("SIGINT");
    expect(child.kill).toHaveBeenCalledWith("SIGINT");

    session.kill("SIGTERM");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");

    child.emit("close", 130, null);
    const result = await session.result;
    expect(result.exitCode).toBe(130);
  });

  it("kill defaults to SIGTERM when no signal is provided", () => {
    const child = new FakeChildProcess();
    childProcessMocks.spawn.mockReturnValueOnce(child as unknown as never);

    const session = createInteractivePtySession(
      { command: process.execPath, args: [] },
      { onEvent: vi.fn() },
    );

    session.kill();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("preserves raw chunks without script-wrapper normalization", async () => {
    const child = new FakeChildProcess();
    childProcessMocks.spawn.mockReturnValueOnce(child as unknown as never);

    const session = createInteractivePtySession(
      {
        command: process.execPath,
        args: ["-e", "process.stdout.write('ok')"],
      },
      {
        onEvent: vi.fn(),
      },
    );

    child.stdout.emit("data", "\u0004\b\bhello");
    session.close();

    const resultPromise = session.result;
    child.emit("close", 0, null);
    const result = await resultPromise;

    expect(result.stdout).toContain("\u0004\b\bhello");
    expect(result.transcript.events.some((event) => event.type === "chunk" && event.data?.includes("\u0004\b\bhello") === true)).toBe(true);
  });
});
