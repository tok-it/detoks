import { describe, expect, it } from "vitest";
import { DAGValidator } from "../../../../../src/core/task-graph/DAGValidator.js";
import { DependencyResolver } from "../../../../../src/core/task-graph/DependencyResolver.js";
import { ParallelClassifier } from "../../../../../src/core/task-graph/ParallelClassifier.js";
import type { TaskGraph } from "../../../../../src/schemas/pipeline.js";
import { makeGraph, makeTask } from "../../helpers/task.js";

function classify(graph: TaskGraph) {
  const validation = DAGValidator.validate(graph);
  if (!validation.valid) throw new Error(`Invalid graph: ${validation.reason}`);
  const resolution = DependencyResolver.resolve(graph, validation);
  return ParallelClassifier.classify(resolution);
}

describe("ParallelClassifier", () => {
  describe("독립 Task 병렬 그룹화", () => {
    it("단일 task는 stage 0 하나만 생성된다", () => {
      const graph = makeGraph(makeTask({ id: "t1" }));
      const { stages } = classify(graph);

      expect(stages).toHaveLength(1);
      expect(stages[0]!.stage).toBe(0);
      expect(stages[0]!.tasks.map((t) => t.id)).toEqual(["t1"]);
    });

    it("모든 독립 task는 stage 0에 함께 배치된다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2" }),
        makeTask({ id: "t3" }),
      );
      const { stages } = classify(graph);

      expect(stages).toHaveLength(1);
      expect(stages[0]!.stage).toBe(0);
      expect(stages[0]!.tasks.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    });

    it("fan-out (t1→t2, t1→t3) 구조에서 t2, t3는 같은 stage에 배치된다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2", depends_on: ["t1"] }),
        makeTask({ id: "t3", depends_on: ["t1"] }),
      );
      const { stages } = classify(graph);

      expect(stages).toHaveLength(2);

      const stage0Ids = stages[0]!.tasks.map((t) => t.id);
      const stage1Ids = stages[1]!.tasks.map((t) => t.id);

      expect(stage0Ids).toEqual(["t1"]);
      expect(stage1Ids).toContain("t2");
      expect(stage1Ids).toContain("t3");
    });
  });

  describe("순차 실행 Task 분리", () => {
    it("t1 → t2 → t3 선형 구조는 각각 별도 stage에 배치된다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2", depends_on: ["t1"] }),
        makeTask({ id: "t3", depends_on: ["t2"] }),
      );
      const { stages } = classify(graph);

      expect(stages).toHaveLength(3);
      expect(stages[0]!.tasks.map((t) => t.id)).toEqual(["t1"]);
      expect(stages[1]!.tasks.map((t) => t.id)).toEqual(["t2"]);
      expect(stages[2]!.tasks.map((t) => t.id)).toEqual(["t3"]);
    });

    it("fan-in (t1, t2 → t3) 구조에서 t1, t2는 stage 0이고 t3는 stage 1이다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2" }),
        makeTask({ id: "t3", depends_on: ["t1", "t2"] }),
      );
      const { stages } = classify(graph);

      expect(stages).toHaveLength(2);

      const stage0Ids = stages[0]!.tasks.map((t) => t.id);
      expect(stage0Ids).toContain("t1");
      expect(stage0Ids).toContain("t2");
      expect(stages[1]!.tasks.map((t) => t.id)).toEqual(["t3"]);
    });
  });

  describe("stage 단위 구조 생성", () => {
    it("stages 배열은 stage 번호 오름차순으로 정렬된다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2", depends_on: ["t1"] }),
        makeTask({ id: "t3", depends_on: ["t2"] }),
      );
      const { stages } = classify(graph);

      for (let i = 0; i < stages.length - 1; i++) {
        expect(stages[i]!.stage).toBeLessThan(stages[i + 1]!.stage);
      }
    });

    it("diamond (t1→t2,t3, t2,t3→t4) 구조는 3단계로 분류된다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2", depends_on: ["t1"] }),
        makeTask({ id: "t3", depends_on: ["t1"] }),
        makeTask({ id: "t4", depends_on: ["t2", "t3"] }),
      );
      const { stages } = classify(graph);

      expect(stages).toHaveLength(3);
      expect(stages[0]!.tasks.map((t) => t.id)).toEqual(["t1"]);
      expect(stages[1]!.tasks.map((t) => t.id)).toContain("t2");
      expect(stages[1]!.tasks.map((t) => t.id)).toContain("t3");
      expect(stages[2]!.tasks.map((t) => t.id)).toEqual(["t4"]);
    });

    it("각 stage의 stage 번호는 배열 인덱스와 일치한다", () => {
      const graph = makeGraph(
        makeTask({ id: "t1" }),
        makeTask({ id: "t2", depends_on: ["t1"] }),
      );
      const { stages } = classify(graph);

      stages.forEach((s, i) => {
        expect(s.stage).toBe(i);
      });
    });
  });
});
