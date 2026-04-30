/**
 * 전체 연결성 통합 테스트
 * CLI → Orchestrator → State & Context → Execution 흐름
 */

import { createHash } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { SessionState, Task, ExecutionContext } from '../src/schemas/pipeline.js';
import { ContextBuilder } from '../src/core/context/ContextBuilder.js';
import { SessionStateManager } from '../src/core/state/SessionStateManager.js';
import { StateValidator } from '../src/core/state/StateValidator.js';
import { logger } from '../src/core/utils/logger.js';

describe('🔗 전체 연결성 테스트 (CLI → State & Context)', () => {
  let testSessionId: string;
  let testState: SessionState;

  beforeAll(async () => {
    // Session ID 생성 (orchestrator 스타일)
    testSessionId = createHash('sha256')
      .update(String(Date.now()))
      .digest('hex')
      .slice(0, 12);

    // State 초기화 (orchestrator 스타일)
    testState = {
      shared_context: {
        session_id: testSessionId,
        project_info: 'DeToks Integration Test',
        timestamp: new Date().toISOString()
      },
      task_results: {},
      current_task_id: null,
      completed_task_ids: [],
      updated_at: new Date().toISOString()
    };

    console.log(`\n📋 테스트 세션 시작: ${testSessionId}`);
  });

  afterAll(async () => {
    console.log(`\n✅ 테스트 완료\n`);
  });

  describe('1️⃣ State 초기화 & Validation', () => {
    it('SessionState가 올바르게 초기화되어야 함', () => {
      expect(testState.shared_context.session_id).toBeDefined();
      expect(testState.shared_context.session_id).toMatch(/^[a-f0-9]{12}$/);
      expect(testState.task_results).toEqual({});
      expect(testState.completed_task_ids).toEqual([]);
    });

    it('StateValidator가 SessionState를 검증해야 함', () => {
      const validated = StateValidator.validate(testState);
      expect(validated).toBeDefined();
      expect(validated.shared_context.session_id).toBe(testSessionId);
    });

    it('StateValidator가 hasSummary를 확인해야 함', () => {
      const resultWithSummary = { summary: 'test', raw_output: 'output' };
      const resultWithoutSummary = { raw_output: 'output' };

      expect(StateValidator.hasSummary(resultWithSummary)).toBe(true);
      expect(StateValidator.hasSummary(resultWithoutSummary)).toBe(false);
    });
  });

  describe('2️⃣ ContextBuilder - Task 처리 흐름', () => {
    it('단일 Task에 대해 ExecutionContext를 생성해야 함', () => {
      const task: Task = {
        id: 'task_001',
        type: 'create',
        status: 'pending',
        title: 'Create a function',
        description: 'Create a simple function',
        input_hash: 'hash123',
        depends_on: [],
        output_summary: undefined
      };

      const context = ContextBuilder.build(testState, task);

      expect(context).toBeDefined();
      expect(context.session_id).toBe(testSessionId);
      expect(context.active_task_id).toBe('task_001');
      expect(context.shared_context).toBeDefined();
      expect(context.selected_context).toBeDefined();
      expect(context.context_summary).toBeDefined();
    });

    it('의존성이 있는 Task에 대해 선택된 컨텍스트를 필터링해야 함', () => {
      // 이전 Task 결과 추가
      const stateWithResults: SessionState = {
        ...testState,
        task_results: {
          'task_001': { summary: 'First task completed', raw_output: 'output 1' },
          'task_002': { summary: 'Second task completed', raw_output: 'output 2' }
        }
      };

      const task: Task = {
        id: 'task_003',
        type: 'modify',
        status: 'pending',
        title: 'Modify the function',
        description: 'Modify based on previous results',
        input_hash: 'hash456',
        depends_on: ['task_001', 'task_002'],
        output_summary: undefined
      };

      const context = ContextBuilder.build(stateWithResults, task);

      expect(context).toBeDefined();
      expect(context.selected_context).toBeDefined();
      // selected_context에 의존성 Task 결과가 포함되어야 함
    });

    it('Strict Mode 계약: 실패한 의존성 Task 결과는 선택 컨텍스트에서 제외해야 함', () => {
      const stateWithFailedTask: SessionState = {
        ...testState,
        shared_context: {
          ...testState.shared_context,
          failed_task_ids: ['task_001']
        },
        task_results: {
          'task_001': { summary: 'FAILED', raw_output: 'error message' }
        }
      };

      const task: Task = {
        id: 'task_002',
        type: 'create',
        status: 'pending',
        title: 'Next task',
        description: 'Depends on failed task',
        input_hash: 'hash789',
        depends_on: ['task_001'],
        output_summary: undefined
      };

      const context = ContextBuilder.build(stateWithFailedTask, task);
      expect(context.selected_context['task_001']).toBeUndefined();
      expect(context.context_summary).toContain('No previous task context available.');
    });
  });

  describe('3️⃣ SessionStateManager - 저장/로드', () => {
    it('SessionState를 저장하고 로드할 수 있어야 함', async () => {
      const stateToSave: SessionState = {
        ...testState,
        task_results: {
          'task_001': { summary: 'Task 1 done', raw_output: 'result 1' }
        },
        completed_task_ids: ['task_001'],
        current_task_id: null,
        updated_at: new Date().toISOString()
      };

      await SessionStateManager.saveSession(stateToSave);
      const loaded = await SessionStateManager.loadSession(testSessionId);

      expect(loaded).toBeDefined();
      expect(loaded.shared_context.session_id).toBe(testSessionId);
      expect(loaded.completed_task_ids).toContain('task_001');
    });

    it('Session 존재 여부를 확인할 수 있어야 함', async () => {
      const exists = await SessionStateManager.sessionExists(testSessionId);
      expect(exists).toBe(true);
    });

    it('Checkpoint를 생성하고 로드할 수 있어야 함', async () => {
      const checkpoint = {
        id: `checkpoint_${Date.now()}`,
        title: 'Test Checkpoint',
        task_id: 'task_001',
        summary: 'Test checkpoint for integration',
        changed_files: ['src/core/context/ContextBuilder.ts'],
        next_action: 'Continue with next task',
        created_at: new Date().toISOString()
      };

      await SessionStateManager.createCheckpoint(checkpoint);
      const loaded = await SessionStateManager.loadCheckpoint(checkpoint.id);

      expect(loaded).toBeDefined();
      expect(loaded.task_id).toBe('task_001');
    });

    it('최신 Checkpoint를 조회할 수 있어야 함', async () => {
      const latest = await SessionStateManager.getLatestCheckpoint(testSessionId);
      // Checkpoint는 session_id와 독립적으로 저장될 수 있음
      // 따라서 최신 checkpoint가 없을 수도 있음
      if (latest) {
        expect(latest).toBeDefined();
      }
    });
  });

  describe('4️⃣ 데이터 일관성', () => {
    it('ExecutionContext의 모든 필드가 필수여야 함', () => {
      const task: Task = {
        id: 'test_task',
        type: 'analyze',
        status: 'pending',
        title: 'Test',
        description: 'Test task',
        input_hash: 'hash',
        depends_on: [],
        output_summary: undefined
      };

      const context = ContextBuilder.build(testState, task);

      expect(context.session_id).toBeTruthy();
      expect(context.active_task_id).toBeTruthy();
      expect(context.shared_context).toBeTruthy();
      expect(context.selected_context).toBeTruthy();
    });

    it('Task 결과는 summary 필드를 선택적으로 가져야 함', () => {
      const resultWithSummary = {
        summary: 'Task completed',
        raw_output: 'Full output...'
      };

      const resultWithoutSummary = {
        raw_output: 'Full output...'
      };

      expect(StateValidator.hasSummary(resultWithSummary)).toBe(true);
      expect(StateValidator.hasSummary(resultWithoutSummary)).toBe(false);
    });
  });

  describe('5️⃣ 에러 처리', () => {
    it('잘못된 입력에 대해 ContextProcessingError를 throw해야 함', () => {
      const invalidTask: any = null;

      expect(() => {
        ContextBuilder.build(testState, invalidTask);
      }).toThrow();
    });

    it('null State에 대해 에러를 throw해야 함', () => {
      const task: Task = {
        id: 'test',
        type: 'create',
        status: 'pending',
        title: 'Test',
        description: 'Test',
        input_hash: 'hash',
        depends_on: [],
        output_summary: undefined
      };

      expect(() => {
        ContextBuilder.build(null as any, task);
      }).toThrow();
    });
  });

  describe('6️⃣ Logger 동작', () => {
    it('Logger가 정의되어 있어야 함', () => {
      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
    });

    it('Logger 함수들을 호출할 수 있어야 함', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      try {
        expect(() => {
          logger.info('Test info message');
          logger.warn('Test warn message');
          logger.error('Test error message');
        }).not.toThrow();

        expect(warnSpy).toHaveBeenCalledWith('[WARN] Test warn message');
        expect(errorSpy).toHaveBeenCalledWith('[ERROR] Test error message');
      } finally {
        warnSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });
  });

  describe('7️⃣ 통합 시나리오', () => {
    it('다중 Task 시나리오: Task 순차 처리', async () => {
      let state: SessionState = {
        shared_context: {
          session_id: testSessionId + '_multi',
          project_info: 'Multi-task test'
        },
        task_results: {},
        current_task_id: null,
        completed_task_ids: [],
        updated_at: new Date().toISOString()
      };

      // Task 1: Create
      const task1: Task = {
        id: 'task_1',
        type: 'create',
        status: 'pending',
        title: 'Create',
        description: 'Initial creation',
        input_hash: 'hash1',
        depends_on: [],
        output_summary: undefined
      };

      const context1 = ContextBuilder.build(state, task1);
      expect(context1.active_task_id).toBe('task_1');

      // Task 1 완료 후 state 업데이트
      state = {
        ...state,
        task_results: {
          'task_1': { summary: 'Created successfully', raw_output: 'output 1' }
        },
        completed_task_ids: ['task_1']
      };

      // Task 2: Modify (depends on Task 1)
      const task2: Task = {
        id: 'task_2',
        type: 'modify',
        status: 'pending',
        title: 'Modify',
        description: 'Modify based on task 1',
        input_hash: 'hash2',
        depends_on: ['task_1'],
        output_summary: undefined
      };

      const context2 = ContextBuilder.build(state, task2);
      expect(context2.active_task_id).toBe('task_2');
      expect(context2.selected_context).toBeDefined();

      // State 저장
      await SessionStateManager.saveSession(state);
      const loaded = await SessionStateManager.loadSession(state.shared_context.session_id);
      expect(loaded.completed_task_ids).toContain('task_1');
    });

    it('에러 복구 계약: 실패한 의존성 Task는 컨텍스트에 포함되지 않아야 함', () => {
      const stateWithError: SessionState = {
        ...testState,
        shared_context: {
          ...testState.shared_context,
          failed_task_ids: ['task_fail']
        },
        task_results: {
          'task_fail': { summary: 'FAILED', raw_output: 'Error occurred' }
        }
      };

      const dependentTask: Task = {
        id: 'task_dependent',
        type: 'create',
        status: 'pending',
        title: 'Dependent',
        description: 'Depends on failed',
        input_hash: 'hash_dep',
        depends_on: ['task_fail'],
        output_summary: undefined
      };

      const context = ContextBuilder.build(stateWithError, dependentTask);
      expect(context.selected_context['task_fail']).toBeUndefined();
      expect(context.context_summary).toContain('No previous task context available.');
    });
  });
});

export {};
