import type { SessionState, Task } from '../../schemas/pipeline.js';

/**
 * ContextSelector
 * 세션 상태에서 현재 작업과 가장 관련성이 높은 정보만 선별합니다.
 * .gemini/skill.md의 'Maintain Minimal Information' 및 'Automatic Compression' 원칙을 실현합니다.
 */
export class ContextSelector {
  /**
   * 전체 세션 상태에서 대상 Task에 필요한 최적의 데이터 서브셋을 선택합니다.
   */
  static select(state: SessionState, targetTask: Task, tokenBudget: number = 2000): Record<string, any> {
    const selected: Record<string, any> = {};
    
    // 1. 필수 의존성 결과 선택 (Depends On)
    const dependencyResults = this.getDependencyResults(state, targetTask);
    Object.assign(selected, dependencyResults);

    // 2. 최근 문맥 보완 (Recency)
    // 의존성에는 없지만 직전에 수행된 작업들 중 중요한 정보를 추가로 선택합니다.
    const recentResults = this.getRecentRelevantResults(state, targetTask, selected);
    Object.assign(selected, recentResults);

    // 3. 중요 결정 사항 및 전역 규칙 반영 (Shared Context 내의 핵심 정보)
    // (이 부분은 ContextBuilder에서 처리하거나 여기서 필터링 가능)

    return this.applyTokenOptimization(selected, tokenBudget);
  }

  /**
   * 현재 Task가 명시적으로 의존하는 작업의 결과물을 가져옵니다.
   */
  private static getDependencyResults(state: SessionState, targetTask: Task): Record<string, any> {
    const results: Record<string, any> = {};
    
    for (const depId of targetTask.depends_on) {
      if (state.task_results[depId]) {
        results[depId] = state.task_results[depId];
      }
    }
    
    return results;
  }

  /**
   * 의존성 외에도 최근 작업 흐름 유지를 위해 필요한 결과물들을 선택합니다.
   */
  private static getRecentRelevantResults(
    state: SessionState, 
    targetTask: Task, 
    alreadySelected: Record<string, any>
  ): Record<string, any> {
    const recent: Record<string, any> = {};
    const MAX_RECENT = 2; // 최근 2개 작업까지만 추가 고려

    // 완료된 작업 목록 중 마지막 n개를 확인
    const lastCompletedIds = state.completed_task_ids.slice(-MAX_RECENT);

    for (const id of lastCompletedIds) {
      if (!alreadySelected[id] && state.task_results[id]) {
        recent[id] = state.task_results[id];
      }
    }

    return recent;
  }

  /**
   * 선택된 정보가 너무 많을 경우, 요약본 위주로 압축하거나 우선순위가 낮은 정보를 제거합니다.
   */
  private static applyTokenOptimization(selected: Record<string, any>, budget: number): Record<string, any> {
    const optimized: Record<string, any> = {};
    
    for (const [id, result] of Object.entries(selected)) {
      const res = result as any;
      
      // Minimal Information 규칙: 무조건 요약본(summary/structured_output)을 우선 사용
      if (res.structured_output) {
        optimized[id] = { summary: res.summary, ...res.structured_output };
      } else {
        optimized[id] = { summary: res.summary || 'Summary not available' };
      }
    }

    // TODO: 실제 토큰 계산기를 연동하여 budget 초과 시 더 공격적인 압축(summarization) 트리거 로직 추가 가능
    return optimized;
  }
}
