/**
 * LLM에 전달될 컨텍스트의 구조를 정의합니다.
 */

// 모든 태스크가 공유하는 공통 맥락
export interface SharedContext {
  projectInfo: string;      // 프로젝트 개요 및 목표
  conventions: string[];    // 코딩 컨벤션 및 규칙
  activeRules: string[];    // 현재 활성화된 지침
}

// 개별 태스크 수행을 위한 구체적 맥락
export interface TaskContext {
  currentTaskId: string;
  relevantState: string;    // 현재 태스크와 관련된 압축된 상태 정보
  history: string[];        // 이전 태스크들의 핵심 수행 결과 (요약본)
}

// 최종적으로 LLM에 전달되는 최적화된 컨텍스트
export interface OptimizedContext {
  shared: SharedContext;
  task: TaskContext;
  tokenUsageEstimate: number; // 예상 토큰 사용량
}
