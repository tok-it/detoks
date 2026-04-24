# 👥 Roles

## Role 1: AI Prompt Engineer


- Prompt compiler
- Korean-to-English translation
- Compressed English prompt handoff
<!-- 한국어 설명: AI Prompt Engineer는 프롬프트를 정제하고 한국어 입력을 영어로 변환한 뒤 압축된 영문 프롬프트 전문을 Role 2.1에 전달합니다. Task 분해, task type 지정, id 생성, depends_on 생성은 Role 2.1이 담당합니다. -->

---

## Role 2.1: Task Graph Engineer

- Request analysis
- Task decomposition
- Dependency management
- Execution order definition
<!-- 한국어 설명: Task Graph Engineer는 요청을 분석해 task type과 후보 task를 만들고, 작업을 세분화하며 의존성과 실행 순서를 설계합니다. task type 의미 기준은 docs/TYPE_DEFINITION.md를 따릅니다. -->

---

## Role 2.2: State & Context Engineer


- State management
- Context compression
- Result structuring
<!-- 한국어 설명: State & Context Engineer는 상태를 일관되게 관리하고, 문맥을 압축하며, 결과를 재사용 가능한 구조로 정리합니다. -->

---

## Role 3: CLI / System Engineer


- CLI implementation
- Subprocess execution
- Adapter management
<!-- 한국어 설명: CLI / System Engineer는 실제 CLI 구현, 외부 프로세스 실행, 어댑터 계층 관리를 담당합니다. -->
