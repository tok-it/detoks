import { ZodError } from 'zod';
import { SessionStateSchema } from '../../schemas/pipeline.js';
import type { SessionState } from '../../schemas/pipeline.js';
import { StateValidationError } from '../errors/StateErrors.js';

/**
 * StateValidator
 * DeToks의 상태(SessionState) 무결성을 검증하는 클래스입니다.
 * .gemini/skill.md의 규칙을 강제합니다.
 */
export class StateValidator {
  /**
   * 상태의 구조와 비즈니스 로직 무결성을 통합 검증합니다.
   */
  static validate(state: unknown): SessionState {
    let validated: SessionState;
    
    // 1. Zod 스키마 기본 검증 (구조 및 타입)
    try {
      validated = SessionStateSchema.parse(state);
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        throw new StateValidationError('Session state schema validation failed', {
          zodErrors: error.issues,
          receivedState: state
        });
      }
      throw new StateValidationError('Session state schema validation failed (unexpected error)', {
        originalError: error instanceof Error ? error.message : String(error)
      });
    }

    // 2. 비즈니스 로직 무결성 검증
    this.validateBusinessRules(validated);

    // 3. 직렬화 가능 여부 검증 (JSON 안전성)
    this.validateSerializable(validated);

    return validated;
  }

  /**
   * 상세 비즈니스 규칙 검증
   */
  private static validateBusinessRules(state: SessionState): void {
    // 규칙 1: current_task_id가 있을 경우, completed_task_ids에 포함되어 있지 않아야 함 (진행 중인 작업)
    if (state.current_task_id && state.completed_task_ids.includes(state.current_task_id)) {
      throw new StateValidationError(`Invalid State: current_task_id [${state.current_task_id}] is already marked as completed.`, {
        current_task_id: state.current_task_id,
        completed_task_ids: state.completed_task_ids
      });
    }

    // 규칙 2: Two-Tier 구조 확인 (shared_context가 비어있지 않은 유효한 객체여야 함)
    if (!state.shared_context || typeof state.shared_context !== 'object' || Object.keys(state.shared_context).length === 0) {
      throw new StateValidationError('Invalid State: shared_context must be a non-empty object (Two-Tier structure requirement).');
    }

    // 규칙 3: Task 결과 일관성 확인
    for (const taskId of state.completed_task_ids) {
      if (!state.task_results[taskId]) {
        throw new StateValidationError(`Invalid State: Task [${taskId}] is completed but has no result in task_results.`, {
          taskId,
          availableResults: Object.keys(state.task_results)
        });
      }
    }
  }

  /**
   * JSON 직렬화 가능 여부 및 순환 참조 확인
   */
  private static validateSerializable(state: unknown): void {
    try {
      const serialized = JSON.stringify(state);
      JSON.parse(serialized);
    } catch (error: unknown) {
      throw new StateValidationError(`Invalid State: State is not serializable or contains circular references.`, {
        originalError: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * 특정 Task 결과가 '요약본(Summary)'을 포함하고 있는지 확인 (Minimal Information 규칙)
   */
  static hasSummary(result: any): boolean {
    return !!(result && (result.summary || result.context_summary));
  }
}
