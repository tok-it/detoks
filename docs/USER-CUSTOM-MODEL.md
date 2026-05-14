# 사용자 지정 GGUF 모델 다운로드 기능 명세

## Context

현재 `/model` 진입 시 [src/cli/model-setup/models.ts:24](src/cli/model-setup/models.ts:24) 의 `TRANSLATION_MODELS` 배열에 사전 정의된 3개 모델(DeepSeek-R1-8B, Qwen3.5-4B, Qwen3.5-2B)만 노출된다. 사용자가 직접 다른 GGUF 모델(예: 더 작은/큰 양자화, 다른 한국어 특화 모델)을 시도하려면 코드를 수정해야 한다.

이를 해결하기 위해 모델 선택 메뉴에 **4번 항목 "사용자 지정 모델 설정(GGUF)"** 을 추가하고, 사용자가
1) HuggingFace 레포 주소를 입력하고
2) 해당 레포의 GGUF 파일에서 추출한 양자화 후보 중 하나를 골라

즉시 다운로드·환경설정·세션 기억까지 끝낼 수 있도록 한다.

대상: **공개(public) HF 레포**, 역할(`role`)은 기존과 동일하게 `"llm"`.

---

## 사용자 흐름 (목표 UX)

```
$ detoks
> /model

한글→영어 번역 모델 선택
  ▶ DeepSeek-R1-0528-Qwen3-8B (권장, 5.2GB) [설치됨]
    Qwen3.5-4B (균형형, 2.6GB)
    Qwen3.5-2B (경량, 1.3GB)
    사용자 지정 모델 설정 (GGUF)            ← 새 항목
    (이전 사용자 지정: unsloth/Qwen3-14B-GGUF:Q5_K_M [설치됨])  ← 기억된 항목이 있을 때만
  ↑↓ 화살표로 선택, Enter로 확정, ESC로 취소

→ "사용자 지정 모델 설정 (GGUF)" 선택

HuggingFace 레포를 입력하세요 (owner/repo 또는 전체 URL).
예: unsloth/Qwen3-14B-GGUF
> unsloth/Qwen3-14B-GGUF

레포 확인 중...
✓ 레포에서 GGUF 파일 7개를 찾았습니다.

양자화 선택
  ▶ Q4_K_M  (Qwen3-14B-Q4_K_M.gguf, 8.4GB)
    Q5_K_M  (Qwen3-14B-Q5_K_M.gguf, 9.8GB)
    Q6_K    (Qwen3-14B-Q6_K.gguf,   11.2GB)
    Q8_0    (Qwen3-14B-Q8_0.gguf,   14.5GB)
    ...

→ 선택 후 다운로드, .env 갱신, settings 저장
```

ESC/Ctrl+C 는 각 단계에서 즉시 취소(이전 상태로 복귀, 부작용 없음).

---

## 변경 범위

### 1. 신규: HuggingFace API 클라이언트
**파일:** `src/cli/model-setup/hf-repo.ts` (신규)

공개 HF Model API(`https://huggingface.co/api/models/{owner}/{repo}`)를 호출해 `siblings` 배열에서 `.gguf` 파일을 추려낸다. 각 파일에 대해 **HEAD 요청**으로 `Content-Length` 를 받아 크기(MB)를 채운다.

```ts
export interface GgufFileInfo {
  filename: string;       // 예: "Qwen3-14B-Q4_K_M.gguf"
  quantization: string;   // 예: "Q4_K_M"  (파일명에서 파싱)
  sizeMb: number;         // HEAD Content-Length 기반, 실패 시 0
}

export interface HfRepoRef {
  owner: string;
  repo: string;
  fullRepo: string;       // "owner/repo"
}

export const parseHfRepoInput: (raw: string) => HfRepoRef | null;
export const listGgufFiles: (ref: HfRepoRef) => Promise<GgufFileInfo[]>;
```

**`parseHfRepoInput` 동작:**
- 앞뒤 공백 제거.
- `https?://(www\.)?huggingface\.co/<owner>/<repo>(/.*)?` 패턴이면 owner/repo 추출 (뒤 `/tree/main`, `/blob/...` 등 무시).
- `^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$` 패턴이면 그대로 사용.
- 그 외(빈 문자열, 슬래시 없음, 슬래시 2개 이상)는 `null`.

**양자화 파싱:** 파일명에서 `/-(Q\d[A-Z0-9_]*|IQ\d[A-Z0-9_]*|F16|BF16|F32)\.gguf$/i` 매치. 매치 안 되면 `"unknown"` 으로 두고 양자화 라벨 대신 파일명을 표시.

**에러 케이스:**
- HTTP 404 → "레포를 찾을 수 없습니다. owner/repo가 맞는지 확인하세요."
- HTTP 401/403 → "비공개 레포는 아직 지원되지 않습니다."
- 그 외 네트워크 오류 → 원본 에러 메시지 출력 후 4번 항목 흐름 취소.
- GGUF 파일 0개 → "이 레포에는 GGUF 파일이 없습니다."

### 2. 신규: 라인 텍스트 입력 UI
**파일:** `src/cli/interactive/prompt-line.ts` (신규)

현재 [select-with-arrows.ts](src/cli/interactive/select-with-arrows.ts) 외에 텍스트 입력 컴포넌트가 없다. `node:readline/promises` 의 `createInterface` 로 단일 라인 입력을 받는 작은 헬퍼를 추가한다(외부 라이브러리 추가 없음, 기존 스타일 유지).

```ts
export interface PromptLineStreams {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
}

export const promptLine = async (
  message: string,
  options?: { placeholder?: string; validate?: (value: string) => string | null },
  streams?: PromptLineStreams,
): Promise<string | null>;
```

- 빈 입력 + Enter → `null` 반환 (취소로 간주).
- `Ctrl+C` → `process.exit(130)` (기존 `selectWithArrows` 와 동일 정책).
- `validate` 가 에러 메시지를 반환하면 한 줄 빨간 안내 후 재입력.
- non-TTY 환경에서는 `null` 반환 (자동화 환경에서 멈추지 않도록).

### 3. 모델 정의 확장
**파일:** [src/cli/model-setup/models.ts](src/cli/model-setup/models.ts)

- `TranslationModel` 인터페이스에 선택적 필드 `source?: "builtin" | "custom"` 추가. 기본값은 `"builtin"`. 식별/표시 용도로만 사용.
- `TRANSLATION_MODELS` 배열은 그대로(빌트인 3개). 4번 항목은 메뉴 단계에서만 합성한다(배열에 넣지 않음).
- 신규 헬퍼:

```ts
export const CUSTOM_MODEL_MENU_VALUE = "__custom_gguf__";

export const buildCustomTranslationModel: (input: {
  hfRepo: string;       // "owner/repo"
  hfFile: string;       // "Qwen3-14B-Q4_K_M.gguf"
  quantization: string; // "Q4_K_M"
  sizeMb: number;
}) => TranslationModel;
```

`buildCustomTranslationModel` 은 다음을 채운다:
- `id`: `custom:<repo>:<quant>` 형식
- `modelName`: `hfRepo` 그대로 (기존 환경변수 호환)
- `role`: `"llm"`
- `displayName`: `"<repo> (사용자 지정, <sizeMb>MB)"`
- `description`: `"사용자가 직접 지정한 HuggingFace GGUF 모델"`
- `source`: `"custom"`

### 4. 사용자 지정 모델 영속화
**파일:** `src/cli/model-setup/custom-store.ts` (신규)

`~/.detoks/custom-models.json` 에 **최근 사용자 지정 모델 1개**를 저장. (질문 #2에서 "예 — 설정에 저장" 선택, 단일 1개로 시작해 단순화. 향후 다개 확장 여지를 위해 배열로 직렬화.)

```ts
interface StoredCustomModel {
  hfRepo: string;
  hfFile: string;
  quantization: string;
  sizeMb: number;
  savedAt: string; // ISO
}

export const loadLastCustomModel: () => StoredCustomModel | null;
export const saveCustomModel: (model: StoredCustomModel) => void;
```

`settings.json`(config-manager) 변경은 하지 않는다 — `updateTranslationModel(modelName)` 은 `hfRepo` 문자열로 그대로 호출되므로 빌트인/커스텀 구분 없이 작동.

### 5. `/model` 핸들러 수정
**파일:** [src/cli/repl-commands/index.ts:802](src/cli/repl-commands/index.ts:802) (`handleTranslationModel`)

흐름 변경:

```
1. 메뉴 옵션 구성
   - 기존 3개 빌트인 (설치 상태 표시 동일)
   - + "사용자 지정 모델 설정 (GGUF)" (value=CUSTOM_MODEL_MENU_VALUE)
   - + loadLastCustomModel() 이 있으면 그것도 별도 옵션으로 추가
       label: "이전 사용자 지정: <repo>:<quant> [설치됨]" (파일 존재 여부 검사)
       value: "custom-recent" 같은 별도 마커

2. selectWithArrows() 호출

3. 선택값 분기
   case CUSTOM_MODEL_MENU_VALUE → runCustomModelFlow()
   case "custom-recent"        → loadLastCustomModel() 로 모델 재구성 후 기존 다운로드/저장 흐름 재사용
   default (빌트인 id)         → 기존 로직 그대로

4. runCustomModelFlow() (이 파일 내부에 private 함수로 정의)
   a. promptLine("HuggingFace 레포(owner/repo 또는 URL):", { validate })
      - validate: parseHfRepoInput(value) === null 이면 에러 문구 반환
      - null 반환 시 안내 후 return true
   b. listGgufFiles(ref) 호출, 진행 메시지 출력
      - 빈 배열/에러 → 사용자 안내 후 return true
   c. selectWithArrows(quantOptions, "양자화 선택")
      - 라벨: `${quantization}  (${filename}, ${sizeMb}MB)`
      - value: filename
   d. buildCustomTranslationModel(...) 로 TranslationModel 합성
   e. 기존 다운로드/환경설정 코드 재사용:
      - downloadModel(model)
      - process.env.LOCAL_LLM_* 설정 (line 886-890)
      - updateEnvFile(model, process.cwd())
      - updateTranslationModel(model.modelName)
   f. saveCustomModel({...}) 호출
```

**기존 버그 함께 수정:** [src/cli/repl-commands/index.ts:889](src/cli/repl-commands/index.ts:889) 에서 `process.env.LOCAL_LLM_HF_REPO = \`${selectedModel.hfRepo}:Q4_K_S\`;` 가 모델의 실제 양자화와 무관하게 `Q4_K_S` 로 하드코딩됨. `${selectedModel.hfRepo}:${selectedModel.quantization}` 으로 교정. (사용자 지정 모델은 quantization이 동적으로 들어와야 하므로 이 수정이 전제됨. 최소 변경 원칙에 따라 다른 줄은 건드리지 않음.)

### 6. 다운로드/경로/환경변수 — 변경 없음

| 항목 | 동작 | 검증 |
|---|---|---|
| 다운로드 URL | `https://huggingface.co/{repo}/resolve/main/{file}` | [download.ts:17](src/cli/model-setup/download.ts:17) 그대로 |
| 저장 경로 | `~/.detoks/models/llm/{repo-slug}/{file}` | [model-store.ts:29](src/core/model-store.ts:29) 그대로 동작 (`getHfRepoSlug` 가 `owner/repo` 의 `/` 를 `-` 로 치환) |
| .env 키 | `LOCAL_LLM_MODEL_NAME`, `LOCAL_LLM_MODEL_DIR`, `LOCAL_LLM_MODEL_PATH`, `LOCAL_LLM_HF_REPO`, `LOCAL_LLM_HF_FILE` | [env-writer.ts:126](src/cli/model-setup/env-writer.ts:126) 재사용. `LOCAL_LLM_HF_REPO` 는 `${hfRepo}:${quantization}` 형식 유지 |

즉, 사용자 지정 모델도 빌트인과 **완전히 동일한 저장 구조** 를 따른다. 이 덕분에 모델 로딩 측(runtime)은 추가 변경이 필요 없다.

---

## 변경 파일 정리

| 종류 | 경로 | 변경 |
|---|---|---|
| 신규 | `src/cli/model-setup/hf-repo.ts` | HF API 조회, 입력 파서 |
| 신규 | `src/cli/interactive/prompt-line.ts` | 텍스트 입력 헬퍼 |
| 신규 | `src/cli/model-setup/custom-store.ts` | `~/.detoks/custom-models.json` 영속화 |
| 수정 | `src/cli/model-setup/models.ts` | `source` 필드 + `buildCustomTranslationModel` + `CUSTOM_MODEL_MENU_VALUE` |
| 수정 | `src/cli/repl-commands/index.ts` | `handleTranslationModel` 에 4번 항목·재사용 항목 추가, `runCustomModelFlow` 추가, 889번 줄 `Q4_K_S` 하드코딩 버그 수정 |

기타(번역 모델 로딩 런타임, 임베딩 흐름, 다운로드 코어)는 변경하지 않는다.

---

## 엣지 케이스 / 정책

- **레포 자체는 존재하지만 GGUF 0개**: 메시지 안내 후 사용자에게 다시 4번 항목을 시도하게 둠(상위 메뉴로 복귀).
- **HEAD 요청이 Content-Length를 안 줄 때**: `sizeMb = 0` 으로 두고 라벨에 `(크기 미상)` 표시. 다운로드 진행률은 추정 불가하므로 `download.ts` 의 진행률 바가 100%를 못 채울 수 있음 — 이번 작업에서는 그대로 두고, 다운로드 자체는 계속 동작(스트림 종료 시 완료 메시지).
- **동일 파일이 이미 존재**: 기존 `inspectLocalModelFile` 결과가 `ready` 이면 다운로드 건너뜀 — 빌트인과 동일 정책.
- **양자화 파싱 실패**: 그래도 후보 목록에 표시(라벨에 파일명 노출). `LOCAL_LLM_HF_REPO` 에는 `unknown` 이 들어갈 수 있음 — 사용자에게는 영향 없으며, 명시적 차단은 하지 않음.
- **재진입 시 [설치됨] 판정**: `loadLastCustomModel()` 결과로 임시 `TranslationModel` 을 만든 뒤 `inspectLocalModelFile(getDetoksModelFilePath(...))` 로 확인. 빌트인과 동일 함수 사용.
- **취소(ESC/빈 입력)**: 어느 단계에서 취소해도 .env / settings.json / custom-store 모두 미변경.

---

## 검증

### 자동(가능한 범위)
- `parseHfRepoInput` 단위 테스트:
  - `"unsloth/Qwen3"` → ok
  - `"https://huggingface.co/unsloth/Qwen3"` → ok
  - `"https://huggingface.co/unsloth/Qwen3/tree/main"` → ok
  - `"unsloth"`, `""`, `"a/b/c"` → null
- 양자화 추출 정규식 단위 테스트(`Q4_K_M`, `IQ3_XS`, `F16` 등).

### 수동 E2E (.venv 또는 프로젝트 기본 실행 환경)
1. `npm run build` (또는 프로젝트의 빌드 스크립트).
2. CLI 실행 후 `/model` 진입.
3. 4번 항목 선택 → `unsloth/Qwen3.5-2B-GGUF` 같은 작은 레포 입력(실제 트래픽 절약을 위해 작은 레포 권장).
4. 양자화 목록이 표시되고, 선택 시 다운로드가 시작되는지 확인.
5. 다운로드 종료 후:
   - `~/.detoks/models/llm/unsloth-Qwen3.5-2B-GGUF/Qwen3.5-2B-Q4_K_M.gguf` 존재 확인.
   - 프로젝트 `.env` 의 `LOCAL_LLM_*` 키들이 갱신되었는지.
   - `~/.detoks/custom-models.json` 이 생성되었는지.
6. `/model` 재진입 → "이전 사용자 지정: ... [설치됨]" 옵션 노출 확인.
7. 취소 경로: 4번 항목 진입 후 ESC 두 번, 빈 입력 Enter → .env 미변경 확인.
8. 잘못된 입력 경로: `"foo"`, `"a/b/c"`, 존재하지 않는 `owner/repo` → 적절한 에러 메시지와 메뉴 복귀.

### 회귀 방지
- 빌트인 3개 모델 선택/다운로드 흐름이 그대로 동작 (특히 `LOCAL_LLM_HF_REPO` 가 이전엔 `:Q4_K_S` 였다가 이제 `:Q4_K_M` 으로 바뀜 — 런타임이 이 접미사를 어떻게 쓰는지 한번 더 확인 필요. `LOCAL_LLM_HF_REPO` 를 소비하는 코드가 있다면 quantization 부분이 정합한지 점검).
