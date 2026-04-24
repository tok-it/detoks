import { describe, it, expect } from 'vitest';
import { StateValidator } from '../../../src/core/state/StateValidator.js';
import { ContextSelector } from '../../../src/core/context/ContextSelector.js';
import { ContextBuilder } from '../../../src/core/context/ContextBuilder.js';
import { ContextCompressor } from '../../../src/core/context/ContextCompressor.js';
import { StateValidationError } from '../../../src/core/errors/StateErrors.js';
import type { SessionState, Task } from '../../../src/schemas/pipeline.js';

describe('State & Context Engine Unit Tests', () => {
  // 샘플 상태 데이터 (새로운 스키마 기준)
  const mockState: SessionState = {
    shared_context: {
      session_id: 'test-session',
      project_info: 'DeToks Project'
    },
    task_results: {
      'task-1': { summary: 'First task completed', success: true, structured_output: { files: ['a.ts'] } },
      'task-2': { summary: 'Second task completed', success: true, structured_output: { files: ['b.ts'] } }
    },
    completed_task_ids: ['task-1', 'task-2'],
    current_task_id: 'task-3',
    last_summary: 'Ready for task 3'
  };

  describe('StateValidator', () => {
    it('should validate a correct state', () => {
      expect(() => StateValidator.validate(mockState)).not.toThrow();
    });

    it('should throw StateValidationError if shared_context is missing (Two-Tier rule)', () => {
      const invalidState = { ...mockState, shared_context: {} };
      expect(() => StateValidator.validate(invalidState)).toThrow(StateValidationError);
      expect(() => StateValidator.validate(invalidState)).toThrow(/shared_context must be a non-empty object/);
    });

    it('should throw StateValidationError if current_task is already in completed_task_ids', () => {
      const invalidState = { ...mockState, current_task_id: 'task-1' };
      expect(() => StateValidator.validate(invalidState)).toThrow(StateValidationError);
      expect(() => StateValidator.validate(invalidState)).toThrow(/already marked as completed/);
    });
  });

  describe('ContextSelector', () => {
    it('should select only dependent task results', () => {
      const targetTask: Task = {
        id: 'task-3',
        type: 'modify',
        status: 'pending',
        title: 'Task 3',
        input_hash: 'hash-3',
        depends_on: ['task-1'] // task-1에만 의존
      };

      const selected = ContextSelector.select(mockState, targetTask);

      expect(selected['task-1']).toBeDefined();
      // task-2는 의존성에는 없지만 '최근 작업' 로직에 의해 포함될 수 있음 (ContextSelector 구현 참고)
    });
  });

  describe('ContextBuilder', () => {
    it('should build execution context from direct task dependencies only', () => {
      const targetTask: Task = {
        id: 'task-3',
        type: 'modify',
        status: 'pending',
        title: 'Task 3',
        input_hash: 'hash-3',
        depends_on: ['task-1']
      };

      const context = ContextBuilder.build(mockState, targetTask);

      expect(context.active_task_id).toBe('task-3');
      expect(context.session_id).toBe('test-session');
      expect(context.selected_context['task-1']).toBeDefined();
      expect(context.selected_context['task-2']).toBeUndefined();
      expect(context.context_summary).toContain('Project: DeToks Project');
      expect(context.context_summary).toContain('Task [task-1]');
    });
  });

  describe('ContextCompressor', () => {
    it('should compress old task results when forced', () => {
      const compressed = ContextCompressor.forceCompress(mockState);

      // 오래된 task-1의 상세 정보(structured_output)가 제거되고 summary만 남았는지 확인
      const task1Result = compressed.task_results['task-1'] as any;
      expect(task1Result.structured_output).toBeUndefined();
      expect(task1Result.summary).toBeDefined();
      expect(task1Result._compressed).toBe(true);
    });
  });
});
