# Role 간 의존성 변경사항 정리 | 2026-04-28

**작성**: Role 2.2 (State & Context Engine)  
**날짜**: 2026-04-28  
**대상**: Role 1 (Prompt Engineer), Role 3 (CLI/System Engineer)

---

## 📋 개요

Session Persistence 개선으로 인한 스키마, API, 인터페이스 변경사항을 정리합니다.

---

## 🔄 Role 3 (CLI/System Engineer) - 필수 반영

### 1️⃣ Input 번역 로깅 통합 필수

**변경**: `SessionStateManager`에 새로운 메서드 추가됨

**새 API**:
```typescript
// 1. 번역 결과 기록 (각 Turn마다 호출)
await SessionStateManager.logInputTranslation(
  sessionId: string,
  koreanInput: string,
  englishTranslation: string
): Promise<void>

// 2. 현재 로그 읽기 (CLI 표시용)
const log = await SessionStateManager.readCurrentSessionLog(): Promise<string>

// 3. 로그 초기화 (세션 종료 시)
await SessionStateManager.clearCurrentSessionLog(): Promise<void>
```

**호출 위치**:
- REPL orchestrator에서 각 turn마다 `logInputTranslation()` 호출
- CLI 출력 시점에 `readCurrentSessionLog()`로 번역 내용 표시
- 세션 종료 시 `clearCurrentSessionLog()` 호출

**저장 위치**: `.state/current_session.log`

**로그 포맷**:
```
[2026-04-28T10:30:45.123Z] Session: repl-xyz
KO: 사용자의 한글 입력
EN: Translated English output
---
```

**우선도**: **높음** (사용자 가시성 직접 영향)

---

## 📊 Role 1 (Prompt Engineer) - 참고용

### 1️⃣ CompressedExecutionResultSchema 스키마 변경 (완료)

**변경 내용**:
```typescript
export const CompressedExecutionResultSchema = z.object({
  summary: z.string(),
  status: z.enum(["completed", "failed"]).optional(),
  success: z.boolean().optional(),        // ← 추가
  type: z.enum(RequestCategoryValues).optional(),  // ← 추가
  _compressed: z.literal(true),
}).passthrough();
```

**영향 범위**:
- 압축된 task 결과 검증 (기존: ExecutionResultSchema와 불일치)
- Session state 저장/로드 시 type 필드 보존
- 이미 적용됨 (pipeline.ts 라인 216-221)

**호환성**:
- ✅ 역하위 호환 (optional 필드 추가)
- ✅ 기존 압축 데이터도 파싱 가능
- ✅ 새 데이터는 더 많은 정보 포함

---

## 🔧 State & Context Engine 내부 변경

### 1️⃣ ContextCompressor - 상태 정규화 개선

**변경**:
```typescript
// 압축 시 type, success 필드도 보존
const compressedResult: any = {
  summary: result.summary,
  status: result.success ? 'completed' : 'failed',
  _compressed: true,
  type: result.type,      // ← 보존
  success: result.success  // ← 보존
};
```

**영향**:
- `compressTaskResults()` 함수 (라인 64-79)
- `forceCompress()` 함수 (라인 106-124)
- Session recovery 시 정확한 metadata 복구

**호환성**: ✅ 완전 역하위 호환

---

### 2️⃣ ExecutionResultNormalizer - Summary 길이 정책 개선

**변경**:
```typescript
// Token 기반 동적 길이 계산
const estimatedSummaryTokens = 50;
const charsPerToken = 4;
const maxChars = estimatedSummaryTokens * charsPerToken;  // 200자

normalized.summary = firstLine.length > maxChars
  ? firstLine.substring(0, maxChars - 3) + '...'
  : firstLine;
```

**영향**:
- Summary 자동 추출 로직 (라인 26-37)
- Context window 예측 가능성 향상
- Token 기반 정책으로 변경 (고정값 기반에서)

**호환성**: ✅ 완전 역하위 호환 (결과 형식 동일)

---

## 🔗 의존성 변경 관계도

```
Prompt Engineer (Role 1)
  └─ CompressedExecutionResultSchema [CHANGED] ✅
     ├─ ContextCompressor [P1] ✅
     │  └─ type 필드 보존
     └─ SessionStateManager
        └─ 세션 저장/로드

CLI/System Engineer (Role 3)
  └─ SessionStateManager.logInputTranslation() [NEW] ⚠️
     ├─ REPL orchestrator
     │  └─ 각 turn에서 호출 필요
     └─ CLI output formatter
        └─ 로그 표시 필요
```

---

## 📋 체크리스트 (다른 Role 반영용)

### Role 3 (CLI/System Engineer)

- [ ] `SessionStateManager.logInputTranslation()` 호출 구현
  - 위치: REPL executor에서 각 turn 후 호출
  - 매개변수: sessionId, koreanInput, englishTranslation

- [ ] `SessionStateManager.readCurrentSessionLog()` 표시 구현
  - 위치: CLI stdout에서 번역 결과 표시
  - 타이밍: 사용자 입력 직후

- [ ] `SessionStateManager.clearCurrentSessionLog()` 호출 구현
  - 위치: 세션 종료 시
  - 타이밍: 마지막 저장 후

- [ ] `.state/current_session.log` 경로 확인
  - 읽기 권한: 있음
  - 쓰기 권한: 있음
  - 정리 정책: 명확히 정의

### Role 1 (Prompt Engineer)

- [x] CompressedExecutionResultSchema 확인 (완료)
  - 파일: src/schemas/pipeline.ts 라인 216-221
  - 상태: 적용됨

- [ ] type 필드 활용 검토
  - 영향: 압축된 task에서도 type 정보 사용 가능
  - 활용 가능 장면: task 의존성 분석, type 기반 필터링

---

## 🧪 검증 방법

### Role 3 검증 (CLI 통합)

```bash
# 1. 번역 로깅 기능 테스트
npm run cli -- repl --adapter gemini --execution-mode real

# 2. 현재 세션 로그 확인
cat .state/current_session.log

# 기대 결과:
# [2026-04-28T10:30:45.123Z] Session: repl-xyz
# KO: 사용자 입력
# EN: 영어 번역
# ---
```

### 스키마 검증

```bash
# 1. 빌드 확인
npm run build

# 2. 타입 검증
npm run type-check

# 3. 세션 파일 검증
cat .state/sessions/*.json | jq '.task_results | to_entries[] | {task: .key, type: .value.type, success: .value.success, compressed: .value._compressed}'
```

---

## 📞 질문 & 협력

| 상황 | 연락처 |
|------|--------|
| CompressedExecutionResultSchema 사용법 | Role 2.2 |
| Input 번역 로깅 API 상세 | Role 2.2 |
| Session state 스키마 전체 | Role 2.2 |
| REPL executor 통합점 | Role 3 |
| Task type 정의 변경 | Role 1 |

---

## 📌 요약

**Role 3 (CLI)** → 번역 로깅 3개 메서드 통합 필요 (高優先度)

**Role 1 (Prompt)** → 스키마 변경 이미 완료, 활용 검토 (低優先度)

**Role 2.2** → 모든 변경 완료, API 문서 제공 가능

