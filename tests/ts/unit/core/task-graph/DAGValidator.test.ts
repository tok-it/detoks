import { describe, expect, it } from "vitest";
import { DAGValidator } from "../../../../../src/core/task-graph/DAGValidator.js";
import { makeGraph, makeTask } from "../../helpers/task.js";

describe("DAGValidator", () => {
  describe("정상 케이스", () => {
    it("단일 task는 유효한 DAG다", () => {
      const graph = makeGraph(makeTask({ id: "t1" }));
      const result = DAGValidator.validate(graph);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.topologicalOrder).toEqual(["t1"]);
      }
    });

    it("선형 의존 (t1 → t2 → t3) topological order를 반환한다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2", depends_on: ["t1"] }),
        makeTask({ id: "t3", depends_on: ["t2"] }),
      );
      const result = DAGValidator.validate(graph);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.topologicalOrder).toEqual(["t1", "t2", "t3"]);
      }
    });

    it("fan-out (t1 → t2, t1 → t3) 구조는 유효하다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2", depends_on: ["t1"] }),
        makeTask({ id: "t3", depends_on: ["t1"] }),
      );
      const result = DAGValidator.validate(graph);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.topologicalOrder[0]).toBe("t1");
        expect(result.topologicalOrder).toContain("t2");
        expect(result.topologicalOrder).toContain("t3");
      }
    });

    it("fan-in (t1, t2 → t3) 구조는 유효하다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2" }),
        makeTask({ id: "t3", depends_on: ["t1", "t2"] }),
      );
      const result = DAGValidator.validate(graph);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.topologicalOrder.indexOf("t1")).toBeLessThan(
          result.topologicalOrder.indexOf("t3"),
        );
        expect(result.topologicalOrder.indexOf("t2")).toBeLessThan(
          result.topologicalOrder.indexOf("t3"),
        );
      }
    });

    it("모든 task가 depends_on: [] 이면 고립 노드가 아니다 (의도적 병렬)", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2" }),
        makeTask({ id: "t3" }),
      );
      const result = DAGValidator.validate(graph);

      expect(result.valid).toBe(true);
    });
  });

  describe("UNKNOWN_DEPENDENCY", () => {
    it("존재하지 않는 id를 depends_on에 참조하면 실패한다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2", depends_on: ["t99"] }),
      );
      const result = DAGValidator.validate(graph);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("UNKNOWN_DEPENDENCY");
        expect(result.detail).toContain("t99");
      }
    });
  });

  describe("CYCLE_DETECTED", () => {
    it("자기 자신을 depends_on에 참조하면 사이클로 감지된다", () => {
      const graph = makeGraph(makeTask({ id: "t1", depends_on: ["t1"] }));
      const result = DAGValidator.validate(graph);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("CYCLE_DETECTED");
      }
    });

    it("t1 → t2 → t1 사이클을 감지한다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1", depends_on: ["t2"] }),
        makeTask({ id: "t2", depends_on: ["t1"] }),
      );
      const result = DAGValidator.validate(graph);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("CYCLE_DETECTED");
        expect(result.detail).toContain("t1");
        expect(result.detail).toContain("t2");
      }
    });

    it("t1 → t2 → t3 → t1 긴 사이클을 감지한다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1", depends_on: ["t3"] }),
        makeTask({ id: "t2", depends_on: ["t1"] }),
        makeTask({ id: "t3", depends_on: ["t2"] }),
      );
      const result = DAGValidator.validate(graph);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("CYCLE_DETECTED");
      }
    });
  });

  describe("DISCONNECTED_NODE", () => {
    it("엣지가 있는 그래프에서 고립된 노드를 감지한다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2", depends_on: ["t1"] }),
        makeTask({ id: "t3" }), // t1-t2 연결과 무관
      );
      const result = DAGValidator.validate(graph);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("DISCONNECTED_NODE");
        expect(result.detail).toContain("t3");
      }
    });

    it("diamond 구조 (t1→t2, t1→t3, t2→t4, t3→t4)는 고립 노드 없이 유효하다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2", depends_on: ["t1"] }),
        makeTask({ id: "t3", depends_on: ["t1"] }),
        makeTask({ id: "t4", depends_on: ["t2", "t3"] }),
      );
      const result = DAGValidator.validate(graph);

      expect(result.valid).toBe(true);
    });
  });
});
