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
import {
  formatWorkspaceStatusEntry,
  parseWorkspaceStatusLine,
} from "../../../../../src/core/timeline/workspace-status.js";

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
      "  수정 src/core/pipeline/orchestrator.ts",
      "  미추적 tests/ts/unit/cli/tui/workspace-diff.test.ts",
    ]);
  });

  it("parses workspace status lines into human-readable entries", () => {
    const parsed = parseWorkspaceStatusLine("R  src/old.ts -> src/new.ts");

    expect(parsed).toEqual({
      statusCode: "R ",
      kind: "renamed",
      path: "src/old.ts",
      path2: "src/new.ts",
      summary: "이름변경 src/old.ts -> src/new.ts",
    });
    expect(parsed && formatWorkspaceStatusEntry(parsed)).toBe(
      "이름변경 src/old.ts -> src/new.ts",
    );
  });

  it("parses already formatted summary lines", () => {
    expect(parseWorkspaceStatusLine("수정 src/core/pipeline/orchestrator.ts")).toEqual(
      {
        statusCode: "??",
        kind: "modified",
        path: "src/core/pipeline/orchestrator.ts",
        summary: "수정 src/core/pipeline/orchestrator.ts",
      },
    );
  });
});
