import type { Task, TaskGraph } from "../../schemas/pipeline.js";

export type DAGValidationSuccess = {
  valid: true;
  topologicalOrder: string[];
};

export type DAGValidationFailure = {
  valid: false;
  reason: "CYCLE_DETECTED" | "UNKNOWN_DEPENDENCY" | "DISCONNECTED_NODE";
  detail: string;
};

export type DAGValidationResult = DAGValidationSuccess | DAGValidationFailure;

/**
 * TaskGraph가 유효한 DAG인지 검증합니다.
 *
 * 검증 순서:
 * 1. UNKNOWN_DEPENDENCY — depends_on에 존재하지 않는 ID 참조 여부
 * 2. CYCLE_DETECTED     — 순환 의존성 여부 (DFS)
 * 3. DISCONNECTED_NODE  — 연결된 그래프 안의 고립 노드 여부
 * 4. 정상이면 topological order 반환
 */
export class DAGValidator {
  static validate(graph: TaskGraph): DAGValidationResult {
    const ids = new Set(graph.tasks.map((t) => t.id));

    // 1. 존재하지 않는 ID 참조 검사
    for (const task of graph.tasks) {
      for (const dep of task.depends_on) {
        if (!ids.has(dep)) {
          return {
            valid: false,
            reason: "UNKNOWN_DEPENDENCY",
            detail: `Task "${task.id}" depends on "${dep}" which does not exist`,
          };
        }
      }
    }

    // 2. 사이클 탐지 (DFS white/gray/black 컬러링)
    const cycleResult = this.detectCycle(graph.tasks);
    if (cycleResult) return cycleResult;

    // 3. 고립 노드 탐지
    // 그래프 안에 depends_on이 있는 task가 하나라도 있는데(= 연결된 부분이 있는데)
    // 어떤 task가 depends_on도 없고 다른 task가 의존하지도 않으면 고립 노드로 판단
    const hasAnyEdge = graph.tasks.some((t) => t.depends_on.length > 0);
    if (hasAnyEdge) {
      const referencedIds = new Set(graph.tasks.flatMap((t) => t.depends_on));
      for (const task of graph.tasks) {
        if (task.depends_on.length === 0 && !referencedIds.has(task.id)) {
          return {
            valid: false,
            reason: "DISCONNECTED_NODE",
            detail: `Task "${task.id}" has no dependencies and no dependents — isolated from the graph`,
          };
        }
      }
    }

    // 4. Topological sort (Kahn's algorithm)
    const order = this.topologicalSort(graph.tasks);
    return { valid: true, topologicalOrder: order };
  }

  // DFS: white(미방문)=0 / gray(방문중)=1 / black(완료)=2
  private static detectCycle(tasks: Task[]): DAGValidationFailure | null {
    const color = new Map<string, 0 | 1 | 2>(tasks.map((t) => [t.id, 0]));
    const adjList = new Map<string, string[]>(
      tasks.map((t) => [t.id, t.depends_on])
    );

    const dfs = (id: string, path: string[]): string[] | null => {
      color.set(id, 1);
      for (const dep of adjList.get(id) ?? []) {
        if (color.get(dep) === 1) return [...path, id, dep];
        if (color.get(dep) === 0) {
          const cycle = dfs(dep, [...path, id]);
          if (cycle) return cycle;
        }
      }
      color.set(id, 2);
      return null;
    };

    for (const task of tasks) {
      if (color.get(task.id) === 0) {
        const cycle = dfs(task.id, []);
        if (cycle) {
          return {
            valid: false,
            reason: "CYCLE_DETECTED",
            detail: `Cycle detected: ${cycle.join(" → ")}`,
          };
        }
      }
    }
    return null;
  }

  // Kahn's algorithm: in-degree 기반 topological sort
  private static topologicalSort(tasks: Task[]): string[] {
    const inDegree = new Map<string, number>(tasks.map((t) => [t.id, 0]));
    const dependents = new Map<string, string[]>(tasks.map((t) => [t.id, []]));

    for (const task of tasks) {
      inDegree.set(task.id, task.depends_on.length);
      for (const dep of task.depends_on) {
        dependents.get(dep)!.push(task.id);
      }
    }

    const queue = tasks.filter((t) => t.depends_on.length === 0).map((t) => t.id);
    const result: string[] = [];

    while (queue.length > 0) {
      const id = queue.shift()!;
      result.push(id);
      for (const dependent of dependents.get(id) ?? []) {
        const deg = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, deg);
        if (deg === 0) queue.push(dependent);
      }
    }

    return result;
  }
}
