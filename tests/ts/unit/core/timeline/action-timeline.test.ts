import { describe, expect, it } from "vitest";
import { buildActionTimeline, getTurnRecapLines } from "../../../../../src/core/timeline/action-timeline.js";

describe("action timeline helpers", () => {
  it("builds a recap from action timeline and workspace diff", () => {
    const timeline = buildActionTimeline(
      {
        summary: "1개 작업을 모두 완료했습니다",
        nextAction: "파이프라인이 완료되었습니다.",
        progressLog: [
          {
            stage: "Prompt Compiler",
            status: "start",
            message: "Prompt Compiler 시작",
            timestamp: 1,
          },
        ],
        actionTimeline: [
          {
            kind: "tool_call",
            source: "adapter",
            summary: "codex 실행: codex exec --color never",
            timestamp: 2,
          },
        ],
        adapterTranscript: {
          events: [
            {
              type: "chunk",
              timestamp: 1,
              stream: "stdout",
              data:
                "{\"type\":\"item.started\",\"item\":{\"type\":\"command_execution\",\"command\":\"rg -n \\\"foo\\\" src\",\"status\":\"in_progress\"}}\n{\"type\":\"item.started\",\"item\":{\"type\":\"command_execution\",\"command\":\"npm run typecheck\",\"status\":\"in_progress\"}}\n{\"type\":\"item.completed\",\"item\":{\"type\":\"command_execution\",\"command\":\"npm run typecheck\",\"aggregated_output\":\"ok\\n\",\"exit_code\":0,\"status\":\"completed\"}}\n{\"type\":\"item.started\",\"item\":{\"type\":\"command_execution\",\"command\":\"git commit -m \\\"feat: update\\\"\",\"status\":\"in_progress\"}}\n{\"type\":\"item.completed\",\"item\":{\"type\":\"command_execution\",\"command\":\"git commit -m \\\"feat: update\\\"\",\"aggregated_output\":\"commit\\n\",\"exit_code\":0,\"status\":\"completed\"}}\n{\"type\":\"item.completed\",\"item\":{\"type\":\"command_execution\",\"command\":\"git push origin dev\",\"aggregated_output\":\"pushed\\n\",\"exit_code\":0,\"status\":\"completed\"}}\n{\"type\":\"item.completed\",\"item\":{\"type\":\"file_change\",\"changes\":[{\"path\":\"src/core/timeline/action-timeline.ts\",\"kind\":\"update\"}],\"status\":\"completed\"}}\n",
            },
          ],
          startTime: 1,
          endTime: 2,
          totalDuration: 1,
          timedOut: false,
        },
      },
      [
        "[WORKSPACE] 새로 바뀐 파일",
        "  M src/core/timeline/action-timeline.ts",
      ],
    );

    const recap = timeline.find((event) => event.kind === "turn_recap");
    expect(recap).toBeDefined();
    expect(timeline.some((event) => event.kind === "stage_update")).toBe(true);
    expect(timeline.some((event) => event.kind === "file_edit")).toBe(true);
    expect(timeline.some((event) => event.kind === "tool_call")).toBe(true);
    expect(timeline.some((event) => event.kind === "validation")).toBe(true);
    expect(timeline.some((event) => event.kind === "git_operation")).toBe(true);
    expect(recap?.details).toContain("요약: 1개 작업을 모두 완료했습니다");
    expect(recap?.details).toContain("다음 작업: 파이프라인이 완료되었습니다.");
    expect(recap?.details?.join("\n")).toContain("진행 단계:");
    expect(recap?.details?.join("\n")).toContain("Planning");
    expect(recap?.details?.join("\n")).toContain("Inspecting");
    expect(recap?.details?.join("\n")).toContain("Validating");
    expect(recap?.details?.join("\n")).toContain("Committing");
    expect(recap?.details?.join("\n")).toContain("Waiting for CI");
    expect(recap?.details?.join("\n")).toContain("편집:");
    expect(recap?.details?.join("\n")).toContain("검증:");
    expect(recap?.details?.join("\n")).toContain("git:");
  });

  it("returns recap lines from the recap event", () => {
    const lines = getTurnRecapLines({
      kind: "turn_recap",
      source: "detoks",
      summary: "턴 종료 recap",
      timestamp: 1,
      details: ["요약: done", "다음 작업: none"],
    });

    expect(lines).toEqual(["턴 종료 recap", "요약: done", "다음 작업: none"]);
  });
});
