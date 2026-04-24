import type { SessionState, Task } from "../../schemas/pipeline.js";
import { ContextProcessingError } from "../errors/StateErrors.js";
import { logger } from "../utils/logger.js";

/**
 * ContextSelector
 * 세션 상태에서 현재 작업과 가장 관련성이 높은 정보만 선별
 */
export class ContextSelector {
  /**
   * 전체 세션 상태에서 대상 Task에 필요한 최적의 데이터 서브셋을 선택
   */
  static select(
    state: SessionState,
    targetTask: Task,
    tokenBudget: number = 2000,
  ): Record<string, any> {
    if (!state || !targetTask) {
      throw new ContextProcessingError("Invalid input for ContextSelector.select", {
        hasState: !!state,
        hasTask: !!targetTask
      });
    }

    try {
      const selected: Record<string, any> = {};

      // 1. 필수 의존성 결과 선택 (Depends On)
      const dependencyResults = this.getDependencyResults(state, targetTask);
      Object.assign(selected, dependencyResults);

      // 2. 최근 문맥 보완 (Recency)
      const recentResults = this.getRecentRelevantResults(
        state,
        targetTask,
        selected,
      );
      Object.assign(selected, recentResults);

      return this.applyTokenOptimization(selected, tokenBudget);
    } catch (error: any) {
      if (error instanceof ContextProcessingError) throw error;
      throw new ContextProcessingError(`Failed to select context for task [${targetTask.id}]`, {
        taskId: targetTask.id,
        originalError: error.message
      });
    }
  }

  /**
   * 현재 Task가 명시적으로 의존하는 작업의 결과물을 가져옴
   */
  private static getDependencyResults(
    state: SessionState,
    targetTask: Task,
  ): Record<string, any> {
    const results: Record<string, any> = {};
    const taskResults = state.task_results || {};

    if (!targetTask.depends_on) return results;

    for (const depId of targetTask.depends_on) {
      if (taskResults[depId]) {
        results[depId] = taskResults[depId];
      } else {
        // 의존하는 Task의 결과가 없는 경우 경고 로깅 (Strict 모드라면 throw 고려 가능)
        logger.warn(`Dependency result missing for task [${targetTask.id}]: depends_on [${depId}] not found in results.`);
      }
    }

    return results;
  }

  /**
   * 의존성 외에도 최근 작업 흐름 유지를 위해 필요한 결과물들을 선택
   */
  private static getRecentRelevantResults(
    state: SessionState,
    targetTask: Task,
    alreadySelected: Record<string, any>,
  ): Record<string, any> {
    const recent: Record<string, any> = {};
    const MAX_RECENT = 2; 
    const completedTaskIds = state.completed_task_ids || [];
    const taskResults = state.task_results || {};

    // 완료된 작업 목록 중 마지막 n개를 확인
    const lastCompletedIds = completedTaskIds.slice(-MAX_RECENT);

    for (const id of lastCompletedIds) {
      if (!alreadySelected[id] && taskResults[id]) {
        recent[id] = taskResults[id];
      }
    }

    return recent;
  }

  /**
   * 선택된 정보가 너무 많을 경우, 요약본 위주로 압축하거나 우선순위가 낮은 정보를 제거
   */
  private static applyTokenOptimization(
    selected: Record<string, any>,
    budget: number,
  ): Record<string, any> {
    const optimized: Record<string, any> = {};

    for (const [id, result] of Object.entries(selected)) {
      if (!result) continue;
      
      const res = result as any;

      // Minimal Information 규칙: 무조건 요약본(summary/structured_output)을 우선 사용
      if (res.structured_output) {
        optimized[id] = { summary: res.summary, ...res.structured_output };
      } else {
        optimized[id] = { summary: res.summary || "Summary not available" };
      }
    }

    return optimized;
  }
}
