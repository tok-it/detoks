# 🔄 Pipeline

## Overview

detoks operates as a **stage-based pipeline** from input to output.
<!-- 한국어 설명: detoks는 입력부터 결과 반환까지 여러 단계를 순차적으로 거치는 파이프라인 구조로 동작합니다. -->

---

## Stages

### 1. Prompt Compiler
- Compress Korean input into concise English prompts
<!-- 한국어 설명: Prompt Compiler는 한국어 입력을 더 짧고 효율적인 영어 프롬프트로 압축합니다. -->

---

### 2. Request Analyzer
- Classify the request
- Extract tasks
<!-- 한국어 설명: Request Analyzer는 요청의 성격을 분류하고 필요한 작업 단위를 추출합니다. -->

---

### 3. Task Graph Builder
- Decompose the work
- Define dependencies
<!-- 한국어 설명: Task Graph Builder는 작업을 세분화하고 작업 간 의존 관계를 정의합니다. -->

---

### 4. Context Optimizer
- Remove duplication
- Preserve essential information
<!-- 한국어 설명: Context Optimizer는 중복 정보를 제거하면서 핵심 문맥은 유지합니다. -->

---

### 5. Executor
- Run the LLM CLI
<!-- 한국어 설명: Executor는 실제로 Codex나 Gemini 같은 LLM CLI를 실행하는 단계입니다. -->

---

### 6. Output Processor
- Summarize outputs
- Structure results
<!-- 한국어 설명: Output Processor는 모델 결과를 요약하고 후속 처리에 적합한 형태로 구조화합니다. -->

---

### 7. State Manager
- Persist state
- Prepare for the next turn
<!-- 한국어 설명: State Manager는 현재 상태를 저장하고 다음 턴에서 이어서 작업할 수 있도록 준비합니다. -->

---

## Flow

Input → Analyze → Execute → Compress → Store → Next
<!-- 한국어 설명: 전체 흐름은 입력 분석, 실행, 압축, 저장, 다음 턴 준비 순서로 이어집니다. -->

---
