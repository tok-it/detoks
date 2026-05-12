import { EventEmitter } from "node:events";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createInteractivePtySession } from "../../../../../src/integrations/subprocess/pty-session.js";

class FakePtyProcess extends EventEmitter {
  write = vi.fn();
  resize = vi.fn();
  kill = vi.fn();
  clear = vi.fn();
  pause = vi.fn();
  resume = vi.fn();

  onData(listener: (data: string) => void) {
    this.on("data", listener);
    return { dispose: () => this.off("data", listener) };
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void) {
    this.on("exit", listener);
    return { dispose: () => this.off("exit", listener) };
  }

  emitData(data: string): void {
    this.emit("data", data);
  }

  emitExit(exitCode: number, signal?: number): void {
    this.emit("exit", { exitCode, signal });
  }
}

const ptyMocks = vi.hoisted(() => {
  const spawn = vi.fn();
  return { spawn };
});

vi.mock("node-pty", () => ({
  spawn: ptyMocks.spawn,
}));

describe("interactive PTY session", () => {
  beforeEach(() => {
    ptyMocks.spawn.mockReset();
  });

  it("spawns a real PTY and forwards writes, resize, and close controls", async () => {
    const ptyProcess = new FakePtyProcess();
    ptyMocks.spawn.mockReturnValueOnce(ptyProcess as unknown as never);
    const onEvent = vi.fn();

    const session = createInteractivePtySession(
      {
        command: process.execPath,
        args: ["-e", "process.stdout.write('ok')"],
        cwd: "/tmp/detoks-pty-test",
      },
      { onEvent },
    );

    expect(ptyMocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      ["-e", "process.stdout.write('ok')"],
      expect.objectContaining({
        name: expect.any(String),
        cols: 80,
        rows: 24,
        cwd: "/tmp/detoks-pty-test",
        encoding: "utf8",
      }),
    );

    session.write("hello detoks");
    expect(ptyProcess.write).toHaveBeenCalledWith("hello detoks");

    session.resize(100, 30);
    expect(ptyProcess.resize).toHaveBeenCalledWith(100, 30);
    expect(
      onEvent.mock.calls.some(
        ([event]) => event.type === "resize" && event.columns === 100 && event.rows === 30,
      ),
    ).toBe(true);

    ptyProcess.emitData("ok");
    session.close();
    expect(ptyProcess.kill).toHaveBeenCalledWith("SIGTERM");

    ptyProcess.emitExit(0);
    await expect(session.result).resolves.toMatchObject({
      stdout: "ok",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
  });

  it("keeps request input writable and emits a prompt event for canned input", async () => {
    const ptyProcess = new FakePtyProcess();
    ptyMocks.spawn.mockReturnValueOnce(ptyProcess as unknown as never);
    const onEvent = vi.fn();

    const session = createInteractivePtySession(
      {
        command: process.execPath,
        args: ["-e", "process.stdout.write('ok')"],
        input: "hello detoks\n",
      },
      { onEvent },
    );

    session.write("hello detoks\n");
    expect(ptyProcess.write).toHaveBeenCalledWith("hello detoks\n");
    expect(onEvent.mock.calls.some(([event]) => event.type === "prompt")).toBe(true);

    session.close();
    expect(ptyProcess.kill).toHaveBeenCalledWith("SIGTERM");

    ptyProcess.emitExit(0);
    await expect(session.result).resolves.toMatchObject({
      exitCode: 0,
      timedOut: false,
    });
  });

  it("captures child output and emits resize events", async () => {
    const ptyProcess = new FakePtyProcess();
    ptyMocks.spawn.mockReturnValueOnce(ptyProcess as unknown as never);
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

    ptyProcess.emitData("ok");
    ptyProcess.emitData("err");
    session.resize(100, 30);
    session.close();

    ptyProcess.emitExit(0);
    const result = await session.result;

    expect(result.stdout).toContain("ok");
    expect(result.stdout).toContain("err");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(
      onEvent.mock.calls.some(
        ([event]) => event.type === "resize" && event.columns === 100 && event.rows === 30,
      ),
    ).toBe(true);
    expect(onEvent.mock.calls.some(([event]) => event.type === "chunk" && event.stream === "stdout")).toBe(true);
  });

  it("rawOutput: true emits only raw PTY chunks and no additional line-split events", async () => {
    const ptyProcess = new FakePtyProcess();
    ptyMocks.spawn.mockReturnValueOnce(ptyProcess as unknown as never);
    const onEvent = vi.fn();

    const session = createInteractivePtySession(
      { command: process.execPath, args: [] },
      { rawOutput: true, onEvent },
    );

    ptyProcess.emitData("line1\nline2\n");
    session.close();
    ptyProcess.emitExit(0);
    await session.result;

    const chunkEvents = onEvent.mock.calls
      .map((args: any[]) => args[0])
      .filter((event: any) => event.type === "chunk");

    expect(chunkEvents.length).toBe(1);
    expect(chunkEvents[0].data).toBe("line1\nline2\n");
  });

  it("kill forwards the given signal to the PTY", async () => {
    const ptyProcess = new FakePtyProcess();
    ptyMocks.spawn.mockReturnValueOnce(ptyProcess as unknown as never);

    const session = createInteractivePtySession(
      { command: process.execPath, args: [] },
      { onEvent: vi.fn() },
    );

    session.kill("SIGINT");
    expect(ptyProcess.kill).toHaveBeenCalledWith("SIGINT");

    session.kill("SIGTERM");
    expect(ptyProcess.kill).toHaveBeenCalledWith("SIGTERM");

    ptyProcess.emitExit(130);
    const result = await session.result;
    expect(result.exitCode).toBe(130);
  });

  it("kill defaults to SIGTERM when no signal is provided", () => {
    const ptyProcess = new FakePtyProcess();
    ptyMocks.spawn.mockReturnValueOnce(ptyProcess as unknown as never);

    const session = createInteractivePtySession(
      { command: process.execPath, args: [] },
      { onEvent: vi.fn() },
    );

    session.kill();
    expect(ptyProcess.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("preserves raw chunks without script-wrapper normalization", async () => {
    const ptyProcess = new FakePtyProcess();
    ptyMocks.spawn.mockReturnValueOnce(ptyProcess as unknown as never);

    const session = createInteractivePtySession(
      {
        command: process.execPath,
        args: ["-e", "process.stdout.write('ok')"],
      },
      {
        onEvent: vi.fn(),
      },
    );

    ptyProcess.emitData("\u0004\b\bhello");
    session.close();

    ptyProcess.emitExit(0);
    const result = await session.result;

    expect(result.stdout).toContain("\u0004\b\bhello");
    expect(result.transcript.events.some((event) => event.type === "chunk" && event.data?.includes("\u0004\b\bhello") === true)).toBe(true);
  });

  it("spawn failure resolves result with exitCode 127 and emits error event", async () => {
    ptyMocks.spawn.mockImplementationOnce(() => {
      throw new Error("ENOENT: no such file or directory");
    });
    const onEvent = vi.fn();

    const session = createInteractivePtySession(
      { command: process.execPath, args: [] },
      { onEvent },
    );

    const result = await session.result;

    expect(result.exitCode).toBe(127);
    expect(result.timedOut).toBe(false);
    expect(onEvent.mock.calls.some(([event]) => event.type === "error")).toBe(true);
  });

  it("close with signal resolves result with exitCode 128", async () => {
    const ptyProcess = new FakePtyProcess();
    ptyMocks.spawn.mockReturnValueOnce(ptyProcess as unknown as never);

    const session = createInteractivePtySession(
      { command: process.execPath, args: [] },
      { onEvent: vi.fn() },
    );

    ptyProcess.emitExit(0, 9);
    const result = await session.result;

    expect(result.exitCode).toBe(128);
    expect(result.timedOut).toBe(false);
  });
});
