import type { Task, TaskGraph } from "../../schemas/pipeline.js";
import type { DAGValidationSuccess } from "./DAGValidator.js";

/**
 * 실행 순서가 결정된 Task 하나를 나타냅니다.
 *
 * - task : 이번에 실행할 Task 객체
 * - deps : 이 Task가 실행되기 전에 반드시 완료되어야 하는 Task 객체 목록
 *          (task.depends_on의 ID 배열을 실제 Task 객체로 변환한 것)
 *
 * 예) t2.depends_on = ["t1"] 이면
 *     → deps = [ Task(t1) ]   ← "t1이 끝나야 t2를 시작할 수 있다"
 */
export type ResolvedTask = {
  task: Task;
  deps: Task[];
};

/**
 * DependencyResolver.resolve()의 반환값입니다.
 *
 * - orderedTasks : topological 순서로 정렬된 ResolvedTask 배열
 *   - 앞에 있는 항목일수록 먼저 실행 가능
 *   - 같은 위치에 있더라도 deps가 비어 있으면 바로 실행 가능 (병렬 후보)
 *   - ParallelClassifier는 이 배열을 받아 stage 단위로 그룹화함
 */
export type DependencyResolution = {
  orderedTasks: ResolvedTask[];
};

/**
 * DAGValidator의 topologicalOrder(string[])를
 * 실제 실행에 필요한 Task 객체 순서(ResolvedTask[])로 변환합니다.
 *
 * ─────────────────────────────────────────────────────
 * 역할 분담
 *   DAGValidator    : 그래프가 유효한 DAG인지 검증 + topological 순서(ID 배열) 계산
 *   DependencyResolver : ID 배열 → Task 객체 배열로 변환 + 각 Task의 deps(선행 Task) resolve
 *   ParallelClassifier : ResolvedTask 배열을 받아 병렬 실행 가능한 stage로 그룹화
 * ─────────────────────────────────────────────────────
 *
 * 선행 조건: DAGValidator.validate()가 { valid: true }를 반환한 그래프여야 합니다.
 *            (사이클 없음, 존재하지 않는 ID 참조 없음이 보장된 상태)
 */
export class DependencyResolver {
  static resolve(
    graph: TaskGraph,
    validation: DAGValidationSuccess
  ): DependencyResolution {
    // id → Task 객체 빠른 조회를 위한 Map 생성
    // 예: { "t1" → Task, "t2" → Task, ... }
    const taskMap = new Map<string, Task>(graph.tasks.map((t) => [t.id, t]));

    // topologicalOrder는 DAGValidator(Kahn's algorithm)가 계산한 실행 가능 순서
    // 예: ["t1", "t3", "t2"] → t1 먼저, 그 다음 t3, 마지막 t2
    const orderedTasks: ResolvedTask[] = validation.topologicalOrder.map(
      (id) => {
        const task = taskMap.get(id)!;

        // depends_on의 ID 문자열들을 실제 Task 객체로 변환
        // 예: task.depends_on = ["t1"] → deps = [ Task(t1) ]
        // deps가 빈 배열이면 이 Task는 아무것도 기다릴 필요 없음 (즉시 실행 가능)
        const deps = task.depends_on.map((depId) => taskMap.get(depId)!);

        return { task, deps };
      }
    );

    return { orderedTasks };
  }
}
