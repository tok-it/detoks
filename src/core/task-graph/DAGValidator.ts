import type { Task, TaskGraph } from "../../schemas/pipeline.js";

/**
 * DAG 검증 성공 결과입니다.
 *
 * topologicalOrder: 실행 가능한 순서로 정렬된 task id 배열
 *   - 앞에 있는 task일수록 먼저 실행 가능
 *   - Kahn's algorithm으로 계산 (in-degree 기반)
 *   - 이 배열을 DependencyResolver에 그대로 전달하면 됩니다
 *
 * 예: t1 → t2 → t3 구조라면 topologicalOrder = ["t1", "t2", "t3"]
 */
export type DAGValidationSuccess = {
  valid: true;
  topologicalOrder: string[];
};

/**
 * DAG 검증 실패 결과입니다.
 *
 * reason: 실패 원인 코드
 *   - "UNKNOWN_DEPENDENCY" : depends_on에 존재하지 않는 task id를 참조
 *   - "CYCLE_DETECTED"     : 순환 의존성 존재 (A→B→A 같은 구조)
 *   - "DISCONNECTED_NODE"  : 그래프의 나머지와 연결되지 않은 고립 task
 *
 * detail: 어떤 task에서 문제가 발생했는지 설명하는 사람이 읽을 수 있는 메시지
 */
export type DAGValidationFailure = {
  valid: false;
  reason: "CYCLE_DETECTED" | "UNKNOWN_DEPENDENCY" | "DISCONNECTED_NODE";
  detail: string;
};

/**
 * validate()의 반환 타입입니다.
 *
 * TypeScript discriminated union: valid 필드를 기준으로 분기 가능
 *   if (result.valid) {
 *     result.topologicalOrder  // ← 여기서만 접근 가능
 *   } else {
 *     result.reason            // ← 여기서만 접근 가능
 *   }
 */
export type DAGValidationResult = DAGValidationSuccess | DAGValidationFailure;

/**
 * TaskGraph가 유효한 DAG(Directed Acyclic Graph)인지 3단계로 검증합니다.
 *
 * DAG 조건 = 방향이 있고(Directed) + 순환이 없는(Acyclic) 그래프
 * TaskGraph가 DAG여야 topological sort가 가능하고, 실행 순서를 결정할 수 있습니다.
 *
 * 검증 순서 (빠른 실패 우선):
 *   1. UNKNOWN_DEPENDENCY — 참조된 id가 존재하는지 (O(n²) 전에 빠르게 차단)
 *   2. CYCLE_DETECTED     — 순환 의존성 여부 (DFS)
 *   3. DISCONNECTED_NODE  — 그래프 일부가 완전히 고립되었는지
 *   4. 성공 → topological order 계산 후 반환
 */
export class DAGValidator {
  static validate(graph: TaskGraph): DAGValidationResult {
    // 전체 task id 집합 — 존재 여부를 O(1)로 확인하기 위해 Set 사용
    const ids = new Set(graph.tasks.map((t) => t.id));

    // ─── Step 1: UNKNOWN_DEPENDENCY ─────────────────────────────
    // 각 task의 depends_on에 적힌 id가 실제로 존재하는지 확인
    //
    // 예) t2.depends_on = ["t99"] 인데 t99가 없으면
    //     → t2는 영원히 시작할 수 없는 task가 됨 → 즉시 실패 반환
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

    // ─── Step 2: CYCLE_DETECTED ──────────────────────────────────
    // DFS로 순환 의존성 탐지
    // 순환이 있으면 실행 순서를 결정할 수 없음 (어떤 task도 먼저 시작할 수 없게 됨)
    //
    // 예) t1.depends_on=["t2"], t2.depends_on=["t1"]
    //     → t1은 t2가 끝나야 실행, t2는 t1이 끝나야 실행 → 영원히 기다림
    const cycleResult = this.detectCycle(graph.tasks);
    if (cycleResult) return cycleResult;

    // ─── Step 3: DISCONNECTED_NODE ───────────────────────────────
    // 그래프에 엣지(의존 관계)가 하나라도 있는데, 어떤 task가 완전히 고립되어 있는지 확인
    //
    // "고립 노드"의 정의:
    //   - 본인은 아무것도 의존하지 않음 (depends_on: [])
    //   - 다른 task도 본인을 의존하지 않음 (아무도 depends_on에 이 id를 포함하지 않음)
    //
    // 예) t1→t2 연결은 있는데 t3는 완전히 혼자 → t3는 고립 노드
    //     단, 모든 task가 병렬(depends_on: [])이면 고립이 아님 — 의도적 병렬 실행
    const hasAnyEdge = graph.tasks.some((t) => t.depends_on.length > 0);
    if (hasAnyEdge) {
      // 어떤 task의 depends_on에라도 언급된 id 전체 집합
      const referencedIds = new Set(graph.tasks.flatMap((t) => t.depends_on));
      for (const task of graph.tasks) {
        // depends_on도 없고, 다른 task가 나를 의존하지도 않으면 → 고립
        if (task.depends_on.length === 0 && !referencedIds.has(task.id)) {
          return {
            valid: false,
            reason: "DISCONNECTED_NODE",
            detail: `Task "${task.id}" has no dependencies and no dependents — isolated from the graph`,
          };
        }
      }
    }

    // ─── Step 4: 성공 → topological order 계산 ───────────────────
    const order = this.topologicalSort(graph.tasks);
    return { valid: true, topologicalOrder: order };
  }

  /**
   * DFS white/gray/black 컬러링으로 순환 의존성을 탐지합니다.
   *
   * 컬러 의미:
   *   white(0) : 아직 방문하지 않은 노드
   *   gray(1)  : 현재 DFS 경로 위에 있는 노드 (방문 중, 아직 완료되지 않음)
   *   black(2) : DFS가 완전히 끝난 노드 (이 노드에서 시작하는 경로에 사이클 없음)
   *
   * 사이클 탐지 원리:
   *   gray 노드를 다시 만났다 = 현재 탐색 경로에서 이미 방문한 노드로 돌아왔다 = 사이클!
   *
   * 예) t1 → t2 → t1 탐색 중:
   *   dfs(t1): color[t1]=gray, 이웃 t2 탐색
   *   dfs(t2): color[t2]=gray, 이웃 t1 탐색
   *   t1이 gray → 사이클 발견! path = ["t1", "t2", "t1"]
   *
   * @returns 사이클이 있으면 DAGValidationFailure, 없으면 null
   */
  private static detectCycle(tasks: Task[]): DAGValidationFailure | null {
    const color = new Map<string, 0 | 1 | 2>(tasks.map((t) => [t.id, 0]));
    // adjList: 각 task에서 의존하는 task id 목록 (방향: "나 → 내가 의존하는 것")
    const adjList = new Map<string, string[]>(
      tasks.map((t) => [t.id, t.depends_on])
    );

    // path: 현재 DFS 경로 (사이클 발견 시 경로 문자열 구성에 사용)
    const dfs = (id: string, path: string[]): string[] | null => {
      color.set(id, 1); // 방문 시작 → gray
      for (const dep of adjList.get(id) ?? []) {
        if (color.get(dep) === 1) {
          // gray 노드를 다시 만남 → 사이클! 경로 배열 반환
          return [...path, id, dep];
        }
        if (color.get(dep) === 0) {
          // white 노드 → 아직 미방문, 재귀 탐색
          const cycle = dfs(dep, [...path, id]);
          if (cycle) return cycle; // 하위에서 사이클이 발견되면 그대로 전파
        }
        // black 노드(=2) → 이미 완료된 노드, 이 방향엔 사이클 없음 → 무시
      }
      color.set(id, 2); // 이 노드의 모든 이웃 탐색 완료 → black
      return null;
    };

    for (const task of tasks) {
      if (color.get(task.id) === 0) {
        // white 노드만 DFS 시작점으로 사용 (gray/black은 이미 처리됨)
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

  /**
   * Kahn's algorithm으로 topological sort를 수행합니다.
   *
   * 핵심 개념:
   *   in-degree  : 이 task를 의존하는 다른 task의 수 (= 나보다 먼저 끝나야 하는 task 수)
   *   dependents : 내가 완료됐을 때 "대기 해제"해줘야 하는 task 목록 (역방향 엣지)
   *
   * 알고리즘 순서:
   *   1. 모든 task의 in-degree를 계산
   *   2. in-degree가 0인 task(= 아무것도 기다리지 않아도 되는 task)를 큐에 넣음
   *   3. 큐에서 하나씩 꺼내어 result에 추가
   *   4. 꺼낸 task를 의존하던 task들의 in-degree를 1씩 감소
   *   5. in-degree가 0이 된 task를 큐에 추가
   *   6. 큐가 빌 때까지 반복
   *
   * 예) t1 → t2 → t3 구조:
   *   in-degree: { t1:0, t2:1, t3:1 }
   *   초기 큐: [t1]
   *   t1 처리 → t2의 in-degree: 0 → 큐: [t2]
   *   t2 처리 → t3의 in-degree: 0 → 큐: [t3]
   *   t3 처리 → result: ["t1", "t2", "t3"]
   *
   * 병렬 예) t1, t2 모두 depends_on:[]:
   *   in-degree: { t1:0, t2:0 }
   *   초기 큐: [t1, t2]
   *   result: ["t1", "t2"] (순서는 tasks 배열 순서 따름)
   */
  private static topologicalSort(tasks: Task[]): string[] {
    // in-degree: 각 task를 의존하는 task의 수 (초기값 0, 아래에서 갱신)
    const inDegree = new Map<string, number>(tasks.map((t) => [t.id, 0]));
    // dependents: "내가 완료되면 이 task들의 in-degree를 줄여줘야 한다"는 역방향 맵
    const dependents = new Map<string, string[]>(tasks.map((t) => [t.id, []]));

    for (const task of tasks) {
      // 이 task는 depends_on 수만큼 기다려야 함
      inDegree.set(task.id, task.depends_on.length);
      for (const dep of task.depends_on) {
        // dep가 완료되면 task의 in-degree를 줄여줘야 한다
        dependents.get(dep)!.push(task.id);
      }
    }

    // 초기 큐: 지금 당장 실행 가능한 task들 (아무것도 기다리지 않아도 되는 task)
    const queue = tasks.filter((t) => t.depends_on.length === 0).map((t) => t.id);
    const result: string[] = [];

    while (queue.length > 0) {
      const id = queue.shift()!; // 큐 앞에서 하나 꺼냄 (FIFO → BFS 순서)
      result.push(id);

      // 이 task가 완료됐으므로, 이 task를 기다리던 task들의 in-degree를 1씩 감소
      for (const dependent of dependents.get(id) ?? []) {
        const deg = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, deg);
        if (deg === 0) {
          // 이제 이 task도 모든 선행 task가 완료됨 → 실행 가능 → 큐에 추가
          queue.push(dependent);
        }
      }
    }

    return result;
  }
}
