import type { SessionState, ExecutionContext, Task } from '../../schemas/pipeline.js';
import { ContextProcessingError } from '../errors/StateErrors.js';

/**
 * ContextBuilder
 * 세션 상태에서 다음 작업을 위한 최적의 컨텍스트를 구성합니다.
 * .gemini/skill.md의 'Two-Tier Context Structure' 규칙을 따릅니다.
 */
export class ContextBuilder {
  /**
   * 특정 Task를 위한 실행 컨텍스트(ExecutionContext)를 구축합니다.
   */
  static build(state: SessionState, targetTaskId: string): ExecutionContext {
    if (!state || !targetTaskId) {
      throw new ContextProcessingError('Invalid input for ContextBuilder.build', {
        hasState: !!state,
        targetTaskId
      });
    }

    try {
      // 1. 의존성 기반 작업 결과 필터링
      const selectedResults = this.selectRelevantResults(state, targetTaskId);

      // 2. 컨텍스트 요약 생성 (LLM 전달용)
      const summary = this.generateContextSummary(state.shared_context, selectedResults);

      // 3. ExecutionContext 구성
      return {
        session_id: (state.shared_context?.session_id as string) || 'default',
        active_task_id: targetTaskId,
        shared_context: state.shared_context || {},
        selected_context: selectedResults,
        context_summary: summary
      };
    } catch (error: any) {
      if (error instanceof ContextProcessingError) throw error;
      throw new ContextProcessingError(`Failed to build context for task [${targetTaskId}]`, {
        targetTaskId,
        originalError: error.message
      });
    }
  }

  /**
   * 현재 Task와 관련 있는 이전 작업 결과들만 선택합니다.
   * (의존성 그래프 기반 필터링의 기초 단계)
   */
  private static selectRelevantResults(state: SessionState, targetTaskId: string): Record<string, any> {
    const selected: Record<string, any> = {};
    
    // state.task_results가 없을 경우 대비
    if (!state.task_results) return selected;

    // 현재는 단순화를 위해 모든 완료된 작업의 'summary'만 포함시킴 (Minimal Information 규칙)
    for (const [taskId, result] of Object.entries(state.task_results)) {
      if (state.completed_task_ids?.includes(taskId)) {
        // 원본(raw_output) 대신 구조화된 결과나 요약본만 선택적으로 가져옴
        const res = result as any;
        selected[taskId] = res.structured_output || { summary: res.summary || 'No summary available' };
      }
    }

    return selected;
  }

  /**
   * 선택된 데이터들을 자연어 요약 형태로 변환하여 LLM의 이해를 돕습니다.
   */
  private static generateContextSummary(shared: any, selected: Record<string, any>): string {
    const parts: string[] = [];

    // 프로젝트 정보 추가
    if (shared?.project_info) {
      parts.push(`Project: ${shared.project_info}`);
    }

    // 이전 작업들의 요약 정보 결합
    const taskSummaries = Object.entries(selected)
      .map(([id, res]) => `- Task [${id}]: ${res.summary || (typeof res === 'string' ? res : JSON.stringify(res))}`)
      .join('\n');

    if (taskSummaries) {
      parts.push(`Previous Task Results:\n${taskSummaries}`);
    } else {
      parts.push('No previous task context available.');
    }

    return parts.join('\n\n');
  }
}
