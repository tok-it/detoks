# 🏗 Architecture

## Overview

detoks is a **wrapper system** that operates in front of an LLM CLI.

<!-- 한국어 설명: detoks는 LLM CLI 앞단에서 동작하며, 사용자 요청을 정리하고 실행 흐름을 통제하는 래퍼 시스템입니다. -->

---

## End-to-End Flow

User Input  
↓  
Prompt Compiler  
↓  
Translation Guardrails
↓
Request Analyzer
↓  
Task Graph Builder  
↓  
Context Optimizer  
↓  
LLM CLI (Codex / Gemini)  
↓  
Output Processor  
↓  
State Manager  
↓  
User Output

<!-- 한국어 설명: 입력은 프롬프트 정제, 번역 검증/보정, 요청 분석, 작업 그래프 생성, 컨텍스트 최적화 단계를 거쳐 LLM CLI로 전달되고, 이후 결과 후처리와 상태 저장을 거쳐 사용자에게 반환됩니다. -->

---

## Layers

### 1. CLI Layer

- User interface
- REPL
<!-- 한국어 설명: CLI Layer는 사용자가 직접 상호작용하는 진입점이며, 명령 입력과 대화형 실행 환경을 담당합니다. -->

---

### 2. Core Layer

- Pipeline orchestration
- Prompt processing
- Translation guardrails
- Request analysis
- LLM client boundary
- State management
<!-- 한국어 설명: Core Layer는 전체 실행 순서를 조율하고, 세션 상태를 일관되게 관리하는 중심 계층입니다. -->

---

### 3. LLM Layer

- llama.cpp inference server
- Model loading and endpoint configuration
<!-- 한국어 설명: LLM Layer는 Python의 llama-server로 제한되며, 모델 로딩과 추론 endpoint 구성을 담당합니다. -->

---

### 4. Integration Layer

- CLI adapters
- Subprocess execution
<!-- 한국어 설명: Integration Layer는 외부 CLI와 연결되고 실제 프로세스를 실행하는 통합 계층입니다. -->

---

## Key Characteristics

- Unidirectional data flow
- State-driven execution
- Clear separation between model responsibilities and code responsibilities
<!-- 한국어 설명: 핵심 특징은 단방향 데이터 흐름, 상태 기반 실행, 그리고 모델과 코드의 역할 분리입니다. -->
