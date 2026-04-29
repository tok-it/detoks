import { afterEach, describe, expect, it, vi } from "vitest";
import { runSessionResetCommand } from "../../../../src/cli/commands/session-reset.js";
import { SessionStateManager } from "../../../../src/core/state/SessionStateManager.js";

describe("runSessionResetCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an explicit not-found contract when the session is missing", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(false);

    await expect(runSessionResetCommand("missing_session")).resolves.toEqual({
      ok: false,
      mode: "session-reset",
      sessionId: "missing_session",
      reset: false,
      mutatesState: false,
      message: "세션 missing_session를 찾지 못했습니다.",
    });
  });

  it("deletes an existing session", async () => {
    vi.spyOn(SessionStateManager, "sessionExists").mockResolvedValue(true);
    const deleteSpy = vi
      .spyOn(SessionStateManager, "deleteSession")
      .mockResolvedValue(undefined);

    await expect(runSessionResetCommand("session_to_reset")).resolves.toEqual({
      ok: true,
      mode: "session-reset",
      sessionId: "session_to_reset",
      reset: true,
      mutatesState: true,
      message: "세션 session_to_reset를 초기화(삭제)했습니다.",
    });

    expect(deleteSpy).toHaveBeenCalledWith("session_to_reset");
  });
});
