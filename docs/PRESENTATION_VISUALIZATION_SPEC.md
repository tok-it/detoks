# 발표 시각화 작업 명세서

기준일: 2026-04-29

이 문서는 다른 워크스페이스로 옮겨가서 바로 시각화 작업을 시작할 수 있도록,
현재 레포의 코드와 데이터 기준으로 필요한 정의, 계산식, 데이터 출처, 차트 설계를
한 곳에 모아둔 문서입니다.

## 1. 목적

시각화 대상은 아래 5개입니다.

1. task 자연어 분류 메소드 성능
2. 번역 / 압축 프롬프트 토큰 감소율
3. 번역 모델 품질 비교
4. 번역 프롬프트 설계 단계별 결과 차이
   - 단순 번역 프롬프트
   - 지침 구체화
   - placeholder 기반 마스킹
   - span 단위 분리
   - few-shot 추가
5. 1B 미만 4bit 양자화 로컬 LLM 모델의 프롬프트 이탈율

이 문서는 구현 문서가 아니라, 시각화용 데이터셋과 지표 정의서입니다.
다른 워크스페이스에서 동일한 기준으로 그래프를 만들 수 있도록
계산 규칙과 해석 규칙까지 포함합니다.

## 2. 레포 기준 source of truth

아래 파일들이 시각화 지표의 기준입니다.

- [`src/core/task-graph/TaskGraphProcessor.ts`](../src/core/task-graph/TaskGraphProcessor.ts)
  - 현재 task 분류 baseline
  - 키워드 우선, 최후 fallback은 `execute`
- [`src/core/task-graph/TaskSentenceSplitter.ts`](../src/core/task-graph/TaskSentenceSplitter.ts)
  - 문장 분리 baseline
  - 멀티 task 입력을 sentence 단위로 쪼갤 때 사용
- [`src/core/guardrails/validator.ts`](../src/core/guardrails/validator.ts)
  - 번역 / 압축 검증 기준
  - `validate_translation()`
  - `validate_adapter_output()`
- [`src/core/prompt/compression.ts`](../src/core/prompt/compression.ts)
  - 압축 안전성 판단
  - `normalized_input` 과 `compressed_prompt` 관계 정의
- [`src/core/prompt/compiler.ts`](../src/core/prompt/compiler.ts)
  - `raw_input -> normalized_input -> compressed_prompt` 흐름
- [`scripts/verify-role1.ts`](../scripts/verify-role1.ts)
  - 토큰 감소율 계산 스크립트
  - `tiktoken`의 `o200k_base` 사용
- [`datasets/validation/*`](../datasets/validation)
  - task 분류용 정답 라벨 데이터
- [`tests/data/row_data.json`](../tests/data/row_data.json)
  - Role 1 번역 / 압축 검증용 벤치마크 데이터

## 3. 공통 메트릭 정의

### 3.1 토큰 카운트 기준

`scripts/verify-role1.ts` 기준으로 토큰 수는 `tiktoken`의 `o200k_base` 인코딩으로 계산합니다.

즉, 발표자료에 들어가는 토큰 수는 LLM runtime tokenizer가 아니라,
검증 스크립트와 같은 기준으로 계산해야 합니다.

### 3.2 토큰 감소율 공식

아래 세 지표를 분리해서 써야 합니다.

```text
translation_reduction_rate = ((raw_input_tokens - normalized_input_tokens) / raw_input_tokens) * 100
compression_reduction_rate = ((normalized_input_tokens - compiled_prompt_tokens) / normalized_input_tokens) * 100
total_reduction_rate = ((raw_input_tokens - compiled_prompt_tokens) / raw_input_tokens) * 100
```

정의:

- `raw_input_tokens`
  - 원본 입력의 토큰 수
- `normalized_input_tokens`
  - 번역 / 정규화 후 토큰 수
- `compiled_prompt_tokens`
  - 압축 후 최종 프롬프트 토큰 수

주의:

- 값은 반올림 전 계산 후 소수점 3자리로 반올림합니다.
- 입력보다 출력이 길면 음수가 나올 수 있습니다.
- 분모가 0이거나 토큰 수가 유효하지 않으면 `null`로 둡니다.
- summary 평균은 `null`을 제외하고 계산합니다.

### 3.3 검증 오류 해석 기준

#### 번역 / 정규화 검증 오류

`validate_translation()`가 반환하는 대표 오류는 아래와 같습니다.

- `placeholder_count_mismatch`
- `placeholder_order_mismatch`
- `forbidden_pattern:<pattern>`
- `required_term_missing:<term>`
- `required_literal_missing:<literal>`
- `length_ratio_out_of_bounds`
- `korean_text_remaining`
- `source_korean_copied`

오류 해석은 다음처럼 묶는 편이 좋습니다.

- 구조 오류
  - placeholder count / order 불일치
- 정책 오류
  - forbidden pattern 위반
  - required term / literal 누락
- 언어 드리프트
  - 한글 잔존
  - 소스 한글 복사
- 길이 이상
  - 지나치게 길거나 짧음

#### 실행 출력 검증 오류

`validate_adapter_output()`가 반환하는 warning code는 아래 4개입니다.

- `empty_output`
- `error_pattern_detected`
- `possible_truncation`
- `suspiciously_short_output`

이것은 semantic fidelity 검사가 아니라, 실행 직후의 경량 품질 신호입니다.

## 4. 데이터셋 정리

### 4.1 task 분류용 데이터셋

`datasets/validation/<label>/<file>.json` 구조를 사용합니다.

규칙:

- 정답 라벨은 파일 내용이 아니라 **상위 폴더명**입니다.
- 파일명은 난이도 버킷입니다.
  - `1task.json`
  - `2task.json`
  - `3+task.json`
  - `messy.json`
- 각 JSON은 `data: string[]` 형태입니다.

라벨 의미는 현재 레포의 task type 정의와 맞춰야 합니다.

| label | 의미 요약 | 총 샘플 수 | 비고 |
|---|---|---:|---|
| `explore` | 정보 찾기 / 위치 찾기 | 260 | 균형 데이터 |
| `analyze` | 해석 / 원인 / 관계 분석 | 260 | 균형 데이터 |
| `create` | 새 산출물 생성 | 260 | 균형 데이터 |
| `modify` | 기존 산출물 변경 | 210 | 다른 라벨보다 적음 |
| `validate` | 정확성 / 통과 여부 검증 | 260 | 균형 데이터 |
| `execute` | 명령 / 워크플로우 실행 | 260 | 균형 데이터 |
| `document` | 설명 / 요약 / 문서화 | 260 | 균형 데이터 |
| `plan` | 분해 / 순서 / 전략 수립 | 260 | 균형 데이터 |

총 샘플 수는 **2030개**입니다.

### 4.2 난이도 버킷별 분포

| label | 1task | 2task | 3+task | messy | 합계 |
|---|---:|---:|---:|---:|---:|
| `explore` | 100 | 100 | 50 | 10 | 260 |
| `analyze` | 100 | 100 | 50 | 10 | 260 |
| `create` | 100 | 100 | 50 | 10 | 260 |
| `modify` | 50 | 100 | 50 | 10 | 210 |
| `validate` | 100 | 100 | 50 | 10 | 260 |
| `execute` | 100 | 100 | 50 | 10 | 260 |
| `document` | 100 | 100 | 50 | 10 | 260 |
| `plan` | 100 | 100 | 50 | 10 | 260 |

해석 포인트:

- `modify`만 소폭 부족합니다.
- `messy`는 샘플 수가 적지만 난이도가 높아 stress set으로 보기 좋습니다.
- macro 지표를 쓰는 편이 micro 지표보다 공정합니다.

### 4.3 Role 1 벤치마크 데이터

`tests/data/row_data.json`

- 총 106개 입력
- Role 1 번역 / 압축 / 검증 지표의 기준 세트
- 현재 검증 스크립트 `scripts/verify-role1.ts`의 기본 입력

이 데이터셋은 task 분류용이 아니라, 번역 / 압축 / validation 시각화용입니다.

## 5. 시각화 1: task 자연어 분류 메소드 성능

### 5.1 무엇을 측정할 것인가

이 시각화는 "자연어 요청을 task type으로 얼마나 잘 나누는가"를 보여줍니다.

현재 레포의 baseline은 `TaskGraphProcessor.classifyType()`입니다.

이 baseline은 semantic parser가 아니라 **키워드 우선 rule-based classifier**입니다.
따라서 그래프에서는 baseline과 fine-tuned classifier를 직접 비교하는 구성이 가장 자연스럽습니다.

### 5.2 정답 라벨 정의

정답은 `datasets/validation/<label>`의 폴더명입니다.

예시:

- `datasets/validation/analyze/*.json` -> 정답 라벨 `analyze`
- `datasets/validation/plan/*.json` -> 정답 라벨 `plan`

### 5.3 권장 평가 단위

#### 1) prompt-level 평가

권장 기본 단위입니다.

- 샘플 1개 = 원본 prompt 1개
- gold label = 상위 폴더명
- prediction = 분류기 1회 결과

이 방식이 fine-tune 데이터 정답지와 가장 잘 맞습니다.

#### 2) sentence-level 평가

보조 지표로만 사용합니다.

- `TaskSentenceSplitter.split()` 후 sentence 단위로 분류
- sentence마다 원본 prompt의 label을 상속

이 방식은 내부 baseline 분석에는 유용하지만,
발표에서는 prompt-level이 더 직관적입니다.

### 5.4 권장 지표

- Accuracy
- Macro Precision
- Macro Recall
- Macro F1
- Per-label Precision / Recall / F1
- Confusion Matrix
- Error rate by difficulty bucket
- Error rate by prompt length bucket

### 5.5 추천 차트

1. 라벨별 막대 그래프
   - x축: label
   - y축: accuracy 또는 F1
2. confusion matrix heatmap
   - 행: gold label
   - 열: predicted label
3. 난이도 버킷별 성능 그래프
   - `1task`, `2task`, `3+task`, `messy`
4. baseline vs fine-tuned 비교 막대그래프
   - baseline: `TaskGraphProcessor.classifyType()`
   - candidate: fine-tuned classifier

### 5.6 해석 포인트

- `messy`에서 성능이 흔들리면, 실제 사용자 입력 내성 부족을 의미합니다.
- `modify`는 샘플 수가 적어서 과적합 / 과소학습 가능성을 따로 봐야 합니다.
- `execute`와 `validate`, `analyze`와 `plan` 사이 혼동이 자주 생기기 쉽습니다.

## 6. 시각화 2: 번역 / 압축 프롬프트 토큰 감소율

### 6.1 무엇을 측정할 것인가

`scripts/verify-role1.ts`가 만들어내는 세 가지 토큰 감소율을 그대로 시각화합니다.

- 번역 감소율
- 압축 감소율
- 총 감소율

### 6.2 사용 데이터

- 입력: `tests/data/row_data.json`
- 검증 결과: `scripts/verify-role1.ts --output ...`

### 6.3 출력 필드

검증 스크립트에서 바로 쓸 수 있는 주요 필드는 아래입니다.

- `raw_input`
- `ph_masked_input`
- `normalized_input`
- `compiled_prompt`
- `role2_handoff`
- `input_prompt_tokens`
- `normalized_input_tokens`
- `compiled_prompt_tokens`
- `token_reduction_rate`
- `translation_token_reduction_rate`
- `compression_token_reduction_rate`
- `validation_errors`
- `repair_actions`
- `inference_time_sec`

### 6.4 계산 규칙

`raw_input_tokens` = `input_prompt_tokens`

`normalized_input_tokens` = 번역 / 정규화 후 토큰 수

`compiled_prompt_tokens` = 압축 후 토큰 수

공식:

```text
translation_reduction_rate = ((input_prompt_tokens - normalized_input_tokens) / input_prompt_tokens) * 100
compression_reduction_rate = ((normalized_input_tokens - compiled_prompt_tokens) / normalized_input_tokens) * 100
total_reduction_rate = ((input_prompt_tokens - compiled_prompt_tokens) / input_prompt_tokens) * 100
```

### 6.5 추천 차트

1. 3단계 funnel / waterfall
   - 원문 토큰
   - 번역 후 토큰
   - 압축 후 토큰
2. 샘플별 줄기그래프 또는 dot plot
   - x축: 샘플 index
   - y축: 감소율
3. 분포 그래프
   - histogram / violin / box plot
4. validation error와 감소율의 산점도
   - 너무 공격적인 압축이 실패와 연결되는지 확인

### 6.6 해석 포인트

- 번역 감소율이 크다고 좋은 것은 아닙니다.
  - 번역 단계에서 이미 의미가 손상되면 안 됩니다.
- 압축 감소율이 크다고 좋은 것도 아닙니다.
  - `compression_fallback_to_normalized_input`가 늘면 사실상 압축 실패입니다.
- 총 감소율은 최종 사용자 이득을 보여주지만,
  번역 손실과 압축 손실을 분리해서 봐야 합니다.

## 7. 시각화 3: 번역 모델 품질 비교

### 7.1 방향 정리

레포의 실제 번역 파이프라인은 **한국어 -> 영어**입니다.

따라서 아래 모델 비교도 발표 자료에서는
`한 -> 영` 번역 품질 비교로 적는 것이 코드와 맞습니다.

사용자 초안의 "영-한" 표현은 방향이 뒤집혀 있지만,
모델 ID는 `ko-en` / `kor-eng` 계열이므로 평가 축은 한 -> 영으로 통일하는 편이 좋습니다.

### 7.2 비교할 모델

- `uickmt/quickmt-ko-en`
- `Helsinki-NLP/opus-mt-ko-en`
- `Helsinki-NLP/opus-mt_tiny-kor-eng`
- `facebook/mbart-large-50-many-to-many-mmt`

### 7.3 권장 평가 세트

- 기본 세트: `tests/data/row_data.json`
  - 106개
  - 실제 Role 1 입력과 가장 가까움
- 보조 세트: `datasets/validation/*`
  - task 분류용 문장도 번역 성능 비교에 추가 가능
  - 다만 목적이 다르므로 메인 그래프와 보조 그래프를 분리하는 편이 좋음

### 7.4 검증 방식

번역 품질 평가는 `validate_translation()` 결과를 사용합니다.

검증은 번역 결과를 다음 기준으로 평가합니다.

- placeholder 보존
- forbidden pattern 위반 여부
- required term / literal 누락 여부
- 한글 잔존 여부
- source 한글 복사 여부
- 비정상적인 길이 변화 여부

### 7.5 권장 지표

기본적으로 아래를 기록합니다.

- final validation failure rate
- validation error count per sample
- fallback span count
- repair action count
- average inference time

추가로 error family별 비율을 같이 보여주면 좋습니다.

- structural errors
  - placeholder count/order mismatch
- lexical policy errors
  - forbidden pattern
  - required term / literal missing
- language drift
  - `korean_text_remaining`
  - `source_korean_copied`
- length anomaly
  - `length_ratio_out_of_bounds`

### 7.6 추천 차트

1. 모델별 validation failure rate 막대그래프
2. 모델별 error family stack bar
3. 모델별 fallback span count box plot
4. 모델별 inference time vs failure rate 산점도
5. 샘플별 radar / heatmap
   - 너무 많은 세부 항목이 있으면 보조 슬라이드로 분리

### 7.7 해석 포인트

- 최종 validation failure rate가 낮을수록 좋습니다.
- fallback이 많으면, 초안 번역이 불안정하다는 뜻입니다.
- `required_literal_missing`가 많으면 기술 토큰 보존 능력이 약하다는 뜻입니다.
- `korean_text_remaining`가 많으면 번역 자체가 덜 깨끗합니다.

### 7.8 번역 프롬프트 설계 단계별 결과 차이

이 항목은 번역 품질 비교와 별개로, **프롬프트 설계가 결과에 어떤 차이를 만드는지** 보여주는 ablation 시각화입니다.

사용자 제안의 순서인

1. 단순 번역 프롬프트
2. 지침 구체화
3. placeholder 기반 마스킹
4. span 단위 분리
5. few-shot 추가

를 그대로 쓰되, 레포 구조상 실제 구현에 존재하는 **전처리 / 후처리 단계**를 같이 반영해야 합니다.

#### 7.8.1 레포 기준 실제 흐름

현재 번역 파이프라인은 단순히 "번역 프롬프트를 바꾸는 것"보다 더 많습니다.

실제 순서는 다음에 가깝습니다.

1. 입력 정규화
2. protected segment masking
   - `protected_terms`
   - `preferredTranslations`
   - `model_names`
3. translatable span 추출
4. span별 translation prompt 생성
   - `TRANSLATION_SYSTEM_PROMPT`
   - `formatPlaceholderGuidance()`
5. clean translation
6. validation
7. repair
8. fallback correction prompt
9. final retry
10. placeholder restore
11. final validation

즉, 시각화는 아래 두 축으로 나누는 것이 가장 정확합니다.

- **프롬프트 레이어**
  - 단순 번역 프롬프트
  - 지침 구체화
  - few-shot 추가
- **전처리 / 후처리 레이어**
  - placeholder 기반 마스킹
  - span 단위 분리
  - clean / repair / validation / fallback

#### 7.8.2 추천 비교 레벨

가장 보기 좋은 방식은 단계별 누적 비교입니다.

| 단계 | 비교 이름 | 레포 매핑 | 추가되는 요소 | 기대 효과 |
|---|---|---|---|---|
| A0 | minimal translation | baseline prompt only | `Translate the following text into English.` 수준의 최소 프롬프트 | 프롬프트만으로 생기는 기본 번역 품질 확인 |
| A1 | refined instructions | `TRANSLATION_SYSTEM_PROMPT` | output only, no explanations, preserve literals, do not shorten | 지침 강화가 드리프트를 얼마나 줄이는지 확인 |
| A2 | placeholder guidance | `formatPlaceholderGuidance()` | `__PH_xxxx__` 보호 지시 | placeholder order / count 안정성 확인 |
| A3 | masking + span split | `mask_protected_segments()` + `extract_translatable_spans()` | code / path / model / literal 보호 후 span별 번역 | 기술 토큰 보존과 긴 문장 안정성 확인 |
| A4 | cleaning + repair | `clean_translation()` + `repair_translation()` | code fence 제거, quoting 정리, placeholder 복구 | 후처리의 오류 복구 효과 확인 |
| A5 | few-shot added | 외부 실험용 variant | 예시 1~3개를 system prompt에 삽입 | 예시 기반 안정성 / 형식 일관성 확인 |
| A6 | fallback-aware | `FALLBACK_CORRECTION_PROMPT` + final retry | validation failure context 주입 | 실패 케이스 복구 효과 확인 |

주의:

- A0~A4는 레포 구조와 직접 맞닿아 있습니다.
- A5 few-shot은 **현재 레포에 고정된 구현은 아니므로**, 시각화용 외부 실험 축으로 두는 것이 맞습니다.
- A6는 "프롬프트 품질"과 별개로 "실패 복구 능력"을 보여주는 축입니다.

#### 7.8.3 몇 개의 그래프로 나눠야 하나

이 실험은 한 장에 다 넣으면 읽기 어렵습니다.

권장 분할은 아래 3개입니다.

1. **누적 개선 그래프**
   - x축: A0 ~ A6
   - y축: validation failure rate / required_literal_missing rate / korean_text_remaining rate
2. **토큰 및 시간 그래프**
   - x축: A0 ~ A6
   - y축: 평균 토큰 수, 평균 inference time
3. **대표 샘플 비교 카드**
   - code/path/placeholder가 섞인 샘플 3~5개
   - 각 단계별 출력 side-by-side 표시

#### 7.8.4 꼭 같이 봐야 하는 지표

이 ablation은 단순 BLEU 같은 번역 점수보다 아래 지표가 더 중요합니다.

- `korean_text_remaining`
- `source_korean_copied`
- `placeholder_count_mismatch`
- `placeholder_order_mismatch`
- `required_literal_missing:*`
- `validation failure rate`
- `fallback_span_count`
- `repair action count`
- `inference_time_sec`
- `output length`

실험을 공정하게 비교하려면 아래 통제 변수도 고정해야 합니다.

- `temperature`
- `translationMaxAttempts`
- `requestTimeout`
- 동일한 base model
- 동일한 input set
- 동일한 placeholder 정책
- 동일한 `forbiddenPatterns` / `preferredTranslations`

#### 7.8.5 레포 구조 기준으로 빠뜨리기 쉬운 항목

다음은 사용자가 제안한 순서에는 보이지 않지만, 실제 레포에서는 결과 차이를 크게 만드는 요소입니다.

- 입력 정규화
  - `normalizeInput()` / `normalize_input`
- protected segment 범위
  - code block
  - inline code
  - url
  - file path
  - filename
  - model name
  - numeric token
  - slash token
  - qualified identifier
- `preferredTranslations`
  - 용어를 명시 번역으로 고정하는 정책
- `clean_translation()`
  - translation label, code fence, outer quote 정리
- `repair_translation()`
  - placeholder 형식 복구
  - placeholder order 복구
  - forbidden pattern 제거
- fallback retry
  - validation 실패 컨텍스트를 넣어서 다시 번역
- final validation
  - restored text 기준으로 최종 검증

이 항목들은 프롬프트 자체가 아니라 파이프라인 품질에 영향을 주므로,
시각화에서는 "프롬프트 계층"과 "파이프라인 계층"을 구분해서 표시하는 편이 좋습니다.

## 8. 시각화 5: 1B 미만 4bit 양자화 로컬 LLM 프롬프트 이탈율

### 8.1 무엇을 의미하는가

이 지표는 local LLM이 주어진 프롬프트를 얼마나 잘 따라가는지의 **프록시 지표**입니다.

현재 레포에는 semantic judge가 없으므로,
실행 출력 품질 검증용 `validate_adapter_output()`를 기준으로 측정합니다.

즉, 이 지표는 "정답 여부"가 아니라 "이탈 신호가 잡히는 비율"입니다.

### 8.2 비교할 모델

- `llama-3.2-1b-instruct`
- `qwen3-0.6b`
- `lmstudio-community/qwen3.5-0.8b`

### 8.3 검증 기준

출력 하나당 `validate_adapter_output(rawOutput)`를 실행합니다.

warning code는 아래 4개입니다.

- `empty_output`
- `error_pattern_detected`
- `possible_truncation`
- `suspiciously_short_output`

### 8.4 권장 지표

- warning item rate
  - warning이 하나라도 있는 sample 비율
- warning density
  - sample당 warning 평균 개수
- code별 rate
  - 각 warning code의 비율
- 모델별 평균 raw output 길이
- 모델별 inference time

### 8.5 추천 차트

1. 모델별 warning item rate 막대그래프
2. warning code별 stacked bar
3. output length 분포 box plot
4. prompt 유형별 warning rate
   - 짧은 프롬프트
   - 긴 프롬프트
   - 실행형 프롬프트

### 8.6 해석 포인트

- 이 지표는 semantic fidelity를 완전히 측정하지 못합니다.
- 대신 "출력이 깨졌는가", "짧게 끊겼는가", "에러 패턴이 보이는가"를 빠르게 보여줍니다.
- local 1B급 모델 비교에서는 이 프록시 지표만으로도 발표 메시지를 만들 수 있습니다.

## 9. 통합 데이터 스키마 제안

다른 워크스페이스에서 CSV / JSON / Parquet 중 무엇을 쓰든,
아래 필드들은 공통으로 유지하는 편이 좋습니다.

```ts
type VisualizationRow = {
  sample_id: string;
  benchmark: "classification" | "role1_tokens" | "translation_model" | "local_llm";
  source_file?: string;
  difficulty_bucket?: "1task" | "2task" | "3+task" | "messy";
  gold_label?: "explore" | "create" | "modify" | "analyze" | "validate" | "execute" | "document" | "plan";
  predicted_label?: string;
  raw_input: string;
  ph_masked_input?: string;
  normalized_input?: string;
  compiled_prompt?: string;
  input_prompt_tokens?: number;
  normalized_input_tokens?: number;
  compiled_prompt_tokens?: number;
  translation_reduction_rate?: number | null;
  compression_reduction_rate?: number | null;
  total_reduction_rate?: number | null;
  translation_model?: string;
  adapter_model?: string;
  validation_errors?: string[];
  adapter_warning_codes?: string[];
  inference_time_sec?: number;
};
```

### 필드 설명

- `sample_id`
  - 고유 식별자
- `benchmark`
  - 어떤 시각화용 데이터인지 구분
- `source_file`
  - 원본 JSON 파일명
- `difficulty_bucket`
  - `datasets/validation`의 파일명 버킷
- `gold_label`
  - task 분류 정답 라벨
- `predicted_label`
  - 분류기 예측값
- `ph_masked_input`
  - Role 1 마스킹 결과
- `validation_errors`
  - 번역 / 압축 검증 결과
- `adapter_warning_codes`
  - 실행 출력 검증 결과

## 10. 추출 / 집계 추천 순서

1. task 분류용 데이터셋을 label / difficulty 버킷으로 정리한다.
2. `tests/data/row_data.json`으로 Role 1 검증 결과를 생성한다.
3. 번역 모델별 결과를 같은 스키마로 저장한다.
4. local LLM 모델별 출력 warning을 같은 스키마로 저장한다.
5. 각 benchmark를 따로 시각화한 뒤, 마지막에 하나의 비교 슬라이드로 묶는다.

## 11. 발표 슬라이드 추천 순서

1. task 분류 성능
   - baseline vs fine-tuned
2. 번역 / 압축 토큰 감소
   - 전체 파이프라인 효율
3. 번역 모델 품질 비교
   - 어떤 번역 모델이 가장 덜 무너지는가
4. 번역 프롬프트 설계 단계별 결과 차이
   - prompt only / instruction / masking / span split / few-shot
5. 1B 미만 local LLM 프롬프트 이탈율
   - 어떤 모델이 가장 자주 출력이 흔들리는가

## 12. 바로 쓸 수 있는 핵심 요약

- task 분류 정답 라벨은 `datasets/validation/<label>`의 폴더명이다.
- 토큰 감소율은 `scripts/verify-role1.ts`와 동일하게 `o200k_base` 기준으로 계산한다.
- 번역 품질은 `validate_translation()`의 final validation errors로 판단한다.
- 번역 프롬프트 ablation은 prompt layer와 pipeline layer를 분리해서 봐야 한다.
- 로컬 LLM 프롬프트 이탈은 `validate_adapter_output()` warning rate를 프록시로 쓴다.
- 레포의 번역 방향은 한국어 -> 영어이므로, 발표 문구도 그 방향으로 맞추는 편이 좋다.
