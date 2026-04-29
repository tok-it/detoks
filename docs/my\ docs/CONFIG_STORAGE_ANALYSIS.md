# detoks 사용자 설정 저장 위치 분석

## 저장해야 할 정보

```
사용자별 설정 (persistent across sessions)
├── Adapter 설정
│   ├── 현재 선택 어댑터: "codex" or "gemini"
│   └── 어댑터별 모델
│       ├── codex: "gpt-5.5", "gpt-5.4", etc.
│       └── gemini: "gemini-3.1-pro-preview", etc.
└── 번역 모델 설정
    └── 선택된 로컬 LLM 모델: "SuperGemma4-E4B", etc.
```

---

## 후보 위치 비교

### 1️⃣ `.env` 파일 (현재 사용 중)

**경로:** 프로젝트 루트 `.env`

**현재 사용:**
```env
LOCAL_LLM_MODEL_NAME=SuperGemma4-E4B
LOCAL_LLM_HF_REPO=mradermacher/supergemma4...
LOCAL_LLM_HF_FILE=supergemma4-e4b...
ADAPTER_MODEL=gpt-5.5
```

**장점:**
- ✅ 이미 사용 중인 표준 방식
- ✅ 환경변수로 바로 로드 가능
- ✅ dotenv 라이브러리 기존 지원

**단점:**
- ❌ 텍스트 형식이라 복잡한 구조 관리 어려움
- ❌ 주석/메타데이터 추가 불편
- ❌ 프로젝트 루트에 있어서 여러 프로젝트 사용 시 설정 공유 안 됨
- ❌ 버전/마이그레이션 관리 어려움

**결론:** 프로젝트별 환경이 필요할 때만 (배포 등) ❌

---

### 2️⃣ `~/.detoks/settings.json` (권장 ⭐)

**경로:** 사용자 홈 `~/.detoks/settings.json`

**구조:**
```json
{
  "version": "1.0",
  "lastUpdated": "2026-04-29T12:34:56Z",
  "adapter": {
    "selected": "codex",
    "models": {
      "codex": "gpt-5.4",
      "gemini": "gemini-3.1-pro-preview"
    }
  },
  "translation": {
    "model": "SuperGemma4-E4B"
  },
  "ui": {
    "theme": "auto",
    "verbose": false
  }
}
```

**장점:**
- ✅ 구조화된 JSON - 복잡한 데이터 관리 용이
- ✅ 사용자 글로벌 설정 - 여러 프로젝트에서 공유
- ✅ 버전 관리 가능 - 마이그레이션 용이
- ✅ 메타데이터 추가 가능 (lastUpdated, etc.)
- ✅ 확장성 좋음 - UI, 캐시 등 다른 설정도 추가 가능
- ✅ 이미 존재하는 디렉터리 활용 (~/.detoks/모델 저장, oauth_creds.json 등)

**단점:**
- ⚠️ .env보다 한 단계 더 로드하는 로직 필요
- ⚠️ 새로운 파일 추가

**결론:** ✅ **최적의 선택**

---

### 3️⃣ `~/.gemini/settings.json` + `~/.codex/config.toml` (기존 도구 설정)

**경로:** 각 도구의 설정 디렉터리

**현황:**
- Gemini: `~/.gemini/settings.json` 이미 존재
- Codex: `~/.codex/config.toml` (TOML 형식)

**장점:**
- ✅ 각 도구의 네이티브 설정 활용
- ✅ 도구와의 연동성 좋음

**단점:**
- ❌ detoks가 아닌 외부 도구 설정이라 제어 어려움
- ❌ 두 개의 파일을 관리해야 함
- ❌ detoks 재진입 시 두 파일을 모두 읽어야 함
- ❌ detoks만의 UI/설정 추가 어려움
- ❌ 번역 모델(로컬 LLM)은 저장 불가

**결론:** 보조 용도만 ⚠️

---

### 4️⃣ `~/.detoks/state.json` (기존 세션 저장)

**경로:** 세션별 상태 파일

**현황:**
```
~/.detoks/
├── models/           (모델 파일)
├── state/
│   └── sessions/
│       └── session-xxx.json
└── state.json        (현재 사용 안 함)
```

**장점:**
- ✅ detoks 디렉터리 활용
- ✅ 기존 구조와 일관성

**단점:**
- ❌ 세션별 상태로 설계됨 - 글로벌 설정용 부적합
- ❌ 세션 정리 시 설정도 삭제될 수 있음
- ❌ 세션 간 공유 설정으로 사용하기 부자연스러움

**결론:** 이 용도에는 부적합 ❌

---

## 최종 권장안

### 🏆 `~/.detoks/settings.json` 사용

**이유:**
1. **글로벌 설정**: 사용자 수준에서 모든 프로젝트/세션에 적용
2. **구조화**: JSON으로 복잡한 설정 관리 가능
3. **확장성**: 향후 UI 설정, 캐시, 기본값 등 추가 용이
4. **일관성**: 이미 ~/.detoks/ 디렉터리 사용 중
5. **명확성**: detoks 고유 설정임이 분명함
6. **독립성**: 외부 도구(codex, gemini)와 독립적으로 관리

**구조:**
```json
{
  "version": "1.0",
  "lastUpdated": "2026-04-29T18:30:00Z",
  "adapter": {
    "selected": "codex",
    "models": {
      "codex": "gpt-5.4",
      "gemini": "gemini-3.1-pro-preview"
    }
  },
  "translation": {
    "model": "SuperGemma4-E4B"
  }
}
```

**자동화 흐름:**

```
detoks 시작
  ↓
~/.detoks/settings.json 로드
  ↓
process.env에 설정 적용
  ├─ ADAPTER_MODEL=gpt-5.4
  ├─ LOCAL_LLM_MODEL_NAME=SuperGemma4-E4B
  └─ (선택된 adapter도 저장)
  ↓
REPL 진입
  ├─ 프롬프트에 설정 표시: [CODEX:gpt-5.4]
  └─ 모델 선택 시 자동 저장
```

---

## 마이그레이션 전략

**단계 1:** 기존 `.env`에서 ADAPTER_MODEL 읽기 (backward compat)
**단계 2:** `~/.detoks/settings.json` 없으면 생성 (defaults)
**단계 3:** 사용자가 모델 변경 → settings.json에만 저장
**단계 4:** 향후 .env 제거 가능 (deprecation 공지)

---

## 구현 체크리스트

- [ ] `src/cli/config/types.ts` - 설정 타입 정의
- [ ] `src/cli/config/config-manager.ts` - 읽기/쓰기 함수
- [ ] `src/cli/config/loader.ts` - 초기화 시 로드 및 env에 적용
- [ ] REPL 시작 시 설정 로드
- [ ] 모델 선택 후 설정 저장
- [ ] 마이그레이션: .env → settings.json 자동 변환
