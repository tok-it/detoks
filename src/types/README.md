# Type Definitions

Core type definitions for DeToks state management and context handling.

## TaskType

`TaskType`은 이제 `src/schemas/pipeline.ts`의 공용 `RequestCategorySchema`를 재사용합니다.

즉, 상태 관리 계층의 작업 타입과 파이프라인 계층의 요청/작업 분류가 같은 기준을 공유합니다.

| Type | 의미 | 설명 | 예시 |
|------|------|------|------|
| **explore** | 탐색 | 정보 수집, 구조 파악, 문맥 이해 | 파일 구조 파악, API 문서 읽기 |
| **create** | 생성 | 새로운 코드/문서 작성, 기능 구현 | 함수 구현, 모듈 생성 |
| **modify** | 수정 | 기존 코드 변경, 버그 수정, 리팩토링 | 버그 패치, 함수 개선 |
| **analyze** | 분석 | 코드 분석, 원인 파악, 성능 검사 | 에러 원인 분석, 성능 프로파일링 |
| **validate** | 검증 | 코드 검증, 테스트, 품질 확인 | 단위 테스트, 타입 검증 |
| **execute** | 실행 | 명령 실행, 스크립트 실행, 배포 | npm run build, docker up |
| **document** | 정리/문서화 | 코드 문서화, 설명 작성, 주석 추가 | README 작성, docstring 추가 |
| **plan** | 계획/오케스트레이션 | 작업 계획, 스텝 구성, 워크플로우 관리 | 멀티스텝 작업 구성, 의존성 정의 |

## Shared Source of Truth

- `src/schemas/pipeline.ts`
  - `RequestCategorySchema`
  - `RequestCategory`
- `src/types/state.ts`
  - `TaskType = RequestCategory`
  - `TaskTypeSchema = RequestCategorySchema`

이 구조를 통해 문자열 상수 중복을 줄이고, 요청 분석 / 작업 그래프 / 상태 저장이 동일한 상위 분류 체계를 사용하도록 맞춥니다.

## Files

- `state.ts`: SessionState, Task, Checkpoint 타입 정의
- `context.ts`: SharedContext, TaskContext, CompressedState 타입 정의

## Usage

```typescript
import { TaskType, TaskSchema, SessionStateSchema } from './types';

const task: Task = {
  id: 'task-001',
  type: 'create',
  status: 'completed',
  inputHash: 'hash123',
  dependsOn: []
};

// Zod를 사용한 런타임 검증
const validated = TaskSchema.parse(task);
```

## Notes

- 새로운 상위 분류를 추가할 때는 `state.ts`가 아니라 `pipeline.ts`의 `RequestCategorySchema`를 먼저 수정해야 합니다.
- `state.ts`는 상태 계층에서 그 공용 분류를 재사용하는 위치입니다.
