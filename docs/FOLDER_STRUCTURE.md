# docs 폴더 구조 정리

## 목표
논리적이고 계층적인 폴더 구조로 재정리하여 문서 찾기 및 관리 용이성 향상

## 새로운 폴더 구조

```
docs/
├── 01-architecture/              # 아키텍처 & 설계 문서
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
├── 02-token-efficiency/          # 토큰 효율성 & 최적화
│   ├── TOKEN_EFFICIENCY_ARCHITECTURE.md
│   ├── LLM_CONTEXT_WINDOW_COMPRESSION.md
│   └── COMPRESSION_THRESHOLD_ANALYSIS.md
│
├── 03-roles-workflow/            # 역할 & 워크플로우
│   ├── WORKING_RULES.md
│   ├── ROLE1_PIPELINE_IMPROVEMENT_REQUIREMENTS.md
│   ├── ROLE2.2-HANDOFF-SESSION-PERSISTENCE-IMPROVEMENTS.md
│   └── ROLE-DEPENDENCY-CHANGES-2026-04-28.md
│
├── 04-setup-deployment/          # 설정 & 배포
│   ├── STACK_VERSIONS.md
│   ├── CONFIG_MULTI_LOGIN_ANALYSIS.md
│   ├── CONFIG_STORAGE_ANALYSIS.md
│   └── llm-server/
│       └── LLAMA_CPP_SERVER_SPEC.md
│
├── 05-testing-quality/           # 테스팅 & 품질
│   └── TESTING_GUIDE.md
│
├── 06-troubleshooting/           # 문제 해결
│   ├── CLI_TROUBLESHOOTING_PRESENTATION.md
│   ├── CLI_TOP3_TROUBLESHOOTING.md
│   ├── PORT_CONFLICT_SOLUTION.md
│   └── ADAPTER_MODEL_BUG_FIX.md
│
├── 07-guidelines-policies/       # 가이드라인 & 정책
│   ├── DOCUMENTATION_POLICY.md
│   ├── ENGINEERING_GUIDELINES.md
│   └── RELEASE_NOTES_TEMPLATE.md
│
├── 08-planning-proposals/        # 계획 & 제안
│   ├── CLAUDE_CODE_ADAPTER_PLAN.md
│   ├── IMPROVEMENT_PROPOSALS_7_4.md
│   ├── DEPENDENCY_WORKFLOW.md
│   └── PTY_SESSION_CONTROLLER_PLAN/
│       └── FILE_LEVEL_WORK_TABLE.md
│
└── my-docs/                      # 내부용 일일 로그 (Push 금지)
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

## 분류 기준

| 폴더 | 목적 | 주제 |
|------|------|------|
| **01-architecture** | 시스템 설계 이해 | 전체 구조, 파이프라인, API, 스키마 |
| **02-token-efficiency** | 토큰 최적화 이해 | 토큰 계산, 압축, LLM별 컨텍스트 |
| **03-roles-workflow** | 역할 및 워크플로우 | Role1/2/3, 규칙, 의존성 |
| **04-setup-deployment** | 환경 구성 & 배포 | 설정, LLM 서버, 버전 관리 |
| **05-testing-quality** | 테스트 & 품질 보증 | 테스팅 전략, 체크리스트 |
| **06-troubleshooting** | 문제 해결 | 버그, 이슈, 해결 방법 |
| **07-guidelines-policies** | 규칙 & 정책 | 코딩 가이드, 릴리스 정책 |
| **08-planning-proposals** | 향후 계획 | 개선안, 계획, 제안 |
| **my-docs** | 내부용 (보안) | 일일 로그, TMUX 자동화 (Git 제외) |

## 정렬 규칙

- 숫자 접두사: 논리적 순서 (아키텍처 → 토큰 → 역할 → 설정 → 테스트 → 문제 해결 → 가이드 → 계획)
- 폴더명: kebab-case (소문자, 하이픈 구분)
- 파일명: UPPER_SNAKE_CASE (기존 컨벤션 유지)

## 마이그레이션 계획

1. 새로운 폴더 구조 생성
2. 기존 파일 이동
3. 문서 인덱스(INDEX.md) 생성
4. README.md 업데이트
