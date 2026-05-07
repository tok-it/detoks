# 📚 detoks 문서 인덱스

detoks 프로젝트의 모든 문서를 카테고리별로 정리한 마스터 인덱스입니다.

---

## 📂 폴더 구조 및 빠른 네비게이션

### 🏗️ [01-architecture](01-architecture/INDEX.md) — 아키텍처 & 설계
전체 시스템의 구조, 파이프라인, API, 데이터 스키마를 이해하는 문서

| 폴더 | 설명 | 파일 |
|------|------|------|
| **overview/** | 시스템 전체 개요 | ARCHITECTURE.md, PROJECT_STRUCTURE.md, ROLES.md |
| **pipeline/** | 파이프라인 설계 | PIPELINE.md, CLI_WRAPPER_PIPELINE.md, SHARED_DATA_FLOW.md |
| **api/** | API 정의 | API_SPEC.md |
| **schemas/** | 데이터 스키마 | SCHEMAS.md, TYPE_DEFINITION.md |

**처음 읽을 때**: ARCHITECTURE.md → PROJECT_STRUCTURE.md → PIPELINE.md

---

### ⚡ [02-token-efficiency](02-token-efficiency/INDEX.md) — 토큰 효율성 & 최적화
토큰 계산, 압축, LLM별 컨텍스트 윈도우 관리에 관한 문서

| 파일 | 설명 |
|------|------|
| **TOKEN_EFFICIENCY_ARCHITECTURE.md** | 현재 토큰 효율성 아키텍처 (9가지 핵심 코드) |
| **LLM_CONTEXT_WINDOW_COMPRESSION.md** | LLM별 동적 압축 구현 가이드 (8단계) |
| **COMPRESSION_THRESHOLD_ANALYSIS.md** | 압축 임계값 분석 |

**처음 읽을 때**: TOKEN_EFFICIENCY_ARCHITECTURE.md → LLM_CONTEXT_WINDOW_COMPRESSION.md

---

### 👥 [03-roles-workflow](03-roles-workflow/INDEX.md) — 역할 & 워크플로우
Role1/Role2/Role3의 책임, 워크플로우, 규칙에 관한 문서

| 파일 | 설명 |
|------|------|
| **WORKING_RULES.md** | detoks 작업 규칙 (Git, PR, 테스트) |
| **ROLE1_PIPELINE_IMPROVEMENT_REQUIREMENTS.md** | Role 1 개선사항 |
| **ROLE2.2-HANDOFF-SESSION-PERSISTENCE-IMPROVEMENTS.md** | Role 2.2 개선사항 |
| **ROLE-DEPENDENCY-CHANGES-2026-04-28.md** | 역할 의존성 변경 기록 |

**처음 읽을 때**: WORKING_RULES.md → 해당 Role 파일

---

### ⚙️ [04-setup-deployment](04-setup-deployment/INDEX.md) — 설정 & 배포
환경 설정, 배포, LLM 서버 구성에 관한 문서

| 파일 | 설명 |
|------|------|
| **STACK_VERSIONS.md** | 사용 중인 라이브러리/도구 버전 |
| **CONFIG_MULTI_LOGIN_ANALYSIS.md** | 다중 로그인 설정 분석 |
| **CONFIG_STORAGE_ANALYSIS.md** | 저장소 설정 분석 |
| **llm-server/LLAMA_CPP_SERVER_SPEC.md** | Llama.cpp 서버 스펙 |

**처음 읽을 때**: STACK_VERSIONS.md → CONFIG_*.md → llm-server/

---

### ✅ [05-testing-quality](05-testing-quality/INDEX.md) — 테스팅 & 품질
테스트 전략, 품질 보증, 테스트 케이스에 관한 문서

| 파일 | 설명 |
|------|------|
| **TESTING_GUIDE.md** | detoks 테스트 가이드 및 실행 방법 |

**빠른 명령어**:
```bash
npm test                                    # 전체 테스트
npm test -- --watch                         # 감시 모드
DETOKS_REAL_BINARY_SMOKE=1 npm test        # 통합 테스트
```

---

### 🔧 [06-troubleshooting](06-troubleshooting/INDEX.md) — 문제 해결
일반적인 문제, 버그 리포트, 해결 방법에 관한 문서

| 파일 | 설명 |
|------|------|
| **CLI_TOP3_TROUBLESHOOTING.md** | 🔥 상위 3개 문제 (먼저 읽기) |
| **CLI_TROUBLESHOOTING_PRESENTATION.md** | 상세 해결 가이드 |
| **PORT_CONFLICT_SOLUTION.md** | 포트 충돌 해결 |
| **ADAPTER_MODEL_BUG_FIX.md** | 어댑터/모델 버그 수정 |

**문제가 생겼을 때**: CLI_TOP3_TROUBLESHOOTING.md부터 시작

---

### 📖 [07-guidelines-policies](07-guidelines-policies/INDEX.md) — 가이드라인 & 정책
코드 스타일, 문서 정책, 릴리스 가이드에 관한 문서

| 파일 | 설명 |
|------|------|
| **ENGINEERING_GUIDELINES.md** | 코드 작성 가이드라인 |
| **DOCUMENTATION_POLICY.md** | 문서 작성 정책 |
| **RELEASE_NOTES_TEMPLATE.md** | 릴리스 노트 템플릿 |

**코드 작성 전**: ENGINEERING_GUIDELINES.md 읽기

---

### 🚀 [08-planning-proposals](08-planning-proposals/INDEX.md) — 계획 & 제안
향후 계획, 개선 제안, 디자인 문서에 관한 문서

| 파일 | 설명 |
|------|------|
| **IMPROVEMENT_PROPOSALS_7_4.md** | 최신 개선 제안 |
| **CLAUDE_CODE_ADAPTER_PLAN.md** | Claude Code 어댑터 계획 |
| **DEPENDENCY_WORKFLOW.md** | 의존성 워크플로우 설계 |
| **PTY_SESSION_CONTROLLER_PLAN/** | PTY 세션 컨트롤러 계획 |

---

### 📝 [my-docs](my-docs/INDEX.md) — 내부용 문서 (Git Push 금지)
일일 로그, TMUX 자동화, 내부 분석 문서 (보안상 Push 금지)

---

## 🎯 상황별 문서 선택 가이드

### 🆕 프로젝트 처음 시작
1. [01-architecture/overview/ARCHITECTURE.md](01-architecture/INDEX.md)
2. [01-architecture/pipeline/PIPELINE.md](01-architecture/INDEX.md)
3. [03-roles-workflow/WORKING_RULES.md](03-roles-workflow/INDEX.md)

### 🐛 버그 또는 오류 발생
1. [06-troubleshooting/CLI_TOP3_TROUBLESHOOTING.md](06-troubleshooting/INDEX.md)
2. 해당 문제 파일 참고
3. [CLAUDE.md](../CLAUDE.md) (프로젝트 루트)

### 💻 새로운 코드 작성
1. [07-guidelines-policies/ENGINEERING_GUIDELINES.md](07-guidelines-policies/INDEX.md)
2. [01-architecture/overview/PROJECT_STRUCTURE.md](01-architecture/INDEX.md)
3. 해당 모듈 코드 분석

### 🧪 테스트 작성
1. [05-testing-quality/TESTING_GUIDE.md](05-testing-quality/INDEX.md)
2. 기존 테스트 파일 참고

### 📄 문서 작성
1. [07-guidelines-policies/DOCUMENTATION_POLICY.md](07-guidelines-policies/INDEX.md)
2. 동일한 폴더의 기존 문서 참고

### 💰 토큰 효율성 개선
1. [02-token-efficiency/TOKEN_EFFICIENCY_ARCHITECTURE.md](02-token-efficiency/INDEX.md)
2. [02-token-efficiency/LLM_CONTEXT_WINDOW_COMPRESSION.md](02-token-efficiency/INDEX.md)

### 🚀 릴리스 준비
1. [07-guidelines-policies/RELEASE_NOTES_TEMPLATE.md](07-guidelines-policies/INDEX.md)
2. [04-setup-deployment/STACK_VERSIONS.md](04-setup-deployment/INDEX.md)

---

## 📊 문서 통계

| 섹션 | 파일 수 | 주요 주제 |
|------|--------|---------|
| **01-architecture** | 7 | 시스템 구조, 파이프라인, API, 스키마 |
| **02-token-efficiency** | 3 | 토큰 최적화, LLM별 압축 |
| **03-roles-workflow** | 4 | 역할 정의, 워크플로우, 규칙 |
| **04-setup-deployment** | 4 | 환경 설정, LLM 서버 |
| **05-testing-quality** | 1 | 테스트 전략 |
| **06-troubleshooting** | 4 | 문제 해결 |
| **07-guidelines-policies** | 3 | 가이드라인, 정책 |
| **08-planning-proposals** | 4 | 개선 제안, 계획 |
| **my-docs** | 7 | 내부용 (보안) |
| **총계** | **37** | |

---

## 🔗 외부 링크

- **GitHub**: [detoks 저장소](https://github.com/...)
- **이슈 추적**: [Issues](https://github.com/.../issues)
- **프로젝트 보드**: [Projects](https://github.com/.../projects)

---

## 📝 마지막 업데이트

- **최종 수정**: 2026-05-07
- **문서 구조 정리**: 8개 카테고리로 재정리
- **새로운 가이드**: LLM별 동적 압축 구현 가이드 추가

---

## 💡 팁

- 📌 **자주 찾는 파일**: 북마크에 추가하세요
- 🔍 **전체 검색**: `docs/` 폴더에서 파일명이나 내용 검색
- 📱 **모바일 접근**: GitHub 웹에서도 읽기 가능
- 🤖 **AI 활용**: Claude 등 AI에 문서 내용 제공하여 도움받기

---

**더 이상의 질문이 있으신가요?** 해당 카테고리의 INDEX.md를 참고하세요!
