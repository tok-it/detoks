# 05-testing-quality (테스팅 & 품질)

테스트 전략, 품질 보증, 테스트 케이스에 관한 문서

## 📑 파일 목록

- **TESTING_GUIDE.md** — detoks 테스트 가이드
  - 단위 테스트 작성
  - 통합 테스트 작성
  - 테스트 실행 방법
  - Vitest 활용

---

## 🎯 읽기 순서

1. **TESTING_GUIDE.md** — 테스트 전략 및 실행 방법 이해

---

## 💡 빠른 테스트 명령어

```bash
# 전체 테스트 실행
npm test

# 감시 모드
npm test -- --watch

# 특정 파일만 테스트
npm test -- src/core/utils/tokenMetrics

# 실제 바이너리 통합 테스트
DETOKS_REAL_BINARY_SMOKE=1 npm test
```
