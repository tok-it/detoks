import { describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => {
  const spawnSync = vi.fn();
  return { spawnSync };
});

vi.mock("node:child_process", () => ({
  spawnSync: childProcessMocks.spawnSync,
}));

import {
  captureWorkspaceSnapshot,
  diffWorkspaceSnapshots,
} from "../../../../../src/cli/tui/workspace-diff.js";

describe("workspace diff helper", () => {
  it("captures git status lines as a workspace snapshot", () => {
    childProcessMocks.spawnSync.mockReturnValueOnce({
      stdout: " M src/cli/tui/index.ts\n?? tests/ts/unit/cli/tui/workspace-diff.test.ts\n",
      status: 0,
      error: undefined,
    });

    expect(captureWorkspaceSnapshot("/workspace")).toEqual({
      statusLines: [
        " M src/cli/tui/index.ts",
        "?? tests/ts/unit/cli/tui/workspace-diff.test.ts",
      ],
    });
    expect(childProcessMocks.spawnSync).toHaveBeenCalledWith(
      "git",
      ["status", "--short"],
      expect.objectContaining({
        cwd: "/workspace",
        encoding: "utf-8",
      }),
    );
  });

  it("returns only newly changed files when comparing snapshots", () => {
    expect(
      diffWorkspaceSnapshots(
        {
          statusLines: [" M src/cli/tui/index.ts"],
        },
        {
          statusLines: [
            " M src/cli/tui/index.ts",
            " M src/core/pipeline/orchestrator.ts",
            "?? tests/ts/unit/cli/tui/workspace-diff.test.ts",
          ],
        },
      ),
    ).toEqual([
      "[WORKSPACE] 새로 바뀐 파일",
      "   M src/core/pipeline/orchestrator.ts",
      "  ?? tests/ts/unit/cli/tui/workspace-diff.test.ts",
    ]);
  });
});
