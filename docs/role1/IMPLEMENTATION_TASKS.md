# Role 1 구현 Task

## 목적

`docs/PROJECT_STRUCTURE.md`, `docs/SCHEMAS.md`, `docs/SCHEMA_FLOW.md`, `docs/API_SPEC.md`, `docs/ROLES.md`를 기준으로 Role 1 구현 범위를 작업 단위로 정리한다.

Role 1의 책임은 다음으로 제한한다.

- 사용자 입력 보존
- 한국어/영어/혼합 입력 판정
- 한국어 → 영어 번역
- protected segment masking / restore
- span-level translation
- translation validation / repair / fallback
- prompt compression
- `CompiledPrompt`, `Role2PromptInput` 생성
- batch result JSON 기록

다음은 Role 1 범위에서 제외한다.

- request classification
- task decomposition
- task id 생성
- `depends_on` 생성
- task graph 생성
- context selection
- adapter 실행
- subprocess 실행

## 구현 원칙

- 최소 변경 원칙을 유지한다.
- Python에는 Role 1 애플리케이션 로직을 추가하지 않는다.
- 모든 모델 호출은 `src/core/llm-client` 경계만 사용한다.
- `src/core/translate`, `src/core/prompt`, `src/core/guardrails`, `src/core/llm-client`, `src/schemas`, `src/types` 안에서만 구현한다.
- `llm`, `small_model` 압축 provider는 v1에서 구현하지 않고 unsupported 처리한다.
- Role 1 결과에 task object 또는 `id`, `type`, `depends_on`를 추가하지 않는다.
- `CompiledSentences`가 남아 있더라도 공식 Role 1 → Role 2.1 handoff schema로 사용하지 않는다.

## 구현 대상 경로

- `src/core/translate`
- `src/core/prompt`
- `src/core/guardrails`
- `src/core/llm-client`
- `src/schemas`
- `src/types`
- `tests/ts/unit/core`
- `tests/ts/integration`

## 작업 목록

### 1. Role 1 출력 계약 정리

대상:
- `src/schemas/pipeline.ts`
- `src/types/index.ts`

할 일:
- `UserRequest`, `CompiledPrompt`, `Role2PromptInput`의 runtime schema와 export를 최신 명세 기준으로 확정한다.
- Role 1 전용 batch result schema가 필요하면 Role 2/3 schema와 분리해서 추가한다.
- `PromptCompressionProvider = "nlp_adapter" | "llm" | "small_model"` 타입을 반영하되 v1 지원값은 `nlp_adapter`만 허용한다.
- `PromptCompileResponse`에 맞춰 `compression_provider: "nlp_adapter"`를 반영한다.
- `normalized_input`, `compressed_prompt`가 영어 기준이라는 제약을 문서/타입에 맞춘다.
- `Role2PromptInput.compiled_prompt === CompiledPrompt.compressed_prompt` 제약을 반영한다.
- `CompiledSentences`가 남아 있으면 internal/legacy schema로 격리하고 공식 handoff 경계에서는 제외한다.
- task graph 관련 field가 Role 1 출력에 섞이지 않도록 막는다.

완료 조건:
- Role 1 산출물 검증이 Zod schema로 가능하다.
- Role 1 출력만으로 task graph field가 생성되지 않는다.
- Role 2.1 handoff가 `Role2PromptInput` 기준으로 고정된다.

### 2. 환경 변수 및 정책 파일 로더

대상:
- `src/core/translate`
- `src/core/prompt`
- `src/core/guardrails`

할 일:
- `.env` 기반 설정 로더를 만든다.
- `OPENAI_API_BASE`, `OPENAI_API_KEY`, `MODEL_NAME`, `PIPELINE_MODE`, `REQUEST_TIMEOUT`, `TRANSLATION_MAX_ATTEMPTS`, `TEMPERATURE`를 읽는다.
- `data/protected_terms.json`, `data/preferred_translations.json`, `data/forbidden_patterns.json` 로딩 경계를 만든다.
- 정책 파일이 없을 때 빈 정책 또는 validation error 처리 규칙을 구현한다.

완료 조건:
- 환경 변수만 바꿔 모델/엔드포인트 교체가 가능하다.
- 정책 파일 누락 시 pipeline이 비정상 종료되지 않고 규칙에 맞게 처리된다.

### 3. Protected Segment Masking

대상:
- `src/core/translate`

할 일:
- `mask_protected_segments()`
- `restore_placeholders()`
- `extract_translatable_spans()`
- placeholder 형식 `__PH_0001__` 보장
- protected term longest-to-shortest 적용
- `REST API` 같은 compound term을 단일 placeholder로 보호

보호 대상:
- code block
- inline code
- URL
- email
- JSON key
- filename
- directory path
- model name
- 숫자를 포함한 token
- uppercase abbreviation
- user-defined protected term
- preferred translation dictionary entry

완료 조건:
- placeholder 개수와 순서가 복원 전후 동일하다.
- code/path/command/JSON/Markdown 구조가 손상되지 않는다.

### 4. Span 분리와 재조립

대상:
- `src/core/translate`

할 일:
- blank line, heading, bullet, numbered item, paragraph, table row 기준 span 분리
- placeholder-only span은 API 호출 없이 그대로 유지
- code block span은 번역 대상에서 제외
- 재조립 시 paragraph boundary와 Markdown marker 보존

완료 조건:
- span reassembly 이후 source 구조가 불필요하게 깨지지 않는다.

### 5. LLM Client 경계 구현

대상:
- `src/core/llm-client`

할 일:
- OpenAI-compatible Chat Completions 요청/응답 래퍼 구현
- timeout, raw_response, inference_time_sec 기록
- llama.cpp 서버 세부 구현과 직접 결합하지 않는다.

완료 조건:
- 모든 Role 1 모델 호출이 `src/core/llm-client`를 통해서만 동작한다.

### 6. Primary Translation + Clean 단계

대상:
- `src/core/translate`

할 일:
- span 단위 번역 orchestration 구현
- 기본 system prompt 적용
- `clean_translation()` 구현
- meta label, outer quote, 불필요한 code fence, source에 없던 numbering 제거

완료 조건:
- 번역 결과에서 placeholder가 변형되지 않는다.
- wrapper 문구가 제거되어도 의미는 바뀌지 않는다.

### 7. Validator / Repair / Fallback

대상:
- `src/core/guardrails`
- `src/core/translate`

할 일:
- placeholder count/order 검증
- protected term 보존 검증
- forbidden pattern 제거 검증
- 과도한 길이 차이 검증
- 한글 원문이 그대로 남은 span 검출
- `repair_translation()` 구현
- 실패 span만 strict fallback prompt로 재요청
- `TRANSLATION_MAX_ATTEMPTS` 내 재시도 제어

완료 조건:
- `safe`/`debug` mode에서 validator, repair, fallback이 동작한다.
- 실패 span은 drop하지 않고 failure metadata로 남는다.

### 8. Prompt Compression 구현

대상:
- `src/core/prompt`
- `src/core/guardrails`

할 일:
- `nlp_adapter` 기반 압축 orchestration 구현
- sentence splitting / tokenization / keyword or noun phrase extraction / sentence importance scoring / redundancy detection를 adapter contract 뒤에 둔다.
- code/path/command/JSON/API/model/Markdown marker를 압축 대상에서 제외한다.
- 압축 결과가 unsafe하면 번역 결과 또는 보수적 rule-compressed output으로 fallback한다.
- `llm`, `small_model` provider 선택 시 unsupported provider error를 반환한다.

완료 조건:
- `compressed_prompt`가 영어 기준으로 유지된다.
- 숫자, 파일명, 명령어, 완료 조건, 금지 사항이 보존된다.

### 9. Role 2.1 Handoff 정렬

대상:
- `src/schemas`
- `src/types`

할 일:
- `Role2PromptInput` 생성기 또는 mapper를 구현한다.
- `CompiledPrompt.compressed_prompt`를 그대로 `Role2PromptInput.compiled_prompt`로 전달한다.
- 최신 명세상 공식 handoff가 sentence array가 아니라 단일 `compiled_prompt` 문자열임을 코드/테스트 기준에 반영한다.
- sentence splitting이 필요하면 NLP adapter 내부 보조 기능으로만 두고 공식 산출물로 노출하지 않는다.

완료 조건:
- Role 2.1이 요구하는 handoff 값이 최신 명세와 동일해진다.
- 공식 Role 1 산출물에 sentence array 의존성이 남지 않는다.

### 10. Batch Pipeline Result 구현

대상:
- `src/core/pipeline`
- `src/schemas`

할 일:
- batch input 처리 진입점 추가
- `run_metadata`와 `results[]` 구조 기록
- `debug` mode에서 `masked_text`, `placeholders`, `spans`, `fallback_span_count` 저장
- 실패 item을 drop하지 않고 결과 JSON에 남긴다.
- item 결과에는 최신 handoff 기준에 맞는 `CompiledPrompt`와 `Role2PromptInput` 기록을 우선한다.

완료 조건:
- `data_input.json` sample set을 batch 처리할 수 있다.
- 각 item에 input, preprocessing, compiled prompt, Role 2 handoff, inference time, status가 기록된다.

### 11. 테스트 작성

대상:
- `tests/ts/unit/core`
- `tests/ts/integration`

우선순위 테스트:
- protected segment masking / restore
- compound protected term masking
- span 분리 / 재조립
- clean 단계 wrapper 제거
- validator placeholder mismatch 검출
- repair placeholder/order 복구
- fallback retry 횟수 제한
- unsupported compression provider 처리
- `Role2PromptInput.compiled_prompt` 값 일치 검증
- sentence splitting이 외부 handoff schema로 노출되지 않는지 검증
- `safe` / `debug` mode 결과 차이
- batch failure item 보존

완료 조건:
- Role 1 핵심 흐름이 unit test와 integration test로 재현된다.

## 권장 구현 순서

1. schema / type 정리
2. env / policy loader
3. masking / span 분리
4. llm-client
5. primary translation / clean
6. validator / repair / fallback
7. prompt compression
8. Role 2.1 handoff 정렬
9. batch result writer
10. unit / integration tests

## 체크 포인트

- Role 1은 `CompiledPrompt`와 `Role2PromptInput`을 만든다.
- Role 2.1 책임인 task 분해 로직을 Role 1 구현 중에 끌어오지 않는다.
- Python은 llama server 전용으로 유지한다.
- `safe` mode가 기본이며 `debug`는 추가 기록만 확장한다.
- unsupported provider를 자동 fallback으로 실행하지 않는다.
- sentence splitting이 필요해도 공식 handoff schema는 `compiled_prompt` 문자열 하나로 유지한다.
- 문서와 현재 코드가 충돌하면 Role 1 범위 안에서만 최소 수정으로 정합성을 맞춘다.
