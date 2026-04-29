# Adapter-Model Mismatch 버그 분석 및 해결

## 문제 상황

```
실행: detoks repl --adapter codex
설정: "selected": "gemini" (이전 사용 기록)
결과: [CODEX:gemini-3.1-pro-preview] ❌ 불일치!
```

---

## 근본 원인

### 현재 동작

```
1. REPL 시작 (CLI: --adapter codex)
   ↓
2. loadAndApplyConfig() 호출
   ├─ settings.json 로드
   ├─ config.adapter.selected = "gemini" 읽음
   ├─ config.adapter.models["gemini"] = "gemini-3.1-pro-preview"
   └─ process.env.ADAPTER_MODEL = "gemini-3.1-pro-preview"
   ↓
3. buildPrompt({ adapter: "codex", adapterModel: "gemini-3.1-pro-preview" })
   ↓
4. 프롬프트: [CODEX:gemini-3.1-pro-preview] ❌
```

**문제:** Loader가 CLI adapter를 모르므로 저장된 adapter의 모델을 로드함

---

## 해결안 비교

### ✅ 해결안 A: Loader에 adapter 매개변수 전달 (권장)

**수정 위치:**
1. `src/cli/config/loader.ts` - adapter 매개변수 추가
2. `src/cli/commands/repl.ts` - adapter 인자 전달

**코드:**
```typescript
// loader.ts
export const loadAndApplyConfig = (adapter: "codex" | "gemini"): void => {
  const config = loadConfig();
  
  // CLI adapter에 해당하는 모델만 로드
  const modelForAdapter = config.adapter.models[adapter];
  if (modelForAdapter) {
    process.env.ADAPTER_MODEL = modelForAdapter;
  }
};

// repl.ts
loadAndApplyConfig(baseArgs.adapter as "codex" | "gemini");
```

**장점:**
- ✅ CLI 인자 존중
- ✅ 명확한 의도
- ✅ 최소 변경

**단점:**
- ⚠️ 저장된 "selected" 무시

---

### 해결안 B: CLI adapter 없으면 저장된 adapter 사용

**수정 위치:**
1. `src/cli/index.ts` - adapter 기본값 설정

**코드:**
```typescript
const adapter = baseArgs.adapter || getSelectedAdapter();
```

**장점:**
- ✅ 기억된 adapter 사용 가능
- ✅ 타이핑 줄임

**단점:**
- ⚠️ CLI와 설정의 혼재
- ⚠️ 예기치 않은 adapter로 시작할 수 있음

---

### 해결안 C: 저장된 adapter와 모델을 CLI adapter로 동기화

**수정 위치:**
1. `src/cli/config/loader.ts` - selected 업데이트
2. `src/cli/repl-commands/index.ts` - adapter 변경 시 저장

**코드:**
```typescript
// adapter 변경 시
config.adapter.selected = newAdapter;
saveConfig(config);
```

**장점:**
- ✅ 설정과 CLI 동기화

**단점:**
- ⚠️ 과도한 업데이트
- ⚠️ CLI와 설정의 책임 모호

---

## 권장 해결안: **A번 (Loader에 adapter 전달)**

### 이유
1. CLI 인자 존중 원칙
2. 최소한의 변경
3. 명확한 의도
4. 예측 가능한 동작

### 구현 계획

**Step 1:** `src/cli/config/loader.ts` 수정
```typescript
export const loadAndApplyConfig = (adapter: "codex" | "gemini"): void => {
  const config = loadConfig();
  
  // CLI adapter에 맞는 모델만 로드
  const modelForAdapter = config.adapter.models[adapter];
  if (modelForAdapter) {
    process.env.ADAPTER_MODEL = modelForAdapter;
  }
  
  // 번역 모델은 adapter와 무관 (global)
  if (!process.env.LOCAL_LLM_MODEL_NAME && config.translation.model) {
    process.env.LOCAL_LLM_MODEL_NAME = config.translation.model;
  }
};
```

**Step 2:** `src/cli/commands/repl.ts` 수정
```typescript
loadAndApplyConfig(baseArgs.adapter as "codex" | "gemini");
```

**Step 3:** `src/cli/index.ts` 수정 (one-shot 모드)
```typescript
loadAndApplyConfig(baseArgs.adapter as "codex" | "gemini");
```

---

## 검증 방법

```bash
# Test 1: Codex 선택 후 Gemini 선택
detoks repl --adapter codex
/codex-models → gpt-5.4 선택

detoks repl --adapter gemini
/gemini-models → gemini-3.1 선택

# Test 2: Codex 재진입 (이전 설정 로드)
detoks repl --adapter codex
# 예상: [CODEX:gpt-5.4] detoks> ✅
# 현재: [CODEX:gemini-3.1] detoks> ❌

# Test 3: Gemini 재진입
detoks repl --adapter gemini
# 예상: [GEMINI:gemini-3.1] detoks> ✅
```

---

## 부수 효과 검토

### 긍정
- ✅ CLI adapter와 모델이 일치
- ✅ 예측 가능한 동작
- ✅ 직관적 UX

### 부정 (없음)
- 설정 보존됨 (다른 adapter 전환 시 이전 선택 유지)
- 명시적 CLI 인자 필요 (기본값은 설정에서 로드 안 함)

---

## 다른 고려사항

**어댑터 기본값 선택:**
- 현재: `baseArgs.adapter` (기본값: "codex")
- 대안: 저장된 adapter를 기본값으로 사용?
  ```bash
  detoks repl  # CLI adapter 없음
  # 저장된 마지막 adapter 사용?
  ```
  이 기능은 별도로 구현 가능
