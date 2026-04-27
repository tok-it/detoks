import type { SessionState, ExecutionContext, Task, TaskResult } from '../../schemas/pipeline.js';
import { ContextCompressor } from './ContextCompressor.js';
import { ContextProcessingError } from '../errors/StateErrors.js';

/**
 * 회의록 기준 Role 2.2 컨텍스트 파이프라인:
 *   압축 (ContextCompressor) → 의존성 결과 선택 (ContextSelector) → ExecutionContext 생성
 */
export class ContextBuilder {
  static build(state: SessionState, task: Task): ExecutionContext {
    if (!state || !task) {
      throw new ContextProcessingError('Invalid input for ContextBuilder.build', {
        hasState: !!state,
        taskId: task?.id,
      });
    }

    try {
      // 1. 압축 — 토큰 임계 초과 시 오래된 task 결과를 summary로 축소
      const compressedState = ContextCompressor.compress(state);

      // 2. 의존성 결과 선택 — task.depends_on 기반으로 관련 결과만 선택
      const selectedContext = this.selectDependencyResults(compressedState, task);

      // 3. 요약 생성
      const summary = this.generateContextSummary(
        compressedState.shared_context,
        selectedContext,
      );

      return {
        session_id: (compressedState.shared_context?.session_id as string) || 'default',
        active_task_id: task.id,
        shared_context: compressedState.shared_context || {},
        selected_context: selectedContext,
        context_summary: summary,
      };
    } catch (error: any) {
      if (error instanceof ContextProcessingError) throw error;
      throw new ContextProcessingError(`Failed to build context for task [${task.id}]`, {
        taskId: task.id,
        originalError: error.message,
      });
    }
  }

  private static selectDependencyResults(
    state: SessionState,
    targetTask: Task,
  ): Record<string, unknown> {
    const selected: Record<string, unknown> = {};
    const taskResults = state.task_results || {};
    const dependencyIds =
      targetTask.depends_on.length > 0
        ? targetTask.depends_on
        : (state.completed_task_ids || [])
            .filter((taskId) => taskId !== targetTask.id)
            .slice(-3);

    for (const depId of dependencyIds) {
      if (!state.completed_task_ids.includes(depId)) {
        continue;
      }

      const result = taskResults[depId];
      if (!result) {
        continue;
      }

      selected[depId] = this.summarizeTaskResult(result);
    }

    return selected;
  }

  private static summarizeTaskResult(result: TaskResult): Record<string, unknown> {
    const summary = typeof result.summary === 'string' ? result.summary : 'Summary not available';
    if ('structured_output' in result && result.structured_output) {
      return { summary, ...result.structured_output };
    }
    return { summary };
  }

  private static generateContextSummary(
    shared: Record<string, unknown>,
    selected: Record<string, unknown>,
  ): string {
    const parts: string[] = [];

    const projectName = shared?.project_name || shared?.project_info;
    if (projectName) {
      parts.push(`Project: ${projectName}`);
    }

    const taskSummaries = Object.entries(selected)
      .map(([id, res]) => {
        const summary = typeof res === 'object' && res !== null && 'summary' in res
          ? String(res.summary)
          : typeof res === 'string'
            ? res
            : JSON.stringify(res);
        return `- Task [${id}]: ${summary}`;
      })
      .join('\n');

    parts.push(
      taskSummaries
        ? `Previous Task Results:\n${taskSummaries}`
        : 'No previous task context available.',
    );

    return parts.join('\n\n');
  }
}
