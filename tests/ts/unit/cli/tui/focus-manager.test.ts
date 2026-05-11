import { describe, expect, it } from "vitest";
import {
  createEmbeddedTerminalFocusManager,
  isEmbeddedTerminalInterruptKey,
  isEmbeddedTerminalNativeFocusToggleKey,
  isEmbeddedTerminalReturnToDetoksKey,
} from "../../../../../src/cli/tui/focus-manager.js";

describe("embedded-terminal focus manager", () => {
  it("switches between detoks, native, and summary focus", () => {
    const manager = createEmbeddedTerminalFocusManager();

    expect(manager.focus).toBe("detoks-input");

    manager.focusNative();
    expect(manager.focus).toBe("adapter-terminal");

    manager.focusSummary();
    expect(manager.focus).toBe("summary");

    manager.focusDetoks();
    expect(manager.focus).toBe("detoks-input");
  });

  it("detects native focus control keys", () => {
    expect(isEmbeddedTerminalNativeFocusToggleKey("\x14")).toBe(true);
    expect(isEmbeddedTerminalReturnToDetoksKey("\x07")).toBe(true);
    expect(isEmbeddedTerminalInterruptKey("\x03")).toBe(true);
  });
});
