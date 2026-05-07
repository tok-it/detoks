# detoks 문서 인덱스

detoks 문서를 주제별로 찾기 쉽게 정리한 마스터 인덱스입니다.

## 문서 사용 방식

- [README.md](README.md): `docs/` 진입용 짧은 가이드
- `XX-*/INDEX.md`: 주제별 읽기 순서와 묶음 안내
- 개별 `.md`: 실제 명세 / 기록 / 계획 문서

## 먼저 읽을 핵심 문서

| 목적 | 문서 |
| --- | --- |
| 시스템 전체 구조 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| 런타임/폴더 경계 | [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) |
| 실행 흐름 | [PIPELINE.md](PIPELINE.md) |
| 데이터 계약 | [SCHEMAS.md](SCHEMAS.md) |
| 내부 API 계약 | [API_SPEC.md](API_SPEC.md) |
| 테스트 기준 | [TESTING_GUIDE.md](TESTING_GUIDE.md) |

## 카테고리별 문서 맵

### 1. Architecture

- 섹션 가이드: [01-architecture/INDEX.md](01-architecture/INDEX.md)
- 핵심 문서:
  - [ARCHITECTURE.md](ARCHITECTURE.md)
  - [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
  - [PIPELINE.md](PIPELINE.md)
  - [SCHEMAS.md](SCHEMAS.md)
  - [API_SPEC.md](API_SPEC.md)

### 2. Token Efficiency

- 섹션 가이드: [02-token-efficiency/INDEX.md](02-token-efficiency/INDEX.md)
- 핵심 문서:
  - [related-token/TOKEN_EFFICIENCY_ARCHITECTURE.md](related-token/TOKEN_EFFICIENCY_ARCHITECTURE.md)
  - [related-token/LLM_CONTEXT_WINDOW_COMPRESSION.md](related-token/LLM_CONTEXT_WINDOW_COMPRESSION.md)
  - [COMPRESSION_THRESHOLD_ANALYSIS.md](COMPRESSION_THRESHOLD_ANALYSIS.md)

### 3. Roles & Workflow

- 섹션 가이드: [03-roles-workflow/INDEX.md](03-roles-workflow/INDEX.md)
- 핵심 문서:
  - [ROLES.md](ROLES.md)
  - [CLI_WRAPPER_PIPELINE.md](CLI_WRAPPER_PIPELINE.md)
  - [ROLE1_PIPELINE_IMPROVEMENT_REQUIREMENTS.md](ROLE1_PIPELINE_IMPROVEMENT_REQUIREMENTS.md)
  - [ROLE2.2-HANDOFF-SESSION-PERSISTENCE-IMPROVEMENTS.md](ROLE2.2-HANDOFF-SESSION-PERSISTENCE-IMPROVEMENTS.md)

### 4. Setup & Deployment

- 섹션 가이드: [04-setup-deployment/INDEX.md](04-setup-deployment/INDEX.md)
- 핵심 문서:
  - [STACK_VERSIONS.md](STACK_VERSIONS.md)
  - [LLAMA_CPP_SERVER_SPEC.md](LLAMA_CPP_SERVER_SPEC.md)

### 5. Testing & Quality

- 섹션 가이드: [05-testing-quality/INDEX.md](05-testing-quality/INDEX.md)
- 핵심 문서:
  - [TESTING_GUIDE.md](TESTING_GUIDE.md)

### 6. Troubleshooting

- 섹션 가이드: [06-troubleshooting/INDEX.md](06-troubleshooting/INDEX.md)
- 핵심 문서:
  - [PORT_CONFLICT_SOLUTION.md](PORT_CONFLICT_SOLUTION.md)

### 7. Guidelines & Policies

- 섹션 가이드: [07-guidelines-policies/INDEX.md](07-guidelines-policies/INDEX.md)
- 핵심 문서:
  - [ENGINEERING_GUIDELINES.md](ENGINEERING_GUIDELINES.md)
  - [DOCUMENTATION_POLICY.md](DOCUMENTATION_POLICY.md)
  - [RELEASE_NOTES_TEMPLATE.md](RELEASE_NOTES_TEMPLATE.md)

### 8. Planning & Proposals

- 섹션 가이드: [08-planning-proposals/INDEX.md](08-planning-proposals/INDEX.md)
- 핵심 문서:
  - [REAL_MODE_PIPELINE_FLOW_PLAN.md](REAL_MODE_PIPELINE_FLOW_PLAN.md)
  - [CLAUDE_CODE_ADAPTER_PLAN.md](CLAUDE_CODE_ADAPTER_PLAN.md)
  - [CODEX_JSON_TRANSCRIPT_PLAN.md](CODEX_JSON_TRANSCRIPT_PLAN.md)
  - [CODEX_TOOLCALL_TRANSCRIPT_PLAN.md](CODEX_TOOLCALL_TRANSCRIPT_PLAN.md)

## source of truth 정리

| 주제 | 기준 문서 | 보조 문서 |
| --- | --- | --- |
| 전체 구조 | [ARCHITECTURE.md](ARCHITECTURE.md) | [CLI_WRAPPER_PIPELINE.md](CLI_WRAPPER_PIPELINE.md) |
| 파이프라인 단계 | [PIPELINE.md](PIPELINE.md) | [SHARED_DATA_FLOW.md](SHARED_DATA_FLOW.md), [SCHEMA_FLOW.md](SCHEMA_FLOW.md), [DES_DATA_FLOW.md](DES_DATA_FLOW.md) |
| 스키마 | [SCHEMAS.md](SCHEMAS.md) | [API_SPEC.md](API_SPEC.md), [SCHEMA_FLOW.md](SCHEMA_FLOW.md) |
| Task type 의미 | [TYPE_DEFINITION.md](TYPE_DEFINITION.md) | [API_SPEC.md](API_SPEC.md), [SCHEMAS.md](SCHEMAS.md) |
| 로컬 LLM 런타임 | [LLAMA_CPP_SERVER_SPEC.md](LLAMA_CPP_SERVER_SPEC.md) | [PORT_CONFLICT_SOLUTION.md](PORT_CONFLICT_SOLUTION.md) |
| 테스트 | [TESTING_GUIDE.md](TESTING_GUIDE.md) | 섹션별 테스트 파일 |

## 역사성 / 계획성 문서

아래 문서는 현재 동작 명세라기보다 계획, 비교, 마이그레이션 기록에 가깝습니다.

- [FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md)
- [FOLDER_STRUCTURE_MIGRATION.md](FOLDER_STRUCTURE_MIGRATION.md)
- [IMPROVEMENT_PROPOSALS_7_4.md](IMPROVEMENT_PROPOSALS_7_4.md)
- [ROLE-DEPENDENCY-CHANGES-2026-04-28.md](ROLE-DEPENDENCY-CHANGES-2026-04-28.md)
- [CODEX_REAL_STREAMING_SUMMARY.md](CODEX_REAL_STREAMING_SUMMARY.md)

## 추천 읽기 순서

1. [ARCHITECTURE.md](ARCHITECTURE.md)
2. [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
3. [PIPELINE.md](PIPELINE.md)
4. [SCHEMAS.md](SCHEMAS.md)
5. [API_SPEC.md](API_SPEC.md)
6. [TESTING_GUIDE.md](TESTING_GUIDE.md)
