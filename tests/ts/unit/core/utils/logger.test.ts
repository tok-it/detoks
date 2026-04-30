import { afterEach, describe, expect, it, vi } from "vitest";

const originalDebug = process.env.DETOKS_DEBUG;
const originalForceColor = process.env.FORCE_COLOR;
const originalNoColor = process.env.NO_COLOR;

describe("logger", () => {
  afterEach(() => {
    process.env.DETOKS_DEBUG = originalDebug;
    process.env.FORCE_COLOR = originalForceColor;
    process.env.NO_COLOR = originalNoColor;
    vi.restoreAllMocks();
  });

  it("does not emit info logs when debug is disabled", async () => {
    process.env.DETOKS_DEBUG = "0";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { logger } = await import("../../../../../src/core/utils/logger.js");

    logger.info("hidden");
    logger.warn("hidden warn");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("styles warn/error labels when debug and color are forced", async () => {
    process.env.DETOKS_DEBUG = "1";
    process.env.FORCE_COLOR = "1";
    delete process.env.NO_COLOR;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { logger } = await import("../../../../../src/core/utils/logger.js");

    logger.warn("warn message");
    logger.error("error message");

    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("\x1b[1m\x1b[33m[WARN]\x1b[0m");
    expect(String(errorSpy.mock.calls.at(-1)?.[0])).toContain("\x1b[1m\x1b[31m[ERROR]\x1b[0m");
  });
});
