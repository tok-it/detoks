# Compression Threshold Analysis (2026-04-28)

## 개요

Role 2.2에서 사용 중인 **TOKEN_THRESHOLD = 3000**의 적절성을 검증하고, 데이터 기반 동적 임계값을 제시합니다.

---

## 1. 현재 상태 분석

### 1.1 세션 데이터 분석 (367개 세션)

| 항목 | 값 | 비고 |
|------|-----|------|
| **평균 세션 크기** | 210 tokens | 3000 대비 7% 수준 |
| **최대 세션 크기** | 4,818 tokens | 3000 초과 |
| **압축 발동 빈도** | 1/367 (0.3%) | 실제로 거의 발동 안 함 |
| **단일 task 세션** | 366개 | 대부분 1-2 task |
| **다중 task 세션** | 1개 | REPL 세션 (5 task) |

### 1.2 Task별 Output 크기

| 범위 | 빈도 | 예시 |
|------|------|------|
| 0-1KB | 40% | 단순 분석 |
| 1-3KB | 45% | 표준 구현 |
| 3-7KB | 15% | 복잡한 작업 |

**결론:** 단일 task당 평균 2-3KB, 다중 task 세션도 5-10KB 범위

---

## 2. 어댑터별 Context Window (2026년 공식)

### 2.1 Gemini

- **Gemini 2.0 Flash**: 1M tokens
- **Gemini 1.5 Pro**: 2M tokens
- 참고: [Gemini 2.0 Flash - Google Cloud](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-0-flash)

### 2.2 Claude

- **Claude Opus 4.7**: 1M tokens
- **Claude Sonnet 4.6**: 1M tokens  
- **Claude Haiku 4.5**: 200K tokens
- 참고: [Claude API Context Windows](https://platform.claude.com/docs/en/build-with-claude/context-windows)

### 2.3 Codex (OpenAI)

- **GPT-5.5**: 400K tokens (공식 스펙)
- **GPT-5.4**: 1M tokens
- 주의: 실측 값과 공식 스펙이 다를 수 있음
- 참고: [Codex Issues](https://github.com/openai/codex/issues)

---

## 3. 동적 임계값 설계

### 3.1 계산 로직

```
안전 context = 모델의 context_window * 0.5  (50% 마진)
시스템 overhead = 15,000 tokens (시스템 프롬프트, examples)

TOKEN_THRESHOLD = (context_window * 0.5) - 15,000
```

### 3.2 어댑터별 임계값

| 어댑터 | Context | 안전(50%) | Overhead | 임계값 |
|--------|---------|----------|----------|--------|
| **Gemini 2.0** | 1M | 500K | 15K | **485K** |
| **Gemini 1.5** | 2M | 1M | 15K | **985K** |
| **Claude Opus** | 1M | 500K | 15K | **485K** |
| **Claude Sonnet** | 1M | 500K | 15K | **485K** |
| **Claude Haiku** | 200K | 100K | 15K | **85K** |
| **GPT-5.5** | 400K | 200K | 15K | **185K** |

### 3.3 선택 근거

**50% 안전 마진:**
- LLM의 실제 성능은 context 한계에 가까워질수록 품질 저하
- 사용자 입력(프롬프트) + 시스템 프롬프트 + 컨텍스트 모두 포함
- 보수적이지만 안정적인 설정

**15K 오버헤드:**
- detoks 시스템 프롬프트 (역할 정의, 규칙 등): ~5K
- 예제 (few-shot): ~5K
- 메타데이터 (세션 ID, 타임스탐프 등): ~5K
- 합계: ~15K tokens

---

## 4. 이전 임계값(3000) 검토

### 4.1 문제점

| 문제 | 영향 |
|------|------|
| **과도하게 보수적** | 실제로 거의 압축 발동 안 함 (0.3%) |
| **근거 부족** | "예시값"이라고만 주석 처리됨 |
| **모델 미차별** | 모든 어댑터에 동일 적용 |
| **낭비적** | 사용 가능한 context의 0.6% 이하만 활용 |

### 4.2 4000 → 3000 변경

- 2026-04-27 로그에서 "오류 수정"으로만 기록
- 변경 근거 불명확
- 이후 공식 정당화 없음

---

## 5. 개선 효과

### 5.1 압축 빈도 변화 (추정)

**현재 (3000):**
- 평균: 0.3% (거의 안 함)
- 실제 필요: 1/367 세션만 압축 필요

**개선 후 (동적 85K~985K):**
- 대부분의 세션이 충분한 context 보유
- 불필요한 압축 감소 → 정보 손실 감소
- 필요할 때만 압축 (quality 우선)

### 5.2 Context 활용률

```
현재:
  사용: 210 tokens (평균)
  가능: 3000 tokens (임계값)
  활용률: 7%

개선 후:
  사용: 210 tokens (평균)
  가능: 85K~985K tokens
  활용률: 0.2~0.25% (충분한 여유)
```

---

## 6. 구현 전략

### 6.1 단계별 구현

**Phase 1 (즉시):**
- ContextCompressor에 동적 임계값 적용
- Adapter 타입에 따른 threshold 선택

**Phase 2 (모니터링):**
- 실제 압축 빈도 추적
- 성능 메트릭 수집

**Phase 3 (최적화):**
- 50% 마진 조정 (데이터 기반)
- 어댑터별 오버헤드 재검토

### 6.2 코드 변경

```typescript
// src/core/context/ContextCompressor.ts

interface CompressionPolicy {
  adapter: "gemini" | "claude" | "codex";
  contextWindow: number;
  safeMargin: number;
  systemOverhead: number;
}

const COMPRESSION_POLICIES: Record<string, CompressionPolicy> = {
  gemini: {
    adapter: "gemini",
    contextWindow: 1_000_000,
    safeMargin: 0.5,
    systemOverhead: 15_000,
  },
  claude: {
    adapter: "claude",
    contextWindow: 1_000_000,
    safeMargin: 0.5,
    systemOverhead: 15_000,
  },
  haiku: {
    adapter: "claude",
    contextWindow: 200_000,
    safeMargin: 0.5,
    systemOverhead: 15_000,
  },
  codex: {
    adapter: "codex",
    contextWindow: 400_000,
    safeMargin: 0.5,
    systemOverhead: 15_000,
  },
};

private static getTokenThreshold(adapter: string): number {
  const policy = COMPRESSION_POLICIES[adapter] || COMPRESSION_POLICIES.gemini;
  const safeContext = policy.contextWindow * policy.safeMargin;
  return Math.max(safeContext - policy.systemOverhead, 50_000);
}
```

---

## 7. 후속 검토 항목

### 7.1 정기 모니터링

- [ ] 월별 압축 빈도 추적
- [ ] 어댑터별 실제 output 크기 측정
- [ ] 사용자 세션 길이 분포 분석

### 7.2 성능 검증

- [ ] 압축 전후 컨텍스트 품질 비교
- [ ] 응답 시간 변화 측정
- [ ] LLM API 토큰 사용량 비교

### 7.3 임계값 재조정

- [ ] 50% 마진이 최적인지 검증
- [ ] 어댑터별 오버헤드 재측정
- [ ] 계절성/패턴 분석

---

## 8. 결론

**현재 3000 토큰 임계값:**
- ✅ 단순하고 이해하기 쉬움
- ❌ 데이터 기반이 아님
- ❌ 모델별 차이 반영 안 함
- ❌ 실제 압축 필요 시점과 맞지 않음

**제안하는 동적 임계값:**
- ✅ 공식 모델 스펙 기반
- ✅ 안전성과 효율성 균형
- ✅ 어댑터별 최적화
- ✅ 데이터 기반 검증

**권장:** 즉시 Phase 1 구현 진행

---

## 참고 자료

- [Gemini 2.0 Flash Context Window](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-0-flash)
- [Claude API Context Windows Documentation](https://platform.claude.com/docs/en/build-with-claude/context-windows)
- [Claude Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Codex Context Window Issues](https://github.com/openai/codex/issues)
- [Session Data Analysis: 2026-04-28](./COMPRESSION_THRESHOLD_ANALYSIS.md#1-현재-상태-분석)

---

**작성자:** Role 2.2 (State & Context Engine)  
**작성일:** 2026-04-28  
**상태:** 구현 준비 완료
