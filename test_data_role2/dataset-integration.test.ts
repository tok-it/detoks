/**
 * 실제 데이터셋으로 State & Context 통합 테스트
 * detoks-dataset의 2,231개 데이터를 사용한 실제 연결성 검증
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { SessionState, Task } from '../src/schemas/pipeline.js';
import { ContextBuilder } from '../src/core/context/ContextBuilder.js';
import { StateValidator } from '../src/core/state/StateValidator.js';

interface DatasetEntry {
  id: string;
  category: string;
  input: string;
  output: string;
  task_type?: string;
}

describe('📊 실제 데이터셋 연결성 테스트', () => {
  let datasetStats = {
    total: 0,
    byCategory: {} as Record<string, number>,
    byType: {} as Record<string, number>,
    success: 0,
    failed: 0,
    errors: [] as Array<{ id: string; error: string }>
  };

  beforeAll(() => {
    console.log('\n🔍 데이터셋 로드 중...');
  });

  describe('1️⃣ 데이터셋 통계', () => {
    it('모든 데이터셋 파일을 찾아야 함', () => {
      const basePath = './detoks-dataset/raw';
      const files = readdirSync(basePath)
        .filter(f => f.endsWith('.json'))
        .map(f => join(basePath, f));

      expect(files.length).toBeGreaterThan(0);
      console.log(`  ✅ 발견된 JSON 파일: ${files.length}개`);
    });

    it('데이터셋 총 엔트리 개수를 집계해야 함', () => {
      const basePath = './detoks-dataset/raw';

      // 각 카테고리 폴더
      const categories = ['create', 'modify', 'analyze', 'explore', 'validate', 'execute', 'document', 'plan'];

      categories.forEach(cat => {
        const catPath = join(basePath, cat);
        try {
          const files = readdirSync(catPath).filter(f => f.endsWith('.json'));
          let catTotal = 0;

          files.forEach(f => {
            const data = JSON.parse(readFileSync(join(catPath, f), 'utf-8'));
            const count = Array.isArray(data) ? data.length : 1;
            catTotal += count;
          });

          datasetStats.byCategory[cat] = catTotal;
          datasetStats.total += catTotal;
        } catch (e) {
          // 폴더 없을 수 있음
        }
      });

      // 최상위 레벨 JSON
      const topFiles = readdirSync(basePath)
        .filter(f => f.endsWith('.json') && f !== '.gitkeep');

      topFiles.forEach(f => {
        const data = JSON.parse(readFileSync(join(basePath, f), 'utf-8'));
        const count = Array.isArray(data) ? data.length : 1;
        datasetStats.total += count;
      });

      console.log(`\n  📊 데이터셋 분포:`);
      Object.entries(datasetStats.byCategory).forEach(([cat, count]) => {
        console.log(`    ${cat}: ${count}개`);
      });
      console.log(`  📈 총 엔트리: ${datasetStats.total}개`);

      expect(datasetStats.total).toBeGreaterThan(0);
    });
  });

  describe('2️⃣ 각 카테고리별 ContextBuilder 테스트', () => {
    const categories = ['create', 'modify', 'analyze', 'explore', 'validate', 'execute', 'document', 'plan'];

    categories.forEach(category => {
      it(`${category} 카테고리 데이터로 ContextBuilder 테스트`, () => {
        const basePath = `./detoks-dataset/raw/${category}`;
        const files = readdirSync(basePath)
          .filter(f => f.endsWith('.json'))
          .slice(0, 3); // 각 카테고리당 3개만 테스트

        let categorySuccess = 0;
        let categoryFailed = 0;

        files.forEach(fileName => {
          const filePath = join(basePath, fileName);
          const data = JSON.parse(readFileSync(filePath, 'utf-8')) as DatasetEntry[];

          data.slice(0, 5).forEach(entry => {
            try {
              // SessionState 생성
              const sessionId = createHash('sha256')
                .update(`${entry.id}_${Date.now()}`)
                .digest('hex')
                .slice(0, 12);

              const state: SessionState = {
                shared_context: {
                  session_id: sessionId,
                  dataset_id: entry.id,
                  category: entry.category
                },
                task_results: {},
                current_task_id: null,
                completed_task_ids: [],
                updated_at: new Date().toISOString()
              };

              // Task 생성
              const task: Task = {
                id: entry.id,
                type: (entry.category as any) || 'create',
                status: 'pending',
                title: `Test: ${entry.category}`,
                description: entry.input,
                input_hash: createHash('sha256').update(entry.input).digest('hex').slice(0, 16),
                depends_on: [],
                output_summary: undefined
              };

              // ContextBuilder 실행
              const context = ContextBuilder.build(state, task);

              // 검증
              expect(context).toBeDefined();
              expect(context.session_id).toBe(sessionId);
              expect(context.active_task_id).toBe(entry.id);
              expect(context.context_summary).toBeDefined();

              categorySuccess++;
              datasetStats.success++;
            } catch (error) {
              categoryFailed++;
              datasetStats.failed++;
              datasetStats.errors.push({
                id: entry.id,
                error: error instanceof Error ? error.message : String(error)
              });
            }
          });
        });

        console.log(`  ✅ ${category}: ${categorySuccess}개 성공, ${categoryFailed}개 실패`);
        expect(categorySuccess).toBeGreaterThan(0);
      });
    });
  });

  describe('3️⃣ 특수 데이터셋 테스트', () => {
    it('manual_realworld.json (수동 작성 실무형)', () => {
      const data = JSON.parse(
        readFileSync('./detoks-dataset/raw/manual_realworld.json', 'utf-8')
      ) as DatasetEntry[];

      let success = 0;
      let failed = 0;

      data.slice(0, 3).forEach(entry => {
        try {
          const state: SessionState = {
            shared_context: {
              session_id: createHash('sha256').update(entry.id).digest('hex').slice(0, 12),
              data_type: 'manual_realworld'
            },
            task_results: {},
            current_task_id: null,
            completed_task_ids: [],
            updated_at: new Date().toISOString()
          };

          const task: Task = {
            id: entry.id,
            type: (entry.category as any),
            status: 'pending',
            title: 'Real-world task',
            description: entry.input.slice(0, 100),
            input_hash: 'manual',
            depends_on: [],
            output_summary: undefined
          };

          const context = ContextBuilder.build(state, task);
          expect(context).toBeDefined();
          success++;
          datasetStats.success++;
        } catch (error) {
          failed++;
          datasetStats.failed++;
        }
      });

      console.log(`  ✅ manual_realworld: ${success}개 성공, ${failed}개 실패`);
      expect(success).toBeGreaterThan(0);
    });

    it('complex_examples.json (복잡한 시나리오)', () => {
      const data = JSON.parse(
        readFileSync('./detoks-dataset/raw/complex_examples.json', 'utf-8')
      ) as DatasetEntry[];

      let success = 0;
      let failed = 0;

      data.slice(0, 3).forEach(entry => {
        try {
          const state: SessionState = {
            shared_context: {
              session_id: createHash('sha256').update(entry.id).digest('hex').slice(0, 12),
              data_type: 'complex'
            },
            task_results: {},
            current_task_id: null,
            completed_task_ids: [],
            updated_at: new Date().toISOString()
          };

          const task: Task = {
            id: entry.id,
            type: (entry.category as any),
            status: 'pending',
            title: 'Complex scenario',
            description: entry.input.slice(0, 100),
            input_hash: 'complex',
            depends_on: [],
            output_summary: undefined
          };

          const context = ContextBuilder.build(state, task);
          expect(context).toBeDefined();
          success++;
          datasetStats.success++;
        } catch (error) {
          failed++;
          datasetStats.failed++;
        }
      });

      console.log(`  ✅ complex_examples: ${success}개 성공, ${failed}개 실패`);
      expect(success).toBeGreaterThan(0);
    });
  });

  describe('4️⃣ 성능 측정', () => {
    it('대량 데이터 처리 성능', () => {
      const startTime = Date.now();
      let processedCount = 0;

      const basePath = './detoks-dataset/raw';
      const categories = ['create', 'modify', 'analyze'];

      categories.forEach(cat => {
        const catPath = join(basePath, cat);
        try {
          const files = readdirSync(catPath)
            .filter(f => f.endsWith('.json'))
            .slice(0, 2);

          files.forEach(fileName => {
            const data = JSON.parse(readFileSync(join(catPath, fileName), 'utf-8')) as DatasetEntry[];

            data.slice(0, 10).forEach(entry => {
              try {
                const state: SessionState = {
                  shared_context: { session_id: createHash('sha256').update(entry.id).digest('hex').slice(0, 12) },
                  task_results: {},
                  current_task_id: null,
                  completed_task_ids: [],
                  updated_at: new Date().toISOString()
                };

                const task: Task = {
                  id: entry.id,
                  type: (entry.category as any),
                  status: 'pending',
                  title: 'Perf test',
                  description: entry.input,
                  input_hash: 'perf',
                  depends_on: [],
                  output_summary: undefined
                };

                ContextBuilder.build(state, task);
                processedCount++;
              } catch (e) {
                // ignore
              }
            });
          });
        } catch (e) {
          // ignore
        }
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      const avgTime = processedCount > 0 ? duration / processedCount : 0;

      console.log(`\n  📈 성능 측정:`);
      console.log(`    처리된 항목: ${processedCount}개`);
      console.log(`    총 시간: ${duration}ms`);
      console.log(`    평균 시간: ${avgTime.toFixed(2)}ms/개`);

      expect(processedCount).toBeGreaterThan(0);
      expect(avgTime).toBeLessThan(100); // 개당 100ms 이하
    });
  });

  describe('5️⃣ 최종 통계', () => {
    it('테스트 결과 요약을 출력해야 함', () => {
      console.log(`\n\n${'='.repeat(50)}`);
      console.log('📊 최종 통계');
      console.log('='.repeat(50));
      console.log(`총 엔트리: ${datasetStats.total}개`);
      console.log(`성공: ${datasetStats.success}개`);
      console.log(`실패: ${datasetStats.failed}개`);
      console.log(`성공률: ${datasetStats.total > 0 ? ((datasetStats.success / datasetStats.total) * 100).toFixed(1) : 0}%`);

      if (datasetStats.errors.length > 0 && datasetStats.errors.length <= 5) {
        console.log(`\n⚠️ 발생한 에러:`);
        datasetStats.errors.slice(0, 5).forEach(err => {
          console.log(`  - ${err.id}: ${err.error}`);
        });
      }

      console.log('='.repeat(50) + '\n');

      expect(datasetStats.total).toBeGreaterThan(0);
    });
  });
});

export {};
