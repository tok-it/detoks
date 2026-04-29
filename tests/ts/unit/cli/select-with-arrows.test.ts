import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectWithArrows } from "../../../../src/cli/interactive/select-with-arrows.js";

const createMockInput = () => {
  const input = new PassThrough() as PassThrough & {
    isTTY: boolean;
    isRaw: boolean;
    setRawMode: (mode: boolean) => void;
  };

  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = vi.fn((mode: boolean) => {
    input.isRaw = mode;
  });
  input.resume = vi.fn(() => input);
  input.pause = vi.fn(() => input);

  return input;
};

const createMockOutput = (rows = 80) => {
  const output = new PassThrough() as PassThrough & {
    isTTY: boolean;
    columns: number;
    rows: number;
  };
  output.isTTY = true;
  output.columns = 80;
  output.rows = rows;

  let buffer = "";
  output.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
  });

  return {
    output,
    getBuffer: () => buffer,
  };
};

describe("selectWithArrows", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses cursor clearing instead of appending duplicate menu frames", async () => {
    const input = createMockInput();
    const { output, getBuffer } = createMockOutput();
    const onOpen = vi.fn();
    const onClose = vi.fn();

    const selectionPromise = selectWithArrows(
      [
        { value: "alpha", label: "Alpha" },
        { value: "beta", label: "Beta" },
      ],
      "테스트 선택",
      {
        input: input as unknown as typeof process.stdin,
        output: output as unknown as typeof process.stdout,
        onOpen,
        onClose,
      },
    );

    input.emit("keypress", "", { name: "down" });
    input.emit("keypress", "", { name: "return" });

    await expect(selectionPromise).resolves.toBe("beta");

    const rendered = getBuffer();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(rendered).toContain("\x1b[?1049h");
    expect(rendered).toContain("\x1b[?1049l");
    expect(rendered).toContain("\x1b[?25l");
    expect(rendered).toContain("\x1b[?25h");
    expect(rendered).toContain("\x1b[2J\x1b[H");
  });

  it("shows a scrolling window when the option list exceeds the terminal height", async () => {
    const input = createMockInput();
    const { output, getBuffer } = createMockOutput(5);

    const selectionPromise = selectWithArrows(
      [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
        { value: "c", label: "Gamma" },
        { value: "d", label: "Delta" },
        { value: "e", label: "Epsilon" },
      ],
      "긴 목록",
      {
        input: input as unknown as typeof process.stdin,
        output: output as unknown as typeof process.stdout,
      },
    );

    input.emit("keypress", "", { name: "down" });
    input.emit("keypress", "", { name: "down" });
    input.emit("keypress", "", { name: "return" });

    await expect(selectionPromise).resolves.toBe("c");

    const rendered = getBuffer();
    expect(rendered).toContain("1-1/5");
    expect(rendered).toContain("2-2/5");
    expect(rendered).toContain("3-3/5");
    expect(rendered).toContain("↑↓ 선택 · Enter 확정 · ESC 취소");
  });
});
