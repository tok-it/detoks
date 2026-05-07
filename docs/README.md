# 📚 detoks 문서 가이드

detoks 프로젝트의 모든 문서는 논리적인 폴더 구조로 정리되어 있습니다.

---

## 🎯 빠른 시작

### 📖 문서를 찾고 있다면?

**→ [📑 전체 문서 인덱스 (INDEX.md)](INDEX.md) 참고**

### 🆘 문제 해결이 필요하다면?

**→ [🔧 문제 해결 가이드 (06-troubleshooting)](06-troubleshooting/INDEX.md) 참고**

### 💻 코드를 작성하려면?

**→ [📖 가이드라인 (07-guidelines-policies)](07-guidelines-policies/INDEX.md) 참고**

---

## 📂 전체 문서 구조

```
docs/
├── 📑 INDEX.md                          ← 🌟 여기서 시작! (마스터 인덱스)
├── README.md                            ← 이 파일
│
├── 01-architecture/                     🏗️ 아키텍처 & 설계
│   ├── INDEX.md
│   ├── overview/
│   │   ├── ARCHITECTURE.md
│   │   ├── PROJECT_STRUCTURE.md
│   │   └── ROLES.md
│   ├── pipeline/
│   │   ├── PIPELINE.md
│   │   ├── CLI_WRAPPER_PIPELINE.md
│   │   ├── SHARED_DATA_FLOW.md
│   │   ├── SCHEMA_FLOW.md
│   │   ├── DES_DATA_FLOW.md
│   │   └── REAL_MODE_PIPELINE_FLOW_PLAN.md
│   ├── api/
│   │   └── API_SPEC.md
│   └── schemas/
│       ├── SCHEMAS.md
│       └── TYPE_DEFINITION.md
│
├── 02-token-efficiency/                 ⚡ 토큰 효율성 & 최적화
│   ├── INDEX.md
│   ├── TOKEN_EFFICIENCY_ARCHITECTURE.md
│   ├── LLM_CONTEXT_WINDOW_COMPRESSION.md
│   └── COMPRESSION_THRESHOLD_ANALYSIS.md
│
├── 03-roles-workflow/                   👥 역할 & 워크플로우
│   ├── INDEX.md
│   ├── WORKING_RULES.md
│   ├── ROLE1_PIPELINE_IMPROVEMENT_REQUIREMENTS.md
│   ├── ROLE2.2-HANDOFF-SESSION-PERSISTENCE-IMPROVEMENTS.md
│   └── ROLE-DEPENDENCY-CHANGES-2026-04-28.md
│
├── 04-setup-deployment/                 ⚙️ 설정 & 배포
│   ├── INDEX.md
│   ├── STACK_VERSIONS.md
│   ├── CONFIG_MULTI_LOGIN_ANALYSIS.md
│   ├── CONFIG_STORAGE_ANALYSIS.md
│   └── llm-server/
│       └── LLAMA_CPP_SERVER_SPEC.md
│
├── 05-testing-quality/                  ✅ 테스팅 & 품질
│   ├── INDEX.md
│   └── TESTING_GUIDE.md
│
├── 06-troubleshooting/                  🔧 문제 해결
│   ├── INDEX.md
│   ├── CLI_TROUBLESHOOTING_PRESENTATION.md
│   ├── CLI_TOP3_TROUBLESHOOTING.md
│   ├── PORT_CONFLICT_SOLUTION.md
│   └── ADAPTER_MODEL_BUG_FIX.md
│
├── 07-guidelines-policies/              📖 가이드라인 & 정책
│   ├── INDEX.md
│   ├── DOCUMENTATION_POLICY.md
│   ├── ENGINEERING_GUIDELINES.md
│   └── RELEASE_NOTES_TEMPLATE.md
│
├── 08-planning-proposals/               🚀 계획 & 제안
│   ├── INDEX.md
│   ├── CLAUDE_CODE_ADAPTER_PLAN.md
│   ├── IMPROVEMENT_PROPOSALS_7_4.md
│   ├── DEPENDENCY_WORKFLOW.md
│   └── PTY_SESSION_CONTROLLER_PLAN/
│       └── FILE_LEVEL_WORK_TABLE.md
│
└── my-docs/                             📝 내부용 (Git Push 금지)
    ├── DAILY_LOG_2026-05-06.md
    ├── shared/
    │   ├── CLI_PIPELINE_STATUS.md
    │   ├── TMUX_WORKFLOW.md
    │   ├── TMUX_AUTOMATION_SHARED.md
    │   └── TMUX_AUTOMATION_GEMINI.md
    ├── codex-cli/
    │   ├── TMUX_AUTOMATION_CODEX.md
    │   └── TMUX_AUTOMATION_CODEX_PROMPT.md
    └── gemini-cli/
        └── TMUX_AUTOMATION_GEMINI_PROMPT.md
```

---

## 🗂️ 각 섹션 설명

### 📍 01-architecture (8개 파일)
**시스템 전체 아키텍처를 이해하는 문서**
- 시스템 구조, 파이프라인 흐름, API, 데이터 스키마
- **처음 읽을 때**: overview → pipeline → api → schemas 순서

### 📍 02-token-efficiency (3개 파일)
**토큰 효율성 및 LLM별 최적화 전략**
- 현재 토큰 효율성 아키텍처
- LLM별 동적 압축 구현 가이드 (8단계)
- **새로 추가된 가이드**: LLM_CONTEXT_WINDOW_COMPRESSION.md

### 📍 03-roles-workflow (4개 파일)
**Role1/2/3의 책임과 워크플로우**
- 작업 규칙, 각 역할의 개선사항, 의존성
- **먼저 읽을 것**: WORKING_RULES.md

### 📍 04-setup-deployment (4개 파일)
**환경 설정, 배포, LLM 서버 구성**
- 라이브러리 버전, 설정 분석, 로컬 LLM 스펙
- **처음 설정할 때**: STACK_VERSIONS.md → CONFIG_*.md

### 📍 05-testing-quality (1개 파일)
**테스트 전략과 품질 보증**
- 테스트 작성 방법, 실행 명령어, Vitest 활용

### 📍 06-troubleshooting (4개 파일)
**문제 해결 및 버그 리포트**
- 상위 3개 문제, 상세 해결책, 포트 충돌, 어댑터 버그
- **🔥 먼저 읽을 것**: CLI_TOP3_TROUBLESHOOTING.md

### 📍 07-guidelines-policies (3개 파일)
**코드 스타일, 문서 정책, 릴리스 가이드**
- 엔지니어링 가이드, 문서 정책, 릴리스 노트 템플릿
- **코드 작성 전 필독**: ENGINEERING_GUIDELINES.md

### 📍 08-planning-proposals (4개 파일)
**향후 계획과 개선 제안**
- 최신 개선 제안, Claude Code 계획, PTY 세션 계획
- **진행 중인 프로젝트 확인**: IMPROVEMENT_PROPOSALS_7_4.md

### 📍 my-docs (7개 파일)
**내부용 문서 (Git Push 금지)**
- 일일 로그, TMUX 자동화, 내부 분석
- ⚠️ `.gitignore`에 포함되어 있음

---

## 🎯 목적별 문서 찾기

| 목적 | 권장 문서 | 비고 |
|------|---------|------|
| 시스템 이해 | 01-architecture/overview | 처음 시작 |
| 코드 작성 | 07-guidelines-policies | 스타일 확인 |
| 버그 해결 | 06-troubleshooting | 빠른 해결 |
| 테스트 방법 | 05-testing-quality | npm test 명령 |
| 토큰 최적화 | 02-token-efficiency | 새로운 가이드 |
| 배포 설정 | 04-setup-deployment | 환경 구성 |
| 역할 정의 | 03-roles-workflow | Role 1/2/3 |
| 개선 제안 | 08-planning-proposals | 향후 계획 |

---

## 📖 읽기 순서 (권장)

### 🆕 프로젝트 처음 시작
```
1. README.md (이 파일) ← 현재 위치
2. INDEX.md (마스터 인덱스)
3. 01-architecture/overview/ARCHITECTURE.md
4. 01-architecture/pipeline/PIPELINE.md
5. 03-roles-workflow/WORKING_RULES.md
```

### 🐛 버그 발생 시
```
1. 06-troubleshooting/INDEX.md
2. 06-troubleshooting/CLI_TOP3_TROUBLESHOOTING.md
3. 해당 문제 파일
```

### 💻 새로운 기능 추가
```
1. 07-guidelines-policies/ENGINEERING_GUIDELINES.md
2. 01-architecture/overview/PROJECT_STRUCTURE.md
3. 해당 모듈 코드 분석
```

---

## 🔍 문서 검색

### 📌 파일명으로 검색
예: `TOKEN_EFFICIENCY` → `02-token-efficiency/` 폴더 확인

### 🔎 내용으로 검색
```bash
# 모든 md 파일에서 검색
grep -r "keyword" docs/

# 특정 폴더에서 검색
grep -r "keyword" docs/02-token-efficiency/
```

### 🌐 GitHub에서 검색
- 파일명 검색: `docs/` 폴더의 파일 목록 확인
- 내용 검색: GitHub 검색 기능 활용

---

## 📝 최근 변경사항

| 날짜 | 내용 | 섹션 |
|------|------|------|
| 2026-05-07 | 문서 구조 전면 재정리 (8개 카테고리) | 전체 |
| 2026-05-07 | TOKEN_EFFICIENCY_ARCHITECTURE.md 추가 | 02 |
| 2026-05-07 | LLM_CONTEXT_WINDOW_COMPRESSION.md 추가 | 02 |
| 2026-05-07 | INDEX.md, README.md 생성 | 전체 |

---

## 💡 팁 & 트릭

### ✨ 북마크 추천
- [📑 INDEX.md](INDEX.md) — 마스터 인덱스 (항상 필요)
- [🔧 06-troubleshooting/CLI_TOP3_TROUBLESHOOTING.md](06-troubleshooting/INDEX.md) — 빠른 해결
- [📖 07-guidelines-policies/ENGINEERING_GUIDELINES.md](07-guidelines-policies/INDEX.md) — 코드 작성

### 🎯 빠른 이동
각 폴더의 `INDEX.md`는 그 섹션의 가이드 역할을 합니다.

### 📱 모바일 접근
GitHub 웹 인터페이스에서도 모든 문서를 읽을 수 있습니다.

### 🤖 AI 활용
Claude 등 AI 어시스턴트에 문서 내용을 제공하여 추가 설명 요청 가능합니다.

---

## 🚀 다음 단계

1. **[📑 INDEX.md](INDEX.md) 읽기** — 전체 문서 맵 이해
2. **해당 섹션의 INDEX.md 읽기** — 상세 가이드
3. **필요한 문서 참고** — 상황에 맞는 자료

---

## 📞 질문 & 피드백

- 📧 문서 개선 제안: [Issues](https://github.com/.../issues/new)
- 💬 질문: [Discussions](https://github.com/.../discussions)
- 📝 버그 리포트: [Bug Report Template](https://github.com/.../issues/new?template=bug_report.md)

---

**문서가 도움이 되었나요?** 
→ [이 README를 개선하는 데 도움주세요!](https://github.com/.../edit/main/docs/README.md)
