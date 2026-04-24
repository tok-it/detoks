/**
 * StateError
 * State & Context Engine에서 발생하는 모든 에러의 기본 클래스입니다.
 */
export class StateError extends Error {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * StateValidationError
 * 세션 상태 검증 실패 시 발생합니다 (Zod 파싱 오류 또는 비즈니스 규칙 위반).
 */
export class StateValidationError extends StateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * StateIOError
 * 파일 시스템 I/O 작업(저장, 로드, 디렉토리 생성 등) 실패 시 발생합니다.
 */
export class StateIOError extends StateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * ContextProcessingError
 * 컨텍스트 구성, 선별, 압축 중 논리적 오류나 데이터 누락 발생 시 발생합니다.
 */
export class ContextProcessingError extends StateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}
