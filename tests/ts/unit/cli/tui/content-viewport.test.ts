import { describe, expect, it } from "vitest";
import {
  createPinnedViewportState,
  resolveViewportWindow,
  scrollViewportBy,
  scrollViewportToBottom,
  scrollViewportToTop,
} from "../../../../../src/cli/tui/content-viewport.js";

describe("content viewport", () => {
  it("auto-follows the bottom while pinned", () => {
    const state = createPinnedViewportState();
    const initial = resolveViewportWindow(20, 5, state);
    expect(initial.startIndex).toBe(15);

    const afterGrowth = resolveViewportWindow(24, 5, state);
    expect(afterGrowth.startIndex).toBe(19);
    expect(afterGrowth.pinnedToBottom).toBe(true);
  });

  it("preserves the viewed top row while user is browsing history", () => {
    const state = scrollViewportBy(20, 5, createPinnedViewportState(), -3);
    const window = resolveViewportWindow(20, 5, state);
    expect(window.startIndex).toBe(12);
    expect(window.pinnedToBottom).toBe(false);

    const afterGrowth = resolveViewportWindow(24, 5, state);
    expect(afterGrowth.startIndex).toBe(12);
    expect(afterGrowth.pinnedToBottom).toBe(false);
  });

  it("returns to bottom on explicit bottom command", () => {
    const browsing = scrollViewportBy(20, 5, createPinnedViewportState(), -4);
    const backToBottom = resolveViewportWindow(20, 5, scrollViewportToBottom());

    expect(resolveViewportWindow(20, 5, browsing).pinnedToBottom).toBe(false);
    expect(backToBottom.startIndex).toBe(15);
    expect(backToBottom.pinnedToBottom).toBe(true);
  });

  it("moves to absolute top on explicit top command", () => {
    const top = resolveViewportWindow(20, 5, scrollViewportToTop());
    expect(top.startIndex).toBe(0);
    expect(top.pinnedToBottom).toBe(false);
  });
});
