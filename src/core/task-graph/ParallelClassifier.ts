import type { Task } from "../../schemas/pipeline.js";
import type { DependencyResolution } from "./DependencyResolver.js";

/**
 * 동시에 실행 가능한 Task 묶음 하나를 나타냅니다.
 *
 * - stage : 실행 단계 번호 (0부터 시작)
 *   - stage 0 : 아무것도 기다리지 않아도 되는 task들 — 가장 먼저 실행
 *   - stage 1 : stage 0이 모두 완료된 후 실행 가능한 task들
 *   - stage N : stage 0~(N-1)이 모두 완료된 후 실행 가능한 task들
 *
 * - tasks : 이 stage에 속한 Task 배열
 *   - 같은 stage 안의 task들은 서로 의존하지 않으므로 병렬 실행 가능
 *
 * 예) t1→t2, t1→t3, t4(독립) 구조:
 *   stage 0: [t1, t4]   ← 둘 다 depends_on 없음, 동시 실행 가능
 *   stage 1: [t2, t3]   ← 둘 다 t1에만 의존, t1 완료 후 동시 실행 가능
 */
export type ExecutionStage = {
  stage: number;
  tasks: Task[];
};

/**
 * ParallelClassifier.classify()의 반환값입니다.
 *
 * - stages : 실행 단계 배열 (stage 번호 오름차순 정렬)
 *   - 앞 stage가 완전히 끝나야 다음 stage를 시작할 수 있음
 *   - 같은 stage 내 task들은 병렬 실행 가능
 *
 * 이 구조를 실제 실행기(executor)에 넘기면
 * "stage 단위로 await + 내부는 Promise.all" 패턴으로 실행 가능
 */
export type ParallelClassification = {
  stages: ExecutionStage[];
};

/**
 * DependencyResolver 결과를 받아 병렬 실행 가능한 stage 단위로 그룹화합니다.
 *
 * ─── 역할 분담 ─────────────────────────────────────────────────────
 *   DependencyResolver  : topological 순서로 정렬된 ResolvedTask[] 제공
 *   ParallelClassifier  : ResolvedTask[]를 stage 단위로 그룹화  ← 여기
 *   (실행기)            : stages[]를 순서대로 실행 (stage 내부는 병렬)
 * ──────────────────────────────────────────────────────────────────
 *
 * stage 배정 규칙:
 *   - deps가 없으면 → stage 0
 *   - deps가 있으면 → max(deps의 stage) + 1
 *
 * orderedTasks는 이미 topological 순서이므로,
 * 각 task를 순서대로 처리할 때 deps의 stage가 항상 먼저 결정되어 있음이 보장됩니다.
 */
export class ParallelClassifier {
  static classify(resolution: DependencyResolution): ParallelClassification {
    // task id → 배정된 stage 번호
    const stageMap = new Map<string, number>();

    for (const { task, deps } of resolution.orderedTasks) {
      if (deps.length === 0) {
        // 선행 task가 없으면 가장 첫 번째 단계
        stageMap.set(task.id, 0);
      } else {
        // 내 모든 deps 중 가장 늦은 stage + 1 = 내 stage
        // 예) deps가 stage 0짜리와 stage 2짜리라면 → 내 stage = 2 + 1 = 3
        const maxDepStage = Math.max(...deps.map((dep) => stageMap.get(dep.id) ?? 0));
        stageMap.set(task.id, maxDepStage + 1);
      }
    }

    // stage 번호 → Task[] 로 그룹화
    const stageGroups = new Map<number, Task[]>();
    for (const { task } of resolution.orderedTasks) {
      const stage = stageMap.get(task.id)!;
      if (!stageGroups.has(stage)) stageGroups.set(stage, []);
      stageGroups.get(stage)!.push(task);
    }

    // stage 번호 오름차순으로 정렬하여 반환
    const stages: ExecutionStage[] = Array.from(stageGroups.entries())
      .sort(([a], [b]) => a - b)
      .map(([stage, tasks]) => ({ stage, tasks }));

    return { stages };
  }
}
