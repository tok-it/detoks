import type { ExecutionResult } from '../../schemas/pipeline.js';
import { ExecutionResultSchema } from '../../schemas/pipeline.js';
import { StateValidationError } from '../errors/StateErrors.js';

/**
 * ExecutionResultNormalizer
 * Role 3(CLI/Adapter)의 원시 출력물을 DeToks 표준 ExecutionResult로 변환합니다.
 * 타인의 코드를 수정하지 않고도 데이터 호환성을 확보하기 위한 정규화 레이어입니다.
 */
export class ExecutionResultNormalizer {
  /**
   * Role 3의 AdapterExecutionResult를 표준 ExecutionResult로 변환합니다.
   */
  static normalize(taskId: string, rawAdapterResult: any): ExecutionResult {
    try {
      const normalized: Partial<ExecutionResult> = {
        task_id: taskId,
        success: !!rawAdapterResult.success,
        raw_output: rawAdapterResult.rawOutput || rawAdapterResult.stdout || '',
        summary: rawAdapterResult.summary, // 이미 있으면 유지
        structured_output: rawAdapterResult.structured_output || {},
        next_action: rawAdapterResult.next_action,
        type: rawAdapterResult.type // Task type 저장 (optional)
      };

      // 0. Summary 자동 추출 (없을 경우)
      if (!normalized.summary) {
        if (normalized.raw_output) {
          // 첫 번째 줄 전체를 요약으로 활용 (token 기반 길이 제한, P2)
          const lines = normalized.raw_output.split('\n');
          const firstLine = lines[0]?.trim() || '';

          // Token 기반 동적 길이: 약 50 토큰 × 4 글자/토큰 = 200자
          const estimatedSummaryTokens = 50;
          const charsPerToken = 4;
          const maxChars = estimatedSummaryTokens * charsPerToken;

          normalized.summary = firstLine.length > maxChars
            ? firstLine.substring(0, maxChars - 3) + '...'
            : firstLine;
        } else {
          // raw_output가 없으면 상태 기반 기본 요약 제공
          normalized.summary = normalized.success ? 'Task completed successfully' : 'Task execution failed';
        }
      }

      // 1. 에러 정보 정규화 (exitCode나 stderr가 있을 경우)
      if (!normalized.success) {
        normalized.error = {
          code: `EXIT_${rawAdapterResult.exitCode || 'UNKNOWN'}`,
          message: rawAdapterResult.stderr || rawAdapterResult.message || 'Unknown execution error'
        };
      }

      // 2. 구조화된 데이터 추출 (Best Effort)
      const extracted = this.extractJsonFromRaw(normalized.raw_output!);
      if (extracted) {
        normalized.structured_output = { ...normalized.structured_output, ...extracted };
      }

      // 3. 변경된 파일 목록(changed_files) 추출
      const files = this.extractChangedFiles(normalized.raw_output!);
      if (files.length > 0) {
        normalized.structured_output = { 
          ...normalized.structured_output, 
          changed_files: Array.from(new Set([...(normalized.structured_output?.changed_files as string[] || []), ...files]))
        };
      }

      // 4. 최종 스키마 검증
      return ExecutionResultSchema.parse(normalized);
    } catch (error: any) {
      throw new StateValidationError(`Failed to normalize execution result for task [${taskId}]`, {
        taskId,
        originalError: error.message,
        receivedData: rawAdapterResult
      });
    }
  }

  private static extractJsonFromRaw(raw: string): Record<string, any> | null {
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      return null;
    }
    return null;
  }

  private static extractChangedFiles(raw: string): string[] {
    const files: string[] = [];
    const listMatch = raw.match(/Changed files:\s*\[(.*?)\]/i);
    if (listMatch?.[1]) {
      return listMatch[1].split(',').map(f => f.trim()).filter(Boolean);
    }
    const gitMatch = raw.matchAll(/modified:\s+([^\s\n]+)/g);
    for (const match of gitMatch) {
      if (match[1]) {
        files.push(match[1]);
      }
    }
    return files;
  }
}
