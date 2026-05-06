# 포트 충돌 해결 방법

## 문제 상황

```
llama.cpp server at http://127.0.0.1:12375/v1 is already running with model(s): 
EXAONE-3.5-2.4B-Instruct-GGUF. Expected mradermacher/gemma-4-E2B-it-heretic-ara-GGUF. 
Update LOCAL_LLM_MODEL_NAME or LOCAL_LLM_SERVER_PORT in .env to match the running server, 
or stop the running server before retrying.
```

### 원인 분석

| 항목 | 설정값 | 설명 |
|------|--------|------|
| `LOCAL_LLM_API_BASE` | `http://127.0.0.1:12370/v1` | API가 기대하는 포트: **12370** |
| `LOCAL_LLM_SERVER_PORT` | `12375` | 서버가 시작되는 포트: **12375** |
| 실제 실행 중인 모델 | EXAONE-3.5-2.4B | 기대하는 모델과 **불일치** |

**핵심 문제**: API_BASE와 SERVER_PORT 포트가 일치하지 않아서 발생

---

## 해결 방법 분석

### 방법 1: 포트 통일 (권장)

**장점:**
- ✅ 간단한 설정
- ✅ 직관적
- ✅ 초기 설정 시에만 필요

**단점:**
- ❌ 이미 다른 프로세스가 해당 포트를 사용 중이면 충돌

**구현:**
```bash
# .env 파일 수정
# 옵션 1: 두 포트 모두 12370으로 통일
LOCAL_LLM_API_BASE=http://127.0.0.1:12370/v1
LOCAL_LLM_SERVER_PORT=12370

# 옵션 2: 두 포트 모두 12375로 통일
LOCAL_LLM_API_BASE=http://127.0.0.1:12375/v1
LOCAL_LLM_SERVER_PORT=12375
```

### 방법 2: 포트 동적 할당

**개념:**
- 포트 충돌 감지 → 포트를 1씩 증가 (12370 → 12371 → ...)

**장점:**
- ✅ 자동 해결
- ✅ 사용자 개입 불필요

**단점:**
- ❌ 매번 다른 포트 사용 가능 → 세션 간 불일치
- ❌ 추적이 어려움
- ❌ 디버깅 복잡

### 방법 3: 세션 기반 포트 관리 (최종 선택) ⭐

**개념:**
- 첫 실행 시 포트 결정 → `session.json`에 저장
- 이후 실행 시 저장된 포트 사용
- 세션 간 일관성 유지

**장점:**
- ✅ 일관된 포트 사용
- ✅ 세션별 추적 가능
- ✅ 기존 프로세스 재사용
- ✅ 영속성 제공

**구현:**

```json
// .state/sessions/{sessionId}/state.json
{
  "shared_context": {...},
  "runtime": {
    "localLlmPort": 12370,
    "localLlmModel": "gemma-4-E2B-it-heretic-ara-GGUF"
  },
  "task_results": {...}
}
```

---

## 구현 방식 선택 기준

| 상황 | 권장 방법 | 이유 |
|------|----------|------|
| 초기 배포 | **포트 통일** | 간단하고 빠름 |
| 개발 환경 | **세션 관리** | 일관성 유지 |
| 프로덕션 | **세션 관리** | 추적 가능, 안정적 |
| 마이크로서비스 | **포트 동적 할당** | 확장성 필요 |

---

## 프로그램 관리 관점

### 사용자 가이드 방식의 한계
```
❌ 사용자에게 수동 설정 강요
❌ 문서화/교육 비용
❌ 지원 요청 증가
❌ 일관성 없는 환경
```

### 프로그램 자동 처리의 이점
```
✅ 설치 후 즉시 실행 가능
✅ 자동 해결로 비용 절감
✅ 일관된 사용자 경험
✅ 확장 가능한 구조
```

### 현재 detoks의 철학

detoks는 **자동 처리 중심** 설계:
- `LOCAL_LLM_AUTO_START=1`: 서버 자동 시작
- 모델 불일치 감지 → **자동 중지 후 재시작**
- 포트도 같은 철학으로 처리 필요

---

## 최종 구현: A/B/C 3단계

### A단계: 스키마 수정

**파일:** `src/schemas/pipeline.ts`

```typescript
export const SessionStateSchema = z.object({
  // ... 기존 필드들
  runtime: z.object({
    localLlmPort: z.number().int().positive().optional(),
    localLlmModel: z.string().optional(),
  }).optional(),
  // ... 나머지 필드들
});
```

**변경 사항:**
- SessionState에 `runtime` 필드 추가
- 포트와 모델 정보 저장 가능

---

### B단계: 런타임 정보 추적

**파일:** `src/core/llm-client/local-runtime.ts`

```typescript
// 포트/모델 정보 추적
let lastUsedPort: number | undefined = undefined;
let lastUsedModel: string | undefined = undefined;

// ensureLocalLlmRuntime() 성공 후 저장
try {
  await nextStartupPromise;
  lastUsedPort = config.localLlmServerPort ?? 12370;
  lastUsedModel = config.localLlmModelName;
}

// 정보 조회 함수
export function getLastUsedLocalLlmInfo(): { 
  port: number | undefined; 
  model: string | undefined 
} {
  return {
    port: lastUsedPort,
    model: lastUsedModel,
  };
}
```

**동작:**
- `ensureLocalLlmRuntime()` 실행 시 포트/모델 기록
- `getLastUsedLocalLlmInfo()`로 정보 조회

---

### C단계: 사용자 인터페이스

**파일:** `src/cli/commands/repl.ts`

```typescript
const runtimeConfig = loadRole1RuntimeConfig();
const llmPort = runtimeConfig.localLlmServerPort ?? 12370;
const llmModel = runtimeConfig.localLlmModelName?.split(":")[0] || "unknown";

const startMessage = [
  colors.title("detoks repl 시작"),
  `  adapter=${colors.info(baseArgs.adapter)}`,
  `  executionMode=${colors.info(baseArgs.executionMode)}`,
  `  verbose=${colors.info(String(verbose))}`,
  `  llm=${colors.info(`port ${llmPort} | ${llmModel}`)}`,
  // ... 나머지 메시지
].join("\n");
```

**출력 예시:**
```
detoks repl 시작
  adapter=claude
  executionMode=real
  verbose=false
  llm=port 12375 | gemma-4-E2B-it-heretic-ara
```

---

### orchestrator 통합

**파일:** `src/core/pipeline/orchestrator.ts`

```typescript
// 실행 완료 후 런타임 정보 세션에 저장
const llmInfo = getLastUsedLocalLlmInfo();
if (llmInfo.port !== undefined || llmInfo.model !== undefined) {
  state = {
    ...state,
    runtime: {
      localLlmPort: llmInfo.port,
      localLlmModel: llmInfo.model,
    },
  };
}

// 세션 저장
await SessionStateManager.saveSession(state);
```

---

## 포트 충돌 처리 흐름

```
1. CLI 진입
   ↓
2. loadRole1RuntimeConfig() → .env의 포트 읽기
   ↓
3. REPL 시작 메시지 → 현재 포트/모델 표시
   ↓
4. 사용자 명령 실행
   ↓
5. ensureLocalLlmRuntime()
   ├─ 기존 서버 포트 확인
   ├─ 모델 일치 확인
   ├─ 불일치 시 자동 중지 후 재시작
   └─ 실행 완료 → lastUsedPort/Model 기록
   ↓
6. 파이프라인 완료
   ↓
7. getLastUsedLocalLlmInfo() → 런타임 정보 수집
   ↓
8. 세션 상태에 runtime 필드 저장
   ↓
9. 다음 실행 시 해당 포트 정보를 세션에서 읽을 수 있음
```

---

## 향후 개선 방안

### Phase 2: 포트 자동 할당 (옵션)

```typescript
// 포트가 이미 다른 프로세스에서 사용 중인 경우
// 자동으로 다음 포트 시도
async function findAvailablePort(
  startPort: number = 12370, 
  maxRetries: number = 5
): Promise<number> {
  for (let i = 0; i < maxRetries; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available ports in range ${startPort}-${startPort + maxRetries}`);
}
```

### Phase 3: 포트 설정 UI

```
detoks [--port 12370]  // 포트 명시적 지정 가능
```

---

## 테스트 및 검증

### 단위 테스트
- `getLastUsedLocalLlmInfo()` 반환값 확인
- SessionState runtime 필드 저장/로드

### 통합 테스트
- REPL 시작 메시지에 포트 표시 확인
- 세션 저장 후 로드 시 runtime 정보 보존 확인

### 수동 테스트
```bash
# 1. REPL 시작
npm run cli

# 2. 시작 메시지 확인
# "llm=port XXXX | MODEL" 표시 여부

# 3. 명령 실행
# 포트 정보가 세션에 저장되는지 확인

# 4. 세션 로드
npm run cli -- session continue <session-id>
# runtime 정보가 유지되는지 확인
```

---

## 결론

**포트 충돌 해결의 3단계 구현:**

1. **A단계**: 스키마에 runtime 필드 추가 ✅
2. **B단계**: 포트/모델 정보 추적 및 저장 ✅
3. **C단계**: REPL에서 런타임 정보 표시 ✅

**장점:**
- 사용자가 현재 사용 중인 포트/모델 명확히 확인
- 세션 상태에 런타임 정보 영속성
- 향후 포트 충돌 자동 해결을 위한 기반 구축
- detoks의 자동 처리 철학과 일관성

**버전:** 0.1.2+ (자동 버전 증가 시스템으로 배포)
