/**
 * 개별 작업(Task)의 상태를 정의합니다.
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TaskType = 'code_generation' | 'review' | 'test' | 'fix';

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  inputHash: string;      // 입력 중복 방지 및 캐싱용
  outputSummary?: string; // 토큰 절감을 위해 압축된 결과 요약
  dependsOn: string[];    // 의존성 태스크 ID 목록
}

/**
 * 세션 전체의 동적 상태(Dynamic State)를 정의합니다.
 */
export interface SessionState {
  sessionId: string;
  version: string;
  tasks: Task[];
  metadata: Record<string, any>; // 기타 확장 가능한 동적 데이터
  updatedAt: string;             // ISO 8601 형식
}
