# DAG · Session 데이터 기반 RAG 기능 카탈로그 및 MVP 선정

> **작성일**: 2026-05-12
> **상태**: 설계 + MVP 선정 단계
> **목적**: detoks가 이미 생성·저장하고 있는 DAG·SessionStateManager 데이터를 RAG 자산으로 활용할 수 있는 기능들을 카탈로그화하고, 우선 출시할 MVP 범위를 명확히 정의
> **선행 문서**: `DETOKS_DIRECTION_AND_RAG_INTEGRATION_PLAN.md` (전략 전환 배경)

---

## 목차

1. [활용 가능한 데이터 자산 인벤토리](#1-활용-가능한-데이터-자산-인벤토리)
2. [기능 카탈로그 (Tier 1~4)](#2-기능-카탈로그-tier-14)
3. [기능별 상세 — 토큰 절감 산수](#3-기능별-상세--토큰-절감-산수)
4. [MVP 선정 기준](#4-mvp-선정-기준)
5. [MVP 범위 — F1 + F2](#5-mvp-범위--f1--f2)
6. [MVP 구현 계획](#6-mvp-구현-계획)
7. [Post-MVP 로드맵](#7-post-mvp-로드맵)
8. [부록 — 데이터 스키마 및 코드 위치](#8-부록--데이터-스키마-및-코드-위치)

---

## 1. 활용 가능한 데이터 자산 인벤토리

detoks가 **이미 생성하고 있는** 데이터 자산. 새로 만들 필요 없이 RAG로 활용 가능합니다.

### 1.1 DAG 산출물 (`TaskGraphProcessor`)

| 필드 | 출처 | RAG 활용도 |
|------|------|-----------|
| `task.id` | 자동 생성 | 식별자 |
| `task.type` | 분류기 (create/explore/execute/validate/update) | **카테고리 필터** |
| `task.title` | TaskSentenceSplitter 분해 후 압축된 영어 텍스트 | **의미 검색 키** |
| `task.input_hash` | sentence + type의 SHA256 | **정확 중복 키** |
| `task.depends_on` | DAG 처리 결과 | 연관 검색 그래프 |
| `task.priority` | 우선순위 | 정렬 가중치 |
| `task.owner_role` | role 분류 | 디버깅용 메타 |
| `task.status` | pending/in-progress/completed/failed | **품질 필터** |
| `task.output_summary` | (있을 경우) 결과 요약 | 의미 검색 보조 |

### 1.2 Session 자산 (`SessionStateManager`)

| 필드 | 의미 | RAG 활용도 |
|------|------|-----------|
| `session.shared_context.session_id` | 세션 식별자 | 그룹 키 |
| `session.shared_context.raw_input` | 사용자 원본 입력 (한국어 가능) | **의미 검색 키** |
| `session.shared_context.project_id` | 프로젝트 식별자 | **프로젝트 필터** |
| `session.shared_context.project_path` | 프로젝트 경로 | 프로젝트 필터 |
| `session.shared_context.project_name` | 프로젝트 이름 | 표시용 |
| `session.shared_context.token_metrics` | 토큰 사용 통계 | 효율 학습 |
| `session.shared_context.failed_task_ids` | 실패한 task 목록 | 재실행 회피 |
| `session.task_results[taskId]` | task별 실행 결과 | **결과 캐시 대상** |
| `session.task_results[].raw_output` | task 원본 출력 | **의미 검색 대상** |
| `session.task_results[].summary` | task 결과 요약 | 의미 검색 보조 |
| `session.task_results[].success` | 성공/실패 플래그 | 품질 필터 |
| `session.task_results[].type` | task type | 카테고리 필터 |
| `session.completed_task_ids` | 완료된 task 순서 | 시퀀스 패턴 |
| `session.updated_at` | 최종 갱신 시각 | 최신도 가중치 |

### 1.3 Pipeline 자산 (`PipelineTracer`, `actionTimeline`)

| 필드 | 의미 | RAG 활용도 |
|------|------|-----------|
| `traceLog.entries[]` | 단계별 input/output 기록 | 실행 패턴 분석 |
| `actionTimeline[].kind` | 이벤트 종류 (tool_call/validation/recap 등) | 패턴 마이닝 |
| `actionTimeline[].source` | 이벤트 출처 (adapter/validation 등) | 추적 |
| `progressLog[]` | 단계 진행 로그 | 실패 위치 식별 |

### 1.4 Token 메트릭 (`tokenMetrics`)

| 필드 | 의미 | RAG 활용도 |
|------|------|-----------|
| `inputOriginal` / `inputOptimized` | 압축 전/후 토큰 | 압축 효율 학습 |
| `outputOriginal` / `outputOptimized` | 출력 토큰 | 추정 모델 calibration |
| `savedPercent` | 절감률 | 가치 attribution |

---

## 2. 기능 카탈로그 (Tier 1~4)

복잡도와 의존성 순으로 분류.

### Tier 1 — Exact Match (임베딩 불필요, 해시 기반)

| ID | 기능 | 핵심 자산 |
|----|------|-----------|
| **F1** | **Cross-session input_hash 캐시** | `session.shared_context.raw_input` |
| **F2** | **Task-level input_hash 캐시** | `task.input_hash` |
| **F3** | **Session resume 자동 감지** | `session.completed_task_ids` |

### Tier 2 — Semantic Retrieval (임베딩 필요)

| ID | 기능 | 핵심 자산 |
|----|------|-----------|
| **F4** | **유사 과거 task 검색** | `task.title` 임베딩 |
| **F5** | **유사 과거 prompt 검색** | `session.shared_context.raw_input` 임베딩 |
| **F6** | **task_results.raw_output 의미 검색** | `task_results[].raw_output` 임베딩 |
| **F7** | **DAG 메타데이터 하이브리드 필터링** | `task.type` + `status` + embedding |

### Tier 3 — Pattern Mining (집계 분석)

| ID | 기능 | 핵심 자산 |
|----|------|-----------|
| **F8** | **Task 시퀀스 패턴 추출** | `session.completed_task_ids` × N 세션 |
| **F9** | **실패 패턴 인식** | `task.status="failed"` + adapter type |
| **F10** | **사용자 거절/재시도 패턴** | `actionTimeline`, `failed_task_ids` |
| **F11** | **워크플로우 템플릿 자동 생성** | F8 + F9 결과 |

### Tier 4 — Cross-Session Intelligence (장기 학습)

| ID | 기능 | 핵심 자산 |
|----|------|-----------|
| **F12** | **프로젝트별 학습 메모리** | `project_id`별 모든 자산 집계 |
| **F13** | **Adapter 성능 calibration** | adapter별 토큰 메트릭 분포 |
| **F14** | **Token budget 통계 학습** | `token_metrics` 누적 |
| **F15** | **Cross-project 공유 패턴** | 익명화된 F11 결과 |

---

## 3. 기능별 상세 — 토큰 절감 산수

### F1. Cross-session input_hash 캐시

**메커니즘**: 사용자 입력 `raw_input`을 SHA256 → 동일 hash의 과거 성공 세션 검색 → 결과 그대로 반환.

```typescript
// orchestrator.ts:340 직전 삽입
const inputHash = sha256(request.userRequest.raw_input);
const cached = await SessionStateManager.findSuccessfulSessionByInputHash(
  inputHash,
  { project_id: request.projectInfo?.projectId }
);

if (cached && isCacheValid(cached)) {
  return buildPipelineResultFromCachedSession(cached);
}
```

**적용 빈도**: 사용자별 5-12% (동일 prompt 반복 사용)
**단일 적용 절감률**: 100% (adapter 호출 0회)
**구현 난이도**: ★☆☆☆☆ — 의존성 0개, 코드 ~50줄
**부수 효과**: 응답 즉시 반환 → UX 개선

**캐시 유효성 검증 로직**:
- 동일 프로젝트인가?
- 캐시 작성 후 관련 파일 변경 여부 (git mtime 기반)
- 사용자가 `--no-cache` 플래그 안 줬는가?
- 캐시 신선도 (기본 7일 이내, 환경변수 설정)

### F2. Task-level input_hash 캐시

**메커니즘**: 분해된 task 단위로 hash 매칭. 같은 task가 과거에 성공했으면 결과 재사용.

```typescript
// orchestrator.ts:617 직후 (task 실행 직전)
const taskHash = sha256(task.title + task.type);
const cachedTaskResult = await SessionStateManager.findSuccessfulTaskByHash(
  taskHash,
  { project_id, recencyDays: 7 }
);

if (cachedTaskResult) {
  // adapter 호출 없이 캐시 결과로 task 완료 처리
  state = markTaskCompleted(state, task.id, cachedTaskResult.raw_output, task.type);
  taskRecords.push({ taskId: task.id, status: "completed", rawOutput: cachedTaskResult.raw_output });
  continue;
}
```

**적용 빈도**: 사용자별 15-25% (개별 task 단위는 빈도 높음)
**단일 적용 절감률**: 100% (해당 task 한정)
**구현 난이도**: ★★☆☆☆ — 의존성 0개, 코드 ~80줄
**부수 효과**: DAG 전체가 캐시면 F1과 결과 같음, 일부만 캐시여도 부분 절감

### F3. Session resume 자동 감지

**메커니즘**: 이미 detoks가 가진 기능이지만 자동 발견 부재. 동일 raw_input으로 새 세션 시작 시 "이전 미완 세션 있음" 자동 안내.

```typescript
// 새 세션 시작 시
const recentMatchingSession = await SessionStateManager.findRecentByInputHash(
  inputHash,
  { incomplete: true, withinHours: 24 }
);

if (recentMatchingSession) {
  // 사용자에게 안내
  // "이전 세션 abc123에서 t1,t2까지 완료, t3에서 멈춤. 이어서 진행할까요?"
}
```

**적용 빈도**: 5-10% (재시작/중단 경우)
**단일 적용 절감률**: 50-80% (완료된 task 만큼)
**구현 난이도**: ★★☆☆☆ — UX 통합 필요

### F4. 유사 과거 task 검색

**메커니즘**: `task.title`을 BGE-M3로 임베딩 → 벡터 DB 검색 → 유사 task 발견 → plan 힌트로 prompt에 주입.

```typescript
const similar = await ragRetriever.findSimilarTasks({
  title: task.title,
  taskType: task.type,
  projectId: request.projectInfo?.projectId,
  topK: 3,
  minScore: 0.75,
});

const planHint = similar.length > 0
  ? `\n\n## 과거 유사 작업의 시퀀스 (참고용)\n${formatPlan(similar[0])}`
  : "";
```

**적용 빈도**: 30-50%
**단일 적용 절감률**: 20-40% (adapter의 plan 비용 절감)
**구현 난이도**: ★★★☆☆ — sqlite-vec + 임베딩 인프라 필요

### F5. 유사 과거 prompt 검색

**메커니즘**: F4와 같지만 session 단위. 새 prompt가 들어오면 의미적으로 가까운 과거 세션 전체 plan을 retrieve.

**적용 빈도**: F4와 중첩, 별도 적용 빈도 ~20%
**단일 적용 절감률**: 30-50%
**구현 난이도**: ★★★☆☆

### F6. task_results.raw_output 의미 검색

**메커니즘**: 과거 task의 실제 출력을 임베딩해두고, 현재 task와 의미적으로 가까운 출력을 retrieve해서 context로 제공.

**적용 빈도**: 25-40%
**단일 적용 절감률**: 30-60% (adapter의 tool_call 라운드 절감)
**구현 난이도**: ★★★☆☆

### F7. DAG 메타데이터 하이브리드 필터링

**메커니즘**: 벡터 검색 + DAG 메타데이터 SQL 필터링 조합.

```sql
SELECT * FROM tasks 
WHERE project_id = :current_project
  AND task_type = :current_task_type    -- DAG 분류
  AND status = 'completed'              -- 성공만
  AND timestamp > :recent_threshold     -- 최근 가중
ORDER BY vec_distance(embedding, :query_embedding) LIMIT 5;
```

**적용 빈도**: F4-F6 모두에 적용
**단일 적용 절감률**: 검색 정확도 향상 → 후속 메커니즘 효과 1.5-2배
**구현 난이도**: ★★★☆☆ — F4와 함께 구현

### F8. Task 시퀀스 패턴 추출

**메커니즘**: 여러 세션의 `completed_task_ids` 시퀀스를 마이닝 → 자주 등장하는 (type_A → type_B → type_C) 패턴을 템플릿화.

```
세션 100개 분석:
  (CREATE → EXECUTE)              45회
  (EXPLORE → CREATE → VALIDATE)   23회
  (VALIDATE → UPDATE)              18회

→ 새 입력의 첫 task가 CREATE면 다음 task EXECUTE 가능성 예측
→ adapter prompt에 plan으로 미리 주입
```

**적용 빈도**: 30-40% (반복 패턴 사용자)
**단일 적용 절감률**: 20-40%
**구현 난이도**: ★★★★☆ — sequence mining 알고리즘 (PrefixSpan 등) 또는 단순 카운터

### F9. 실패 패턴 인식

**메커니즘**: `task.status="failed"` 데이터를 task type × adapter 매트릭스로 집계 → 실패율 높은 조합 사전 경고 또는 다른 adapter 라우팅.

```
실패율 통계:
  CREATE × gemini   = 12% (전체)
  CREATE × codex    = 4%
  EXECUTE × claude  = 23% ⚠️
  
→ 새 task가 EXECUTE인데 claude 선택되어 있으면 codex로 자동 fallback 권고
```

**적용 빈도**: 사용자 전체 작업의 5-15%가 잠재적 실패 회피
**단일 적용 절감률**: 실패한 호출 자체가 비용이므로 100% (그 호출에 한해)
**구현 난이도**: ★★★☆☆

### F10. 사용자 거절/재시도 패턴

**메커니즘**: `actionTimeline`에서 사용자가 거절한 작업, 재시도한 작업 추적 → 비슷한 task 들어오면 사전 확인 게이트.

**적용 빈도**: 5-10%
**단일 적용 절감률**: 100% (거절될 작업을 미리 차단)
**구현 난이도**: ★★★★☆ — 거절 시그널 정의 필요 (현재 명시적 없음)

### F11. 워크플로우 템플릿 자동 생성

**메커니즘**: F8 + F9 결과를 자동 템플릿화 → "deploy workflow" "test workflow" 등 등록 → 새 prompt가 매칭되면 템플릿 그대로 사용.

**적용 빈도**: 반복 패턴 사용자 20-30%
**단일 적용 절감률**: 50-70% (전체 plan 비용 절감)
**구현 난이도**: ★★★★☆

### F12. 프로젝트별 학습 메모리

**메커니즘**: `project_id` 단위로 위 모든 데이터를 격리·학습.

**구현 난이도**: ★★★★☆

### F13. Adapter 성능 calibration

**메커니즘**: adapter별 토큰 사용 분포·실패율을 학습해서 budget 추정 정확도 향상.

**구현 난이도**: ★★★☆☆ (Budget Control과 통합)

### F14. Token budget 통계 학습

**메커니즘**: 누적 `token_metrics`로 사용자별 추정 모델 calibration.

**구현 난이도**: ★★★☆☆

### F15. Cross-project 공유 패턴

**메커니즘**: 익명화된 F11 결과를 사용자 간 (opt-in) 공유.

**구현 난이도**: ★★★★★ — 익명화·동의·공유 인프라 필요

---

## 4. MVP 선정 기준

### 4.1 평가 기준 (가중치)

| 기준 | 가중치 | 의미 |
|------|-------|------|
| **즉시 가치 (ROI)** | 30% | 1주일 내 사용자에게 측정 가능한 효과 |
| **구현 단순성** | 25% | 의존성 0~1개, 코드 변경 100줄 이내 |
| **검증 용이성** | 20% | 토큰 절감 자동 측정 가능 |
| **기존 자산 활용도** | 15% | 새 인프라 없이 기존 데이터로 동작 |
| **확장 가능성** | 10% | 이후 phase의 기반이 됨 |

### 4.2 기능별 평가 매트릭스

| 기능 | ROI | 단순성 | 검증 | 기존 자산 | 확장성 | **종합** |
|------|-----|--------|------|----------|--------|----------|
| **F1** Input hash 캐시 | 9 | 10 | 10 | 10 | 9 | **9.6** ⭐ |
| **F2** Task hash 캐시 | 10 | 9 | 10 | 10 | 9 | **9.7** ⭐ |
| **F3** Session resume | 6 | 8 | 7 | 10 | 6 | 7.2 |
| F4 유사 task 검색 | 8 | 4 | 7 | 6 | 10 | 6.8 |
| F5 유사 prompt 검색 | 7 | 4 | 7 | 6 | 9 | 6.4 |
| F6 raw_output 검색 | 8 | 4 | 7 | 6 | 9 | 6.6 |
| F7 하이브리드 필터링 | - | - | - | - | - | F4-6 부속 |
| F8 시퀀스 패턴 | 6 | 3 | 5 | 8 | 8 | 5.6 |
| F9 실패 패턴 | 7 | 5 | 7 | 9 | 7 | 6.8 |
| F10 거절/재시도 | 4 | 3 | 5 | 5 | 6 | 4.5 |
| F11 워크플로우 템플릿 | 7 | 3 | 5 | 7 | 9 | 6.0 |
| F12-15 (장기) | - | - | - | - | - | 후순위 |

### 4.3 MVP 후보 결과

**상위 2개: F1 (9.6) + F2 (9.7)** — 의존성 0, 즉시 가치, 검증 쉬움

이 둘은 **임베딩 인프라 없이** 완성 가능한 유일한 RAG 기능군입니다.

---

## 5. MVP 범위 — F1 + F2

### 5.1 MVP가 무엇이고 무엇이 아닌가

**MVP가 하는 것:**
- 사용자 입력(raw_input) 단위 cross-session 캐시 매칭 (F1)
- task 단위 cross-session 캐시 매칭 (F2)
- 캐시 hit 시 adapter 호출 0회
- 캐시 유효성 검증 (프로젝트 일치, 파일 변경 여부, 신선도)
- 토큰 절감 metric 자동 누적 및 표시

**MVP가 하지 않는 것:**
- 임베딩 / 벡터 검색 (Phase 2 이상)
- 코드/md 청크 RAG (별도 작업)
- 패턴 마이닝 (장기)
- adapter routing (Composition Layer)
- Budget control (별도 워크스트림)

### 5.2 사용자 관점 동작

```
$ detoks run "package.json에 zod 추가"

[detoks] 입력 hash: abc12345
[detoks] 캐시 조회 중...
[detoks] ✓ 캐시 hit (3일 전 세션 def67890)
[detoks] 캐시 유효성 검증:
  - 동일 프로젝트 ✓
  - 캐시 후 package.json 변경 없음 ✓
  - 신선도 3일 / 7일 한도 내 ✓
[detoks] 캐시된 결과 반환. adapter 호출 skip.

결과:
  package.json에 zod ^4.3.6이 이미 추가되어 있음을 확인했습니다.

[detoks] 절감: ~10,400 tok (이 호출에서 100% 절감)
[detoks] 누적 세션 절감: 23,800 tok / $0.07
```

### 5.3 fallback 동작

캐시 무효 또는 miss 시:
```
[detoks] 입력 hash: xyz09876
[detoks] 캐시 조회 중...
[detoks] ✗ 캐시 miss (관련 과거 세션 없음)
[detoks] 정상 pipeline 진행.
```

부분 task 캐시 hit:
```
[detoks] DAG 분해: 3개 task (t1, t2, t3)
[detoks] task hash 조회:
  - t1 (CREATE): 캐시 hit (5일 전, 유효)
  - t2 (EXECUTE): 캐시 miss
  - t3 (VALIDATE): 캐시 hit (어제, 유효)

[t1] adapter skip, 캐시 결과 사용 (10,300 tok 절감)
[t2] adapter codex 실행 중...
[t2] 완료 (실측 10,800 tok)
[t3] adapter skip, 캐시 결과 사용 (8,900 tok 절감)

[detoks] 이 세션 절감: 19,200 tok / 전체 38,900 tok = 49%
```

### 5.4 캐시 무효화 규칙

| 조건 | 무효화 처리 |
|------|------------|
| 캐시 후 7일 경과 (기본값, env로 조정) | 자동 폐기 |
| 캐시 task와 관련된 파일이 git mtime 기준 변경됨 | 무효 처리 |
| 사용자가 `--no-cache` 플래그 사용 | 강제 우회 |
| 다른 프로젝트의 캐시 | 매칭 안 함 (project_id 필터) |
| 캐시된 task가 failed 상태 | 매칭 안 함 (status='completed'만) |
| 사용자가 같은 prompt 직후 `/redo` 명령 | 다음 호출에 한해 우회 |

### 5.5 MVP 성공 지표

- [ ] 캐시 hit 비율 측정 (목표: 베타 사용자 평균 15-25%)
- [ ] 누적 토큰 절감 측정 (목표: 베타 1주일 후 5만+ 토큰)
- [ ] 캐시 false-positive율 (잘못된 캐시 반환) (목표: <2%)
- [ ] 추가 latency (캐시 조회) (목표: <100ms)
- [ ] 의존성 추가 0개
- [ ] 모든 기존 테스트 통과
- [ ] 신규 테스트 커버리지 90%+

---

## 6. MVP 구현 계획

### 6.1 작업 분해 (총 4-5일 추정)

#### Day 1: 데이터 레이어
- [ ] `src/core/state/SessionStateManager.ts`에 다음 메서드 추가:
  - `findSuccessfulSessionByInputHash(hash, { project_id, recencyDays })`
  - `findSuccessfulTaskByHash(taskHash, { project_id, recencyDays })`
  - `getInputHashIndex()` — JSONL 인덱스 파일 로드
- [ ] `.detoks/cache/input-hash-index.jsonl` 신규 — 가벼운 append-only 인덱스

```typescript
// .detoks/cache/input-hash-index.jsonl 한 줄 형식
{
  "type": "session" | "task",
  "hash": "abc12345...",
  "session_id": "def67890",
  "task_id": "t1",                  // task일 때만
  "project_id": "...",
  "status": "completed",
  "timestamp": 1747400000000,
  "raw_output_snippet": "..."       // 빠른 미리보기용 (실제 결과는 세션 파일에서)
}
```

#### Day 2: 캐시 검증 레이어
- [ ] `src/core/cache/cache-validator.ts` 신규
  - `isSessionCacheValid(session, currentRequest): boolean`
  - `isTaskCacheValid(taskCache, currentRequest): boolean`
  - 검증 항목: project 일치, 신선도, 파일 mtime (옵션)
- [ ] `src/core/cache/cache-config.ts` 신규
  - 환경변수: `DETOKS_CACHE_TTL_DAYS`, `DETOKS_CACHE_DISABLED`

#### Day 3: orchestrator 통합
- [ ] `src/core/pipeline/orchestrator.ts:340` 직전에 F1 캐시 조회 삽입
- [ ] `orchestrator.ts:617` 직후에 F2 task 캐시 조회 삽입
- [ ] 캐시 hit 시 `actionTimeline`에 "cache_hit" 이벤트 추가
- [ ] 토큰 절감 metric을 `tokenMetrics`에 누적

#### Day 4: CLI 통합 및 UX
- [ ] `--no-cache` 플래그 추가 (`src/cli/parse.ts`, `src/cli/types.ts`)
- [ ] TUI에서 캐시 hit 표시 (`PipelineStatusPanel`에 cache 뱃지)
- [ ] 결과 출력에 누적 절감 토큰 표시
- [ ] `/cache` REPL 명령: `clear`, `stats`, `disable` 서브명령

#### Day 5: 테스트 및 문서
- [ ] `tests/ts/unit/core/state/SessionStateManager.test.ts`에 hash lookup 테스트 추가
- [ ] `tests/ts/unit/core/pipeline/orchestrator.test.ts`에 캐시 hit/miss 경로 테스트
- [ ] `tests/ts/integration/cli-smoke.test.ts`에 `--no-cache` smoke 추가
- [ ] `docs/my docs/shared/CLI_PIPELINE_STATUS.md` 업데이트
- [ ] CHANGELOG / 릴리즈 노트 초안

### 6.2 변경 영향 (파일별)

| 파일 | 변경 종류 | 예상 줄수 |
|------|----------|----------|
| `src/core/state/SessionStateManager.ts` | 메서드 추가 | +80 |
| `src/core/cache/cache-validator.ts` | 신규 | +120 |
| `src/core/cache/cache-config.ts` | 신규 | +40 |
| `src/core/pipeline/orchestrator.ts` | 분기 추가 | +50 |
| `src/core/timeline/types.ts` | 이벤트 kind 추가 | +5 |
| `src/cli/parse.ts` | 플래그 추가 | +10 |
| `src/cli/types.ts` | 옵션 필드 추가 | +5 |
| `src/cli/tui/panels/pipeline-status.ts` | 캐시 뱃지 | +20 |
| `tests/...` | 신규 | +200 |
| **총합** | | **~530줄** |

### 6.3 위험 요소 및 완화

| 위험 | 영향 | 완화 방안 |
|------|------|----------|
| **잘못된 캐시 반환** | 사용자가 outdated 결과 신뢰 | 파일 mtime 검증 + 명시적 `--no-cache` 광고 + 캐시 hit 시 timestamp 표시 |
| **캐시 인덱스 부풀어오름** | 디스크 사용량 증가 | 7일 이상 entry 자동 vacuum, max 10k entries 제한 |
| **동시성 (병렬 detoks 실행)** | 인덱스 손상 | JSONL append-only + lock 파일 |
| **프로젝트 식별 오류** | 다른 프로젝트의 캐시 적용 | `project_id`는 path + git remote 조합으로 안정화 |
| **사용자 신뢰** | "캐시되어서 실행 안 됐다"는 혼란 | TUI에 명확히 표시, `--verbose`에 캐시 메타데이터 노출 |

---

## 7. Post-MVP 로드맵

MVP 출시 후 검증된 가치 기반으로 다음 단계 결정.

### Phase 2A — 의미 검색 RAG (3-4주)
- F4, F5, F6 통합 구현
- sqlite-vec 의존성 추가
- BGE-M3 임베딩 (node-llama-cpp)
- F7 (하이브리드 필터링) 자동 적용
- markdown 청크 RAG (별도 plan 문서 참고)

**전제 조건**: MVP가 캐시 hit 5%+ 달성 검증

### Phase 2B — 실패 패턴 + Calibration (2주, Phase 2A와 병렬)
- F9 (실패 패턴 인식)
- F13 (adapter calibration)
- F14 (budget 통계 학습)
- Budget Control 워크스트림과 통합

### Phase 3 — Pattern Mining (3-4주)
- F8 (task 시퀀스 패턴)
- F11 (워크플로우 템플릿)
- F10 (거절/재시도 — UX 정의 선행 필요)

### Phase 4 — Cross-Session Intelligence (장기)
- F12 (프로젝트별 학습 메모리)
- F15 (cross-project 공유, opt-in)

---

## 8. 부록 — 데이터 스키마 및 코드 위치

### 8.1 현재 task.input_hash 생성 위치

```typescript
// src/core/task-graph/TaskGraphProcessor.ts:298 buildTask
private static buildTask(sentence, index, type, dependsOn): Task {
  return TaskSchema.parse({
    id: `t${index + 1}`,
    type,
    status: "pending",
    title: sentence,
    input_hash: createHash("sha256").update(sentence).digest("hex").slice(0, 12),
    depends_on: dependsOn,
  });
}
```

→ 이미 생성되어 있어 MVP 작업에 추가 처리 불필요.

### 8.2 raw_input → hash 변환 위치 (신규 추가 예정)

```typescript
// src/core/cache/hash.ts (신규)
import { createHash } from "node:crypto";

export const hashRawInput = (rawInput: string, projectId?: string): string => {
  const normalized = rawInput.trim().replace(/\s+/g, " ");
  const composite = projectId ? `${projectId}::${normalized}` : normalized;
  return createHash("sha256").update(composite).digest("hex").slice(0, 16);
};
```

### 8.3 SessionStateManager 현재 인터페이스 (참고)

```typescript
// src/core/state/SessionStateManager.ts 주요 메서드
class SessionStateManager {
  static sessionExists(sessionId): Promise<boolean>
  static loadSession(sessionId): Promise<SessionState>
  static saveSession(state): Promise<void>
  static listSessions(opts?): Promise<SessionSummary[]>
  // ↑ 신규 추가: 
  static findSuccessfulSessionByInputHash(hash, opts): Promise<SessionState | null>
  static findSuccessfulTaskByHash(taskHash, opts): Promise<TaskResult | null>
}
```

### 8.4 ActionTimelineEvent 확장

```typescript
// src/core/timeline/types.ts
export const ActionTimelineKindValues = [
  "tool_call",
  "tool_result",
  "validation",
  "stage_update",
  "turn_recap",
  "diagnostic",
  "cache_hit",      // ← 신규
  "cache_miss",     // ← 신규
] as const;
```

### 8.5 PipelineExecutionResult 확장

```typescript
// src/core/pipeline/types.ts
export interface PipelineExecutionResult {
  // 기존 ...
  cacheHit?: {
    kind: "session" | "task";
    sourceSessionId: string;
    sourceTaskId?: string;
    cacheAge: number;       // ms
    tokensSaved: number;
  };
}
```

---

## 9. 핵심 요약 (TL;DR)

> **MVP는 임베딩 없이 hash만으로 동작하는 cross-session 캐시 (F1 + F2)**. detoks가 이미 만들고 있는 `task.input_hash`와 SessionStateManager 데이터를 그대로 활용해 5일 내 작동 가능. 캐시 hit 시 adapter 호출 0회 = 100% 토큰 절감. 베타 사용자 평균 15-25% 작업에서 hit 예상 → 사용자 작업당 약 1,500-3,000 토큰 평균 절감. 추가 의존성 없고, 검증 자동화되며, Phase 2 임베딩 인프라의 기반이 됨.

### 의사결정 항목

- [ ] F1+F2 MVP로 진행 승인
- [ ] `.detoks/cache/` 디렉토리 구조 승인
- [ ] 캐시 기본 TTL 7일 / max 10k entries 승인
- [ ] `--no-cache` 플래그 키 이름 승인
- [ ] TUI 뱃지 표시 형식 협의

---

**문서 끝.**

이 MVP는 단독으로 출시 가능하며, 이후 Phase 2 임베딩 인프라(`DETOKS_DIRECTION_AND_RAG_INTEGRATION_PLAN.md` 참조) 도입 시 자연스럽게 확장됩니다.
