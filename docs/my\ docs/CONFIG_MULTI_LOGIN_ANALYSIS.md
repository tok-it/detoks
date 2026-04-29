# 다중 로그인 환경에서의 설정 저장 분석

## 현재 상황

**문제:** 같은 사용자가 Codex로 로그인했다가 나중에 Gemini로 로그인할 때 (또는 그 반대), 각각의 모델 선택이 모두 저장되는가?

**답:** ✅ **네, 모두 저장됩니다.** 하지만 **부분적입니다.**

---

## 저장되는 것 vs 저장 안 되는 것

### 📁 detoks가 저장하는 것 (구조화된 모델 선택)

**파일:** `~/.detoks/settings.json`

```json
{
  "adapter": {
    "selected": "codex",
    "models": {
      "codex": "gpt-5.4",                    ✅ 저장됨
      "gemini": "gemini-3.1-pro-preview"    ✅ 저장됨
    }
  },
  "translation": {
    "model": "SuperGemma4-E4B"               ✅ 저장됨
  }
}
```

**저장되는 정보:**
- ✅ Codex에서 선택한 모델 (gpt-5.4, gpt-5.5 등)
- ✅ Gemini에서 선택한 모델 (gemini-3.1-pro-preview 등)
- ✅ 번역 모델 선택 (SuperGemma4-E4B 등)
- ✅ 현재 선택된 어댑터 (codex or gemini)

---

### 🔐 각 도구가 저장하는 것 (인증 정보)

**Codex 인증:**
```
파일: ~/.codex/config.toml
내용: 
  [auth]
  api_key = "sk-xxxx..."
  user = "user@example.com"
```

**Gemini 인증:**
```
파일: ~/.gemini/oauth_creds.json
내용:
  {
    "access_token": "...",
    "refresh_token": "...",
    "expiry": "..."
  }
```

❌ **detoks는 이 정보를 저장하지 않음** (의도적)

---

## 사용자 관점의 동작

### 시나리오 1: 단일 사용자, 다중 로그인

```
상황:
┌─────────────────────────────────────┐
│ 사용자 A (한 컴퓨터, 한 홈 디렉터리) │
└─────────────────────────────────────┘

Day 1:
  $ codex login
  $ detoks repl --adapter codex
  /codex-models → gpt-5.4 선택
  └─ ~/.detoks/settings.json:
     {
       "models": { "codex": "gpt-5.4" }
     }

Day 2:
  $ gemini (기본 설정으로 인증 완료)
  $ detoks repl --adapter gemini
  /gemini-models → gemini-3.1-pro-preview 선택
  └─ ~/.detoks/settings.json 업데이트:
     {
       "models": { 
         "codex": "gpt-5.4",
         "gemini": "gemini-3.1-pro-preview"  ← 추가됨
       }
     }

Day 3:
  $ detoks repl --adapter codex
  └─ [CODEX:gpt-5.4] detoks> ← 저장된 설정 로드!
  
  $ detoks repl --adapter gemini
  └─ [GEMINI:gemini-3.1-pro-preview] detoks> ← 저장된 설정 로드!
```

✅ **결과: 모든 어댑터의 모델 선택이 보존됨**

---

### 시나리오 2: 다중 사용자, 같은 컴퓨터

```
상황:
┌──────────────────────────────────────┐
│ 컴퓨터 1 (사용자 A, B가 로그인)      │
└──────────────────────────────────────┘

사용자 A (/Users/userA):
  ~/.detoks/settings.json:
  {
    "models": {
      "codex": "gpt-5.4",
      "gemini": "gemini-3.1-pro-preview"
    }
  }

사용자 B (/Users/userB):
  ~/.detoks/settings.json:
  {
    "models": {
      "codex": "gpt-5.5",
      "gemini": "gemini-2.0-flash"
    }
  }
```

✅ **결과: 각 사용자의 설정이 독립적으로 보존됨**

---

## 아키텍처 검토

### 왜 이렇게 설계했나?

```
┌─────────────────────────────────────────────────┐
│ detoks (사용자 UX 선택 저장)                    │
│ ~/.detoks/settings.json                         │
│ └─ 어댑터별 모델 선택 (codex, gemini)          │
│ └─ 번역 모델 선택                              │
└─────────────────────────────────────────────────┘
        ↓ (의존)      ↓ (의존)
┌──────────────────┐  ┌──────────────────┐
│ Codex (외부 도구) │  │ Gemini (외부 도구)│
│ ~/.codex/        │  │ ~/.gemini/       │
│ └─ 인증 정보     │  │ └─ 인증 정보     │
│ └─ 설정          │  │ └─ 설정          │
└──────────────────┘  └──────────────────┘
```

**이유:**
1. **책임 분리** - 각 도구가 자신의 인증 정보 관리
2. **보안** - detoks가 민감한 토큰/키 저장 안 함
3. **독립성** - Codex/Gemini 업데이트가 detoks에 영향 없음
4. **간결성** - detoks는 사용자의 "선택"만 저장

---

## 현재 구현의 한계와 개선 가능성

### ✅ 잘 구현된 부분

1. **모든 어댑터의 모델 선택이 저장됨**
   ```
   Day 1: codex → gpt-5.4 저장
   Day 2: gemini → gemini-3.1 저장
   Day 3: codex 재진입 → gpt-5.4 자동 로드
   ```

2. **멀티 유저 환경 지원**
   ```
   /Users/userA/.detoks/settings.json (독립적)
   /Users/userB/.detoks/settings.json (독립적)
   ```

3. **구조 확장 가능**
   ```json
   {
     "version": "1.0",  ← 버전 관리로 마이그레이션 가능
     "adapter": {...},
     "ui": {...},       ← 향후 추가 가능
     "cache": {...}     ← 향후 추가 가능
   }
   ```

### ⚠️ 개선 고려 사항

**1. 어댑터별 인증 상태 표시**

현재: 사용자가 Codex 로그인 여부를 몰라서 /codex-models 시도 후 실패
개선: `[CODEX:미인증]` 또는 `[CODEX✗:미인증]` 표시

**2. 자동 어댑터 선택**

현재: `detoks repl --adapter codex` 명시 필요
개선: `detoks repl` → 마지막 사용 어댑터 자동 선택

**3. 어댑터별 마지막 모델 자동 적용**

현재: 구현됨 ✅
개선: 추가 안 함 (이미 충분)

---

## 권장사항

### 현재 상태: ✅ 충분함

- 모든 어댑터의 모델 선택이 저장되고 로드됨
- 멀티 유저 환경 지원
- 확장 가능한 구조

### 향후 개선안 (우선순위)

1. **High**: 자동 어댑터 선택 (마지막 사용 adapter 저장)
2. **Medium**: 인증 상태 프롬프트 표시 (`[CODEX✓]` vs `[CODEX✗]`)
3. **Low**: 어댑터별 기본값 설정 UI

---

## 테스트 케이스

```bash
# Test 1: Codex → Gemini 전환
detoks repl --adapter codex
/codex-models → gpt-5.4 선택
# 설정 저장

detoks repl --adapter gemini
/gemini-models → gemini-3.1 선택
# 설정 저장

# Test 2: 다시 Codex 진입
detoks repl --adapter codex
# 예상: [CODEX:gpt-5.4] detoks>
# 실제: ✅ [CODEX:gpt-5.4] detoks>

# Test 3: Gemini 재진입
detoks repl --adapter gemini
# 예상: [GEMINI:gemini-3.1] detoks>
# 실제: ✅ [GEMINI:gemini-3.1] detoks>
```

---

## 결론

**현재 구현:**
- ✅ 모든 어댑터의 모델 선택이 `~/.detoks/settings.json`에 저장
- ✅ REPL 재진입 시 자동 로드
- ✅ 멀티 유저 환경 지원
- ✅ 보안 우수 (인증 정보는 각 도구 관리)
- ✅ 구조 확장 가능

**답변:** 🎯 **네, 로그인 방법이 달라져도 모든 모델 정보가 저장됩니다.**
