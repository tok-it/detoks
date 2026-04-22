# 🚀 detoks Project Kickoff Document

## 1. 프로젝트 개요

**detoks**는 LLM CLI(codex, gemini 등) 앞단에서 동작하는 **interactive wrapper shell**로,  
입력·출력·세션을 최적화하여 **토큰 사용을 줄이고 개발 효율을 극대화**하는 시스템이다.

> 핵심 철학:  
> **“LLM을 더 똑똑하게 만드는 것이 아니라, 덜 사용하게 만드는 것”**

---

## 2. 문제 정의 (Why)

- LLM 기반 개발에서 **불필요한 토큰 소비**가 지속적으로 발생
- 반복적인 컨텍스트 전달과 과도한 출력으로 **효율 저하**
- 토큰 제한으로 인해 **작업 흐름이 중단되는 문제 발생**

---

## 3. 해결 방향 (How)

- 입력을 구조적으로 재구성하여 불필요한 정보 제거
- 출력은 핵심 정보만 남기고 상태로 압축
- 세션 기반 상태 관리로 반복 작업 최소화
- 전체 워크플로우 단위에서 최적화 수행

---

## 4. 시스템 구조
User Input
↓
[1] Prompt Compiler
↓
[2] Request Analyzer
↓
[3] Context Optimizer
↓
[4] Task Graph Builder
↓
[5] Target CLI (codex / gemini)
↓
[6] Output Processor
↓
[7] State Manager
↓
User Output

---

## 5. 핵심 컴포넌트

### 5.1 Prompt Compiler
- 한국어 → 압축된 영어 프롬프트 변환
- 불필요한 표현 제거

---

### 5.2 Request Analyzer
- 단일 요청 vs 복합 요청 분류
- task 추출

---

### 5.3 Task Graph Builder
- task 분해
- 의존성(`depends_on`) 정의
- 실행 순서 결정

---

### 5.4 Context Optimizer
- 중복 제거
- 핵심 상태만 유지

---

### 5.5 Output Processor
- 설명 제거
- 핵심 추출
- 구조화(JSON)

---

### 5.6 State Manager
- 세션 상태 저장
- 다음 턴 컨텍스트 제공

---

## 6. 기술 스택

### 메인
- **TypeScript (Node.js)**

### 보조 (선택)
- Python (실험 및 평가)

### 주요 라이브러리
- zod (schema validation)
- child_process (CLI 실행)
- readline / prompts (REPL)
- fs (state 저장)

---

## 7. 역할 분담

### 🔵 Role 1: AI 프롬프트 엔지니어 (시호)
- Prompt Compiler
- Task extraction
- JSON schema 설계

---

### 🟢 Role 2.1: Task Graph & Workflow (지현)
- task graph 생성
- dependency 관리
- 실행 순서 결정

---

### 🟡 Role 2.2: State & Context (지호)
- context 구조화
- state 관리
- 요약 구조 설계

---

### 🔴 Role 3: CLI/시스템 엔지니어 (규철)
- CLI 인터페이스
- subprocess 실행
- adapter 구현

---

## 8. 핵심 데이터 구조

### Task
```ts
type Task = {
  id: string;
  type: "code_generation" | "review" | "test" | "fix";
  depends_on: string[];
};
