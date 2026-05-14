import { describe, expect, it } from "vitest";
import { buildExecutionApprovalLines } from "../../../../../src/cli/tui/approval-prompt.js";

describe("execution approval prompt", () => {
  it("renders confirm and cancel guidance", () => {
    const lines = buildExecutionApprovalLines(40).join("\n");

    expect(lines).toContain("실행 전 확인");
    expect(lines).toContain("Enter 실행 · Esc 편집 복귀");
  });

  it("returns empty lines for non-positive width", () => {
    expect(buildExecutionApprovalLines(0)).toEqual([]);
  });
});
