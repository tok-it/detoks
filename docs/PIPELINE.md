# 🔄 Pipeline

## Overview

detoks operates as a **stage-based pipeline** from input to output.

<!-- 한국어 설명: detoks는 입력부터 결과 반환까지 여러 단계를 순차적으로 거치는 파이프라인 구조로 동작합니다. -->

---

## Stages

### 1. Prompt Compiler

- Mask protected segments
- Translate Korean input to English
- Preserve code, paths, commands, JSON keys, API names, model names, and Markdown units
- Analyze translated English text through the NLP adapter
- Remove duplicate sentences, verbose background, and low-information phrases
- Produce `compressed_prompt`
- Validate the compressed output through guardrails
<!-- 한국어 설명: Prompt Compiler는 보호 구간을 먼저 분리하고, 번역 후 영어 텍스트에 대해 NLP adapter 기반 압축을 수행합니다. v1에서는 LLM 또는 소형 언어 모델 압축을 사용하지 않습니다. -->

---

### 2. Translation Guardrails

- Validate protected terms, placeholders, numeric constraints, filenames, commands, and completion criteria
- Treat Korean text copied unchanged into translated output as a translation failure
- Retry failed translation spans up to 5 total requests including fallback requests
- Fall back to translated text or conservative rule-compressed output when NLP compression is unsafe
<!-- 한국어 설명: Translation Guardrails는 압축 전후 필수 정보 보존 여부를 검증하고, 한글이 그대로 출력된 번역 실패를 감지하며, 실패 span은 fallback 포함 최대 5회까지 재요청합니다. NLP 압축 결과가 안전하지 않으면 보수적인 결과로 되돌립니다. -->

---

### 3. Request Analyzer

- Classify the compiled request
- Extract keywords and candidate tasks
- Use `docs/TYPE_DEFINITION.md` as the semantic source of truth for the eight top-level task types
<!-- 한국어 설명: Request Analyzer는 Role 2.1 책임이며, Role 1이 전달한 `compiled_prompt` 문자열을 받아 요청 분류와 후보 작업 추출을 수행합니다. -->

---

### 4. Task Graph Builder

- Decompose the work
- Define dependencies
<!-- 한국어 설명: Task Graph Builder는 요청을 작업으로 분류·세분화하고 작업 간 의존 관계를 정의합니다. -->

---

### 5. Context Optimizer

- Remove duplication
- Preserve essential information
<!-- 한국어 설명: Context Optimizer는 중복 정보를 제거하면서 핵심 문맥은 유지합니다. -->

---

### 6. Executor

- Run the LLM CLI
<!-- 한국어 설명: Executor는 실제로 Codex나 Gemini 같은 LLM CLI를 실행하는 단계입니다. -->

---

### 7. Output Processor

- Summarize outputs
- Structure results
<!-- 한국어 설명: Output Processor는 모델 결과를 요약하고 후속 처리에 적합한 형태로 구조화합니다. -->

---

### 8. State Manager

- Persist state
- Prepare for the next turn
<!-- 한국어 설명: State Manager는 현재 상태를 저장하고 다음 턴에서 이어서 작업할 수 있도록 준비합니다. -->

---

## Flow

Input → Translate → Compress → Validate → Analyze → Task Graph → Context → Execute → Store → Next

<!-- 한국어 설명: 전체 흐름은 입력 번역, 압축, 검증, 요청 분석, 작업 그래프 생성, 문맥 구성, 실행, 저장, 다음 턴 준비 순서로 이어집니다. -->

---
