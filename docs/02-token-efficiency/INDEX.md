# 02-token-efficiency (토큰 효율성 & 최적화)

토큰 계산, 압축, LLM별 컨텍스트 윈도우 관리에 관한 문서

## 📑 파일 목록

- **TOKEN_EFFICIENCY_ARCHITECTURE.md** — 토큰 효율성 전체 아키텍처
  - 핵심 코드 선정 (9가지)
  - 토큰 절감 흐름도
  - 예상 토큰 절감률
  
- **LLM_CONTEXT_WINDOW_COMPRESSION.md** — LLM별 동적 압축 구현 가이드
  - 8단계 구현 방법
  - LLM 메타데이터 정의
  - 토큰 인코더 통합
  - 컨텍스트 버짓 계산
  
- **COMPRESSION_THRESHOLD_ANALYSIS.md** — 압축 임계값 분석
  - 고정값 vs 동적값 비교
  - LLM별 임계값 권장값

---

## 🎯 읽기 순서

1. **TOKEN_EFFICIENCY_ARCHITECTURE.md** — 현재 구조 이해
2. **COMPRESSION_THRESHOLD_ANALYSIS.md** — 문제점 파악
3. **LLM_CONTEXT_WINDOW_COMPRESSION.md** — 개선 방법 학습

---

## 💡 핵심 개념

| 개념 | 설명 | 파일 |
|------|------|------|
| **토큰 메트릭** | 입력/출력 원본 vs 최적화 비교 | TOKEN_EFFICIENCY_ARCHITECTURE.md |
| **입력 최적화** | 정규화 + 번역 + 압축 | TOKEN_EFFICIENCY_ARCHITECTURE.md |
| **컨텍스트 압축** | 토큰 임계값 기반 자동 축소 | TOKEN_EFFICIENCY_ARCHITECTURE.md |
| **동적 임계값** | LLM별 실제 윈도우 기반 계산 | LLM_CONTEXT_WINDOW_COMPRESSION.md |
| **인코더 통합** | o200k_base, cl100k_base, gpt2 등 | LLM_CONTEXT_WINDOW_COMPRESSION.md |

---

## 🚀 구현 로드맵

- Phase 1: LLM 메타데이터 정의
- Phase 2: 토큰 인코더 통합
- Phase 3: ContextBudgetCalculator 구현
- Phase 4: Pipeline 통합
