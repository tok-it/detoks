import { describe, expect, it } from "vitest";
import { WorkflowGeneralizer } from "../../../../../src/core/rag/workflow-generalizer.js";
import { DETOKS_VERSION } from "../../../../../src/core/version.js";
import type { SessionState, TaskResult } from "../../../../../src/schemas/pipeline.js";

function makeSession(
  completedIds: string[],
  taskTypes: (string | undefined)[],
  opts: {
    failedIds?: string[];
    updatedAt?: string;
  } = {},
): SessionState {
  const taskResults: Record<string, TaskResult> = {};
  completedIds.forEach((id, i) => {
    taskResults[id] = {
      task_id: id,
      success: true,
      raw_output: "",
      summary: "",
      ...(taskTypes[i] !== undefined ? { type: taskTypes[i] as TaskResult["type"], completed_at: "2026-01-01T00:00:00.000Z" } : {}),
    } as TaskResult;
  });

  return {
    shared_context: {
      session_id: "test-session",
      ...(opts.failedIds ? { failed_task_ids: opts.failedIds } : {}),
    },
    task_results: taskResults,
    current_task_id: null,
    completed_task_ids: completedIds,
    updated_at: opts.updatedAt ?? "2026-01-01T00:01:00.000Z",
  };
}

describe("WorkflowGeneralizer", () => {
  const generalizer = new WorkflowGeneralizer();

  describe("generalize() 기여 생성", () => {
    it("2개 이상 completed task, 모든 type 유효, failedIds 없음 → GeneralizedContribution 반환", () => {
      const session = makeSession(
        ["t1", "t2", "t3"],
        ["explore", "modify", "validate"],
      );
      const result = generalizer.generalize(session, "codex");

      expect(result).not.toBeNull();
      expect(result!.type_sequence).toEqual(["explore", "modify", "validate"]);
      expect(result!.success).toBe(true);
      expect(result!.adapter).toBe("codex");
      expect(result!.task_count).toBe(3);
      expect(result!.detoks_version).toBe(DETOKS_VERSION);
      expect(typeof result!.contributed_at).toBe("string");
    });

    it("모든 RequestCategory 값을 type으로 허용한다", () => {
      const session = makeSession(
        ["t1", "t2"],
        ["create", "execute"],
      );
      expect(generalizer.generalize(session, "claude")).not.toBeNull();
    });
  });

  describe("generalize() null 반환 조건", () => {
    it("completed_task_ids가 1개이면 null", () => {
      const session = makeSession(["t1"], ["explore"]);
      expect(generalizer.generalize(session, "codex")).toBeNull();
    });

    it("completed_task_ids가 0개이면 null", () => {
      const session = makeSession([], []);
      expect(generalizer.generalize(session, "codex")).toBeNull();
    });

    it("failedIds.length > 0이면 null (실패 세션 제외)", () => {
      const session = makeSession(
        ["t1", "t2"],
        ["explore", "modify"],
        { failedIds: ["t2"] },
      );
      expect(generalizer.generalize(session, "codex")).toBeNull();
    });

    it("task type 중 하나가 RequestCategoryValues에 없으면 null", () => {
      const session = makeSession(["t1", "t2"], ["explore", "debug"]);
      expect(generalizer.generalize(session, "codex")).toBeNull();
    });

    it("task type 중 하나가 undefined이면 null", () => {
      const session = makeSession(["t1", "t2"], ["explore", undefined]);
      expect(generalizer.generalize(session, "codex")).toBeNull();
    });
  });

  describe("프라이버시 경계", () => {
    it("반환된 레코드에 project_id, session_id, raw_input, raw_output, project_path 필드가 없다", () => {
      const session = makeSession(["t1", "t2"], ["explore", "modify"]);
      session.shared_context.project_id = "proj-123";
      (session.shared_context as Record<string, unknown>).raw_input = "do something";
      const result = generalizer.generalize(session, "codex");

      expect(result).not.toBeNull();
      const keys = Object.keys(result!);
      expect(keys).not.toContain("project_id");
      expect(keys).not.toContain("session_id");
      expect(keys).not.toContain("raw_input");
      expect(keys).not.toContain("raw_output");
      expect(keys).not.toContain("project_path");
    });
  });

  describe("type_sequence 정확도", () => {
    it("type_sequence 길이가 completed_task_ids 길이와 같다", () => {
      const session = makeSession(
        ["t1", "t2", "t3", "t4"],
        ["explore", "analyze", "modify", "validate"],
      );
      const result = generalizer.generalize(session, "gemini");
      expect(result!.type_sequence).toHaveLength(4);
    });

    it("type_sequence 순서가 completed_task_ids 순서와 일치한다", () => {
      const session = makeSession(
        ["t1", "t2"],
        ["create", "execute"],
      );
      const result = generalizer.generalize(session, "codex");
      expect(result!.type_sequence).toEqual(["create", "execute"]);
    });
  });

  describe("detoks_version", () => {
    it("detoks_version이 DETOKS_VERSION 상수와 일치한다", () => {
      const session = makeSession(["t1", "t2"], ["plan", "execute"]);
      const result = generalizer.generalize(session, "codex");
      expect(result!.detoks_version).toBe(DETOKS_VERSION);
    });
  });

  describe("duration_sec", () => {
    it("completed_at과 updated_at이 있으면 duration_sec을 계산한다", () => {
      const session = makeSession(["t1", "t2"], ["explore", "modify"], {
        updatedAt: "2026-01-01T00:02:00.000Z",
      });
      // t1의 completed_at은 makeSession에서 2026-01-01T00:00:00.000Z로 설정
      const result = generalizer.generalize(session, "codex");
      expect(result!.duration_sec).toBe(120);
    });

    it("completed_at이 없으면 duration_sec은 null", () => {
      const session = makeSession(["t1", "t2"], ["explore", "modify"]);
      // task_results에서 completed_at 제거
      (session.task_results["t1"] as Record<string, unknown>).completed_at = undefined;
      const result = generalizer.generalize(session, "codex");
      expect(result!.duration_sec).toBeNull();
    });
  });
});
