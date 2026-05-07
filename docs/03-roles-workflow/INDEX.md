# 03-roles-workflow (역할 & 워크플로우)

Role1/Role2/Role3의 책임, 워크플로우, 규칙에 관한 문서

## 📑 파일 목록

- **WORKING_RULES.md** — detoks 프로젝트 작업 규칙
  - Git 워크플로우
  - PR 정책
  - 타입 체크, 테스트 규칙
  
- **ROLE1_PIPELINE_IMPROVEMENT_REQUIREMENTS.md** — Role 1 개선 요구사항
  - Prompt Compiler 개선사항
  - 프롬프트 검증
  
- **ROLE2.2-HANDOFF-SESSION-PERSISTENCE-IMPROVEMENTS.md** — Role 2.2 개선사항
  - Context Optimizer 개선
  - 세션 상태 관리
  
- **ROLE-DEPENDENCY-CHANGES-2026-04-28.md** — 역할 의존성 변경 기록

---

## 🎯 읽기 순서

1. **WORKING_RULES.md** — 전반적인 작업 규칙 이해
2. **ROLE1_PIPELINE_IMPROVEMENT_REQUIREMENTS.md** — Role 1의 책임과 개선점
3. **ROLE2.2-HANDOFF-SESSION-PERSISTENCE-IMPROVEMENTS.md** — Role 2.2의 책임
4. **ROLE-DEPENDENCY-CHANGES-2026-04-28.md** — 최신 변경 사항 확인

---

## 🔄 역할 분담

| 역할 | 책임 | 주요 파일 |
|------|------|---------|
| **Role 1** | 프롬프트 컴파일, 압축, 번역 | ROLE1_PIPELINE_IMPROVEMENT_REQUIREMENTS.md |
| **Role 2.1** | Task Graph 생성, 의존성 분석 | ROLE-DEPENDENCY-CHANGES-2026-04-28.md |
| **Role 2.2** | Context Optimizer, State Manager | ROLE2.2-HANDOFF-SESSION-PERSISTENCE-IMPROVEMENTS.md |
| **Role 3** | Executor, LLM 실행 | (api-spec 참고) |
