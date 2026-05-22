import { describe, expect, it } from "vitest";
import {
  describeCommandActivity,
  statusFromCommandStatusLine,
} from "../../../../../../src/cli/tui/panels/embedded-terminal-activity.js";

describe("embedded terminal activity helpers", () => {
  it("classifies common shell commands", () => {
    expect(describeCommandActivity(`/bin/zsh -lc "sed -n '1,20p' src/index.ts"`)).toMatchObject({
      kind: "file",
      label: "파일 읽기",
      detail: "src/index.ts",
    });

    expect(describeCommandActivity(`/bin/zsh -lc "rg -n \\"ProjectMemory\\" src tests"`)).toMatchObject({
      kind: "search",
      label: "검색",
      detail: "ProjectMemory",
    });

    expect(describeCommandActivity("git status --short")).toMatchObject({
      kind: "git",
      label: "Git",
    });

    expect(describeCommandActivity("npm test")).toMatchObject({
      kind: "test",
      label: "검증",
    });
  });

  it("maps command status lines to activity status", () => {
    expect(statusFromCommandStatusLine(null)).toBe("running");
    expect(statusFromCommandStatusLine("succeeded in 10ms")).toBe("completed");
    expect(statusFromCommandStatusLine("failed in 10ms")).toBe("failed");
  });
});
