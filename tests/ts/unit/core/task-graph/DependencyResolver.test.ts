import { describe, expect, it } from "vitest";
import { DAGValidator } from "../../../../../src/core/task-graph/DAGValidator.js";
import { DependencyResolver } from "../../../../../src/core/task-graph/DependencyResolver.js";
import type { TaskGraph } from "../../../../../src/schemas/pipeline.js";
import { makeGraph, makeTask } from "../../helpers/task.js";

function resolve(graph: TaskGraph) {
  const validation = DAGValidator.validate(graph);
  if (!validation.valid) throw new Error(`Invalid graph: ${validation.reason}`);
  return DependencyResolver.resolve(graph, validation);
}

describe("DependencyResolver", () => {
  describe("단순 선형 의존성", () => {
    it("단일 task는 deps가 빈 배열이다", () => {
      const graph = makeGraph(makeTask({ id: "t1" }));
      const { orderedTasks } = resolve(graph);

      expect(orderedTasks).toHaveLength(1);
      expect(orderedTasks[0]!.task.id).toBe("t1");
      expect(orderedTasks[0]!.deps).toEqual([]);
    });

    it("t1 → t2 → t3 순서로 orderedTasks를 반환한다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2", depends_on: ["t1"] }),
        makeTask({ id: "t3", depends_on: ["t2"] }),
      );
      const { orderedTasks } = resolve(graph);

      expect(orderedTasks.map((r) => r.task.id)).toEqual(["t1", "t2", "t3"]);
    });

    it("deps는 id 문자열이 아닌 실제 Task 객체다", () => {
      const t1 = makeTask({ id: "t1" });
      const t2 = makeTask({ id: "t2", depends_on: ["t1"] });
      const graph = makeGraph(t1, t2);
      const { orderedTasks } = resolve(graph);

      const resolved_t2 = orderedTasks.find((r) => r.task.id === "t2")!;
      expect(resolved_t2.deps).toHaveLength(1);
      expect(resolved_t2.deps[0]!.id).toBe("t1");
      expect(resolved_t2.deps[0]!.type).toBe(t1.type);
    });

    it("선행 task의 deps는 비어 있고, 후행 task의 deps는 채워져 있다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2", depends_on: ["t1"] }),
        makeTask({ id: "t3", depends_on: ["t2"] }),
      );
      const { orderedTasks } = resolve(graph);

      expect(orderedTasks[0]!.deps).toEqual([]);           // t1: 선행 없음
      expect(orderedTasks[1]!.deps.map((d) => d.id)).toEqual(["t1"]);
      expect(orderedTasks[2]!.deps.map((d) => d.id)).toEqual(["t2"]);
    });
  });

  describe("복수 의존성 (fan-in)", () => {
    it("t1, t2 → t3 구조에서 t3의 deps가 [t1, t2]다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2" }),
        makeTask({ id: "t3", depends_on: ["t1", "t2"] }),
      );
      const { orderedTasks } = resolve(graph);

      const resolved_t3 = orderedTasks.find((r) => r.task.id === "t3")!;
      expect(resolved_t3.deps.map((d) => d.id)).toEqual(["t1", "t2"]);
    });

    it("t3는 orderedTasks에서 t1, t2보다 뒤에 위치한다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2" }),
        makeTask({ id: "t3", depends_on: ["t1", "t2"] }),
      );
      const { orderedTasks } = resolve(graph);
      const ids = orderedTasks.map((r) => r.task.id);

      expect(ids.indexOf("t1")).toBeLessThan(ids.indexOf("t3"));
      expect(ids.indexOf("t2")).toBeLessThan(ids.indexOf("t3"));
    });
  });

  describe("deterministic 결과 보장", () => {
    it("같은 입력에 대해 항상 동일한 orderedTasks를 반환한다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2", depends_on: ["t1"] }),
        makeTask({ id: "t3", depends_on: ["t1"] }),
        makeTask({ id: "t4", depends_on: ["t2", "t3"] }),
      );

      const result1 = resolve(graph).orderedTasks.map((r) => r.task.id);
      const result2 = resolve(graph).orderedTasks.map((r) => r.task.id);

      expect(result1).toEqual(result2);
    });
  });
});
