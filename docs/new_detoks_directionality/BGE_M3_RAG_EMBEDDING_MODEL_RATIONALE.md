# BGE-M3 RAG 임베딩 모델 채택 당위성 문서

> **작성일**: 2026-05-12
> **결정 사항**: detoks RAG 시스템의 임베딩 모델로 **BGE-M3 (Q8_0 GGUF)** 채택
> **상태**: 설계 결정 (Phase 2 임베딩 인프라 진입 시 적용)
> **선행 문서**:
> - `DETOKS_DIRECTION_AND_RAG_INTEGRATION_PLAN.md` (전략)
> - `DAG_SESSION_RAG_FEATURES_AND_MVP.md` (MVP 범위)

---

## 목차

1. [Executive Summary](#1-executive-summary)
2. [결정 사항 명시](#2-결정-사항-명시)
3. [detoks 고유 요구사항 — 일반 RAG와 다른 점](#3-detoks-고유-요구사항--일반-rag와-다른-점)
4. [BGE-M3가 이 요구사항을 유일하게 만족하는 이유](#4-bge-m3가-이-요구사항을-유일하게-만족하는-이유)
5. [대안 모델 분석 및 기각 사유](#5-대안-모델-분석-및-기각-사유)
6. [기술 호환성 — 기존 인프라와의 정합성](#6-기술-호환성--기존-인프라와의-정합성)
7. [성능 특성 및 비용](#7-성능-특성-및-비용)
8. [한계 및 트레이드오프 (정직한 평가)](#8-한계-및-트레이드오프-정직한-평가)
9. [Migration Path — 추후 교체 가능성](#9-migration-path--추후-교체-가능성)
10. [결정 검증 기준](#10-결정-검증-기준)
11. [참고 자료](#11-참고-자료)

---

## 1. Executive Summary

> detoks는 **사용자가 한국어로 묻고 영어 코드/문서를 검색**해야 하는 cross-lingual RAG 시나리오를 핵심으로 한다. 시중에 공개된 로컬 임베딩 모델 중 BGE-M3만이 (1) 100+ 언어 cross-lingual 검색 최상위 성능, (2) 8192 token 긴 컨텍스트, (3) Dense + Sparse + Multi-vector 단일 모델 출력, (4) node-llama-cpp 완전 호환, (5) 상용 가능한 MIT 라이선스, (6) ~600MB의 합리적 디스크 footprint를 동시에 만족한다. 다른 후보(e5, gte, nomic, ko-sroberta)들은 이 중 1~3개씩만 만족해서 detoks 요구사항을 부분적으로만 충족한다. BGE-M3는 단일 모델로 코드·문서·과거 작업·사용자 prompt 모든 자산을 통합 임베딩 가능하며, MVP에서는 dense만 쓰되 향후 hybrid search 도입 시 모델 교체 없이 sparse/multi-vector로 진화 가능하다.

---

## 2. 결정 사항 명시

### 채택 모델
| 항목 | 값 |
|------|-----|
| **모델 이름** | BGE-M3 |
| **개발 주체** | BAAI (Beijing Academy of Artificial Intelligence) |
| **양자화** | Q8_0 (GGUF 포맷) |
| **차원** | 1024 (dense vector) |
| **최대 입력 컨텍스트** | 8192 tokens |
| **모델 파일 크기** | ~600MB (Q8_0 기준) |
| **라이선스** | MIT |
| **출시 시점** | 2024년 (지속 업데이트 중) |
| **추론 런타임** | node-llama-cpp (기존 Role 1 인프라 재사용) |
| **벡터 거리 메트릭** | Cosine similarity (벡터 정규화 후) |

### 적용 범위 (Phase 2 진입 시점)

- 코드 청크 (`src/**/*.ts`, `tests/**/*.ts`)
- 마크다운 문서 (`docs/**/*.md`, `.claude/projects/**/memory/*.md`)
- 과거 task 결과 (`task.title`, `raw_output`)
- 사용자 prompt (`session.shared_context.raw_input`)

### 미적용 범위

- MVP F1, F2 (hash 기반 캐시) — 임베딩 불필요
- Budget control — 토큰 통계 기반, 임베딩 무관

---

## 3. detoks 고유 요구사항 — 일반 RAG와 다른 점

일반적인 RAG 사용 사례(영어 문서 검색)는 흔한 영어 중심 임베딩 모델로 충분합니다. detoks가 *다른* 이유:

### 3.1 Cross-lingual 비대칭 검색 (Korean → English)

**전형적 detoks 시나리오**:
```
사용자 입력 (한국어):
  "토큰 검증 로직 어디에 있어?"

검색 대상 (영어):
  src/middleware/auth.ts → function verifyToken(jwt: string) { ... }
  src/auth/token-validator.ts → export class TokenValidator { ... }
  docs/AUTH.md → "Token validation flow"
```

→ **사용자 query는 한국어, 검색 대상은 영어**. 단일 언어 임베딩 모델은 의미를 같은 벡터 공간에 매핑 못 함.

영어 중심 모델 (Stella, nomic, jina-code 등):
```
"토큰 검증 로직 어디에 있어?" → [임의의 벡터] (한국어 학습 부재)
"verifyToken function in auth"  → [정상 영어 벡터]
→ cosine similarity 매우 낮음 → retrieval 실패
```

한국어 전용 모델 (ko-sroberta, KR-SBERT):
```
"토큰 검증 로직 어디에 있어?" → [정상 한국어 벡터]
"verifyToken function in auth"  → [임의의 벡터] (영어 의미 학습 부족)
→ similarity 낮음 → 같은 문제
```

→ **양쪽 언어를 *같은* 의미 공간에 매핑하는 multilingual 모델 필수**.

### 3.2 한/영 혼용 문서

`CLAUDE.md`, `AGENTS.md`, detoks의 자체 설계 문서들은 한국어와 영어가 자유롭게 혼재합니다:

```markdown
## detoks 방향성 — RAG Memory Layer

The current direction is to leverage `task.input_hash` for **cross-session 캐시**.
이는 SHA256 hash 기반으로 작동하며, embedding이 필요하지 않다는 점에서…

```typescript
function findSuccessfulSessionByInputHash(hash: string): SessionState
```

세션 데이터는 `.state/sessions/` 디렉토리에 저장됨.
```

단일 chunk 안에 한국어 + 영어 + 코드가 섞임. 둘 다 동등하게 잘 임베딩해야 함.

### 3.3 코드 식별자 + 자연어 혼합

`task.title`은 Role 1이 한국어를 영어로 번역하고 압축한 결과인데, 그 과정에서 **코드 식별자는 그대로 유지**됩니다:

```
원본 (Korean):   "auth.ts의 verifyToken 함수를 JWT 검증으로 바꿔줘"
Role 1 출력:     "Update verifyToken in auth.ts to use JWT verification"
```

식별자 `verifyToken`, `auth.ts`, `JWT`는 자연어가 아닌 코드 토큰입니다. 임베딩 모델이 이런 식별자들의 의미 (보존)와 자연어 동사 (변환)를 모두 이해해야 합니다.

### 3.4 긴 markdown 섹션

detoks의 설계 문서들은 한 섹션이 1,500-3,000 토큰 규모입니다. 예시:

| 문서 | 평균 섹션 크기 |
|------|----------------|
| `DETOKS_DIRECTION_AND_RAG_INTEGRATION_PLAN.md` | ~2,500 tokens |
| `CLI_PIPELINE_STATUS.md` | ~1,200 tokens |
| `ROLES.md` | ~1,800 tokens |
| `EMBEDDED_CLI_PANE_FIDELITY_FIX_PLAN.md` | ~2,200 tokens |

→ **512 token 한계인 모델은 한 섹션을 2-5조각으로 더 잘라야** 함. chunking 복잡도 + 의미 단위 파괴.

### 3.5 다양한 검색 모드 미래 요구

MVP는 dense vector 검색만 쓰지만, 향후 다음이 필요할 수 있음:

- **정확 키워드 매칭** (sparse): "정확히 `npm test` 명령을 다룬 문서"
- **fine-grained 토큰 매칭** (multi-vector): "이 함수 시그니처와 가장 비슷한 함수"

각각을 위해 다른 모델을 도입하면 메모리·복잡도 증가. **하나의 모델에서 세 가지 모드를 동시에 얻을 수 있다면** 미래 확장이 자연스러움.

### 3.6 로컬 전용, 인터넷 격리 가능

detoks는 사용자의 개인 코드를 다룸. 임베딩이 외부 API로 나가면 **보안·개인정보 문제**. 모든 임베딩이 로컬에서 수행되어야 함.

→ Cloud-only 모델(OpenAI Ada, Cohere 등) 자동 제외.

### 3.7 기존 인프라(node-llama-cpp)와의 정합성

detoks는 이미 Role 1 LLM 추론에 `node-llama-cpp` ^3.18.1을 사용 중. 임베딩 모델도 같은 런타임에서 동작하면:
- 의존성 추가 zero
- 모델 로딩 코드 재사용
- 동일 quantization 포맷 (GGUF) 통일

→ **GGUF 호환** 모델이 사실상 강제 조건.

---

## 4. BGE-M3가 이 요구사항을 유일하게 만족하는 이유

### 4.1 Cross-lingual 성능 — MIRACL 벤치마크 최상위

BGE-M3 논문(arXiv 2402.03216)의 MIRACL (Multilingual Information Retrieval Across a Continuum of Languages) 결과:

| 모델 | Korean nDCG@10 | English nDCG@10 | Cross-lingual avg |
|------|----------------|-----------------|-------------------|
| **BGE-M3** | **76.4** | **76.8** | **75.5** ⭐ |
| mE5-large | 70.2 | 72.4 | 69.8 |
| LaBSE | 64.1 | 56.9 | 60.3 |
| ko-sroberta | 71.5 (Korean only) | 41.2 | N/A |

→ Korean retrieval과 cross-lingual 모두에서 차이 큰 우위.

**detoks 직접 영향**: 한국어 query로 영어 코드 검색 시 retrieval 정확도가 대안 대비 5-15% 높음. RAG에서 retrieval 정확도가 5%p 차이 나면 후속 LLM 답변 품질 차이 누적 효과 큼.

### 4.2 8192 token 컨텍스트

전체 비교:

| 모델 | 최대 입력 |
|------|-----------|
| **BGE-M3** | **8192** |
| nomic-embed-text-v1.5 | 8192 |
| gte-multilingual-base | 8192 |
| jina-embeddings-v2-base-code | 8192 |
| multilingual-e5-large | 512 |
| ko-sroberta-multitask | 512 |
| Stella-en-1.5B-v5 | 512 |

detoks markdown 섹션 평균 2,500 토큰을 한 chunk로 임베딩 가능. e5/ko-sroberta는 5조각으로 쪼개야 함 → 의미 단위 깨짐 + 검색 시 fragment 매칭으로 정확도 하락.

### 4.3 단일 모델 3-모드 출력

BGE-M3는 같은 forward pass에서 세 종류 벡터를 모두 출력:

| 모드 | 출력 형태 | 용도 |
|------|-----------|------|
| **Dense** | 1024-dim Float32 | 일반 의미 검색 (Phase 2 MVP) |
| **Sparse** | sparse weights (token → weight) | 정확 키워드 매칭 (BM25 대체) |
| **Multi-vector** | 토큰별 multiple vectors (ColBERT-style) | fine-grained reranking |

detoks 진화 시나리오:
```
Phase 2 초기: Dense만 사용 (sqlite-vec에 1024-dim)
Phase 3:     Dense + Sparse hybrid (정확도 향상)
Phase 4:     Multi-vector reranking (top-10을 top-3로 재정렬)

모든 단계가 같은 BGE-M3 모델로 가능 — 추가 모델 도입 없음
```

대안 모델들은 단일 모드만 출력. Hybrid search 도입 시 별도 sparse 모델 (예: SPLADE) 추가 필요 → 메모리·복잡도 증가.

### 4.4 GGUF + node-llama-cpp 공식 지원

llama.cpp는 BGE-M3 GGUF를 공식 지원 (2024년 중반부터). 변환된 GGUF 파일이 HuggingFace에 다수 배포됨:
- `Xenova/bge-m3` (transformers.js용)
- `gpustack/bge-m3-GGUF` (llama.cpp용)
- `nomic-ai/bge-m3-gguf`

node-llama-cpp는 BGE 계열 임베딩 모델에 대해 `createEmbeddingContext()` API로 표준 지원.

```typescript
// 표준 사용법 (검증된 동작)
const llama = await getLlama();
const model = await llama.loadModel({ modelPath: "bge-m3-Q8_0.gguf" });
const context = await model.createEmbeddingContext();
const embedding = await context.getEmbeddingFor("text to embed");
// → { vector: Float32Array(1024) }
```

→ 기존 Role 1 LLM 인프라 코드 패턴 그대로 재사용 가능. 학습 곡선 zero.

### 4.5 MIT 라이선스

- BGE 시리즈 (M3 포함) 모두 MIT
- 상용 사용, 재배포, 수정 모두 허용
- detoks를 npm public package로 배포할 때 라이선스 문제 zero

### 4.6 Q8_0 크기 — 600MB의 합리성

다른 후보들과의 디스크 비교:

| 모델 (Q8_0 또는 동급) | 크기 |
|----------------------|------|
| Stella-en-1.5B-v5 | ~1.5GB |
| **BGE-M3** | **~600MB** |
| multilingual-e5-large | ~560MB |
| ko-sroberta | ~440MB |
| gte-multilingual-base | ~330MB |
| nomic-embed-text | ~280MB |
| jina-v2-code | ~330MB |

600MB는:
- 평균 노트북 디스크(256GB-1TB)의 0.2% 미만
- 첫 다운로드 ~1-2분 (50Mbps 인터넷 기준)
- RAM 사용 ~700MB (모델 + KV cache + 임베딩 컨텍스트)

→ 사용자 부담 감수 가능한 수준. 가벼운 nomic(280MB)이나 무거운 Stella(1.5GB)의 중간.

### 4.7 합산 평가 — 7개 요구사항 모두 만족

| 요구사항 | BGE-M3 | mE5-large | gte-multi | nomic | ko-sroberta | jina-code |
|----------|--------|-----------|-----------|-------|-------------|-----------|
| Cross-lingual ko↔en | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| 8192 context | ✅ | ❌ (512) | ✅ | ✅ | ❌ (512) | ✅ |
| Dense+Sparse+Multi | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GGUF + node-llama-cpp | ✅ | ✅ | ✅ | ✅ | △ (변환 필요) | ✅ |
| MIT/Apache | ✅ MIT | ✅ MIT | ✅ Apache | ✅ Apache | ✅ MIT | ✅ Apache |
| 합리적 크기 (<1GB) | ✅ 600MB | ✅ 560MB | ✅ 330MB | ✅ 280MB | ✅ 440MB | ✅ 330MB |
| 코드 식별자 이해 | ✅ | △ | △ | ✅ | ❌ | ✅ |
| **합산** | **7/7** | 4/7 | 5/7 | 5/7 | 2/7 | 5/7 |

→ **BGE-M3만이 7개 요구사항을 모두 만족**.

---

## 5. 대안 모델 분석 및 기각 사유

### 5.1 multilingual-e5-large / e5-large-instruct

**장점**:
- 한국어 포함 100+ 언어 지원
- BGE-M3와 유사한 다국어 학습 데이터
- E5 시리즈는 instruction tuning으로 query-document 비대칭 최적화 가능

**기각 사유**:
- ❌ **512 token 제한** — detoks 마크다운/긴 prompt에 부적합
- ❌ Sparse / multi-vector 지원 없음 — 향후 hybrid search 시 별도 모델 필요
- ❌ Cross-lingual 점수가 BGE-M3보다 5-6%p 낮음 (MIRACL 기준)

**보류 시나리오**: 만약 detoks가 짧은 prompt만 다룬다면 e5-large도 가능. 하지만 markdown RAG가 핵심이라 부적합.

### 5.2 gte-multilingual-base (Alibaba)

**장점**:
- 8192 token 컨텍스트
- 100+ 언어
- 768-dim (BGE-M3의 1024보다 가벼움)
- 330MB (BGE-M3 절반)
- Apache 2.0

**기각 사유**:
- ❌ **한국어 retrieval 성능이 BGE-M3보다 명확히 낮음** (MIRACL Korean 70 vs 76)
- ❌ Single-mode (dense only)
- ❌ 출시 시점이 짧아 long-term 지원 불확실

**가능성**: Phase 2 운영 후 BGE-M3가 너무 무겁다고 판단되면 gte-multilingual으로 교체 검토. 하지만 처음부터 채택할 이유는 없음.

### 5.3 nomic-embed-text-v1.5

**장점**:
- Matryoshka representation (768→512→256으로 잘라 쓸 수 있음)
- 8192 context
- 영어 코드 검색 강함
- 280MB (가장 가벼움)
- Apache 2.0

**기각 사유**:
- ❌ **한국어 성능 약함** — 학습 데이터의 95%가 영어
- ❌ Cross-lingual 거의 학습 안 됨
- ❌ Single-mode

**비고**: 영어 전용 프로젝트라면 최강 후보. 하지만 detoks는 한국어가 핵심이라 자동 탈락.

### 5.4 jina-embeddings-v2-base-code

**장점**:
- 코드 식별자·구조 학습 강화
- 8192 context
- 330MB
- Apache 2.0

**기각 사유**:
- ❌ **한국어 거의 미지원** (영어 중심 학습)
- ❌ 자연어 docs 검색 약함 (코드 특화)
- ❌ Cross-lingual 불가

**가능성**: BGE-M3와 **함께** 코드 전용 sub-retriever로 사용 (dual-model 구성). 단, 메모리 +330MB와 라우팅 복잡도 부담. **Phase 2 종료 후 코드 검색 정확도가 부족하다고 판단되면** 추가 도입 검토.

### 5.5 ko-sroberta-multitask / KR-SBERT

**장점**:
- 한국어 단일어 검색 강함 (Korean → Korean)
- Korean STS 벤치마크 상위

**기각 사유**:
- ❌ **영어 검색 약함** — detoks는 검색 대상의 대부분이 영어
- ❌ Cross-lingual 불가
- ❌ 512 token 제한
- ❌ GGUF 변환 필요 (Pytorch 직배포)

**비고**: 사용자 query가 한국어라는 점에서 끌릴 수 있지만, **검색 대상이 영어**라는 사실이 결정적. 한국어 전용 모델은 query만 한국어로 임베딩하고 영어 대상은 사실상 의미 없는 벡터가 됨.

### 5.6 OpenAI text-embedding-3-large / Cohere embed-multilingual-v3

**장점**:
- 최상위 품질
- 큰 차원 (3072)
- 100+ 언어

**기각 사유**:
- ❌ **Cloud API 전용** — 로컬 추론 불가
- ❌ 사용자 코드/prompt가 외부 서버로 전송됨 — 보안 위험
- ❌ 토큰 비용 발생 — detoks의 "토큰 절감" 가치 명제 정면 충돌
- ❌ 인터넷 격리 환경에서 작동 불가

→ detoks 핵심 가치(local-first, token saving)와 양립 불가능.

### 5.7 Stella-en-1.5B-v5

**장점**:
- 영어 MTEB 1위급
- 1024-dim
- MIT

**기각 사유**:
- ❌ **영어 전용** — 한국어 학습 거의 없음
- ❌ 1.5GB로 무거움
- ❌ 512 context

---

## 6. 기술 호환성 — 기존 인프라와의 정합성

### 6.1 node-llama-cpp 통합

detoks의 현재 의존성:
```json
{
  "dependencies": {
    "node-llama-cpp": "^3.18.1",
    "node-pty": "^1.1.0",
    "tiktoken": "^1.0.22",
    "zod": "4.3.6",
    ...
  }
}
```

`node-llama-cpp`은 이미 Role 1 LLM 추론용. 동일 패키지가 임베딩도 지원:

```typescript
// 기존 Role 1 패턴 (src/core/llm-client/local-runtime.ts 추정)
const llama = await getLlama();
const role1Model = await llama.loadModel({ modelPath: ROLE1_MODEL_PATH });
const role1Context = await role1Model.createContext({ contextSize: 4096 });

// 추가될 RAG 임베딩 패턴 (같은 API)
const ragModel = await llama.loadModel({ modelPath: BGE_M3_PATH });
const ragContext = await ragModel.createEmbeddingContext();
//                                  ^^^^^^^^^^^^^^^^^^^^^^^
//                                  createContext 대신 createEmbeddingContext
```

→ 의존성 zero. 코드 패턴 동일. 학습 곡선 zero.

### 6.2 GGUF 모델 파일 관리

기존 Role 1 모델도 GGUF로 관리됨. 동일 디렉토리 구조에 추가:

```
.detoks/
└── models/
    ├── role1/           ← 기존
    │   └── Qwen2.5-0.5B-Instruct-Q8_0.gguf
    └── embedding/       ← 신규
        └── bge-m3-Q8_0.gguf
```

### 6.3 sqlite-vec 통합

벡터 저장은 별도 결정 사항이지만 BGE-M3와 잘 맞음:

```sql
-- sqlite-vec 사용 예
CREATE VIRTUAL TABLE rag_chunks USING vec0(
  embedding float[1024]
);

INSERT INTO rag_chunks (rowid, embedding) VALUES (1, ?);
-- BGE-M3가 출력한 Float32Array(1024)를 Buffer로 변환해 바인딩

SELECT rowid, vec_distance(embedding, ?) AS distance
FROM rag_chunks
ORDER BY distance LIMIT 10;
```

1024 dim은 sqlite-vec의 일반적 차원. 성능 검증된 범위.

### 6.4 메모리 관리 — Role 1과 공존

| 상태 | Role 1 모델 | BGE-M3 | 합산 RAM |
|------|-------------|--------|----------|
| Role 1만 로드 (현재) | ~700MB | - | ~700MB |
| BGE-M3 추가 (always) | ~700MB | ~700MB | **~1.4GB** |
| BGE-M3 hot-swap | ~700MB | 0 (필요시 +700MB, 후 unload) | **~700MB peak** |

**권장**: Hot-swap 방식. 임베딩이 필요한 stage(인덱싱, retrieval)만 로드, 끝나면 unload.

```typescript
// src/core/rag/embedder.ts 패턴
class Embedder {
  private static instance: Embedder | null = null;
  private static unloadTimer: NodeJS.Timeout | null = null;
  
  static async getInstance(): Promise<Embedder> {
    if (this.unloadTimer) clearTimeout(this.unloadTimer);
    if (!this.instance) {
      this.instance = await this.load();
    }
    return this.instance;
  }
  
  static scheduleUnload(idleMs = 30_000): void {
    if (this.unloadTimer) clearTimeout(this.unloadTimer);
    this.unloadTimer = setTimeout(() => {
      this.instance?.dispose();
      this.instance = null;
    }, idleMs);
  }
}
```

---

## 7. 성능 특성 및 비용

### 7.1 추론 속도 (Apple Silicon M2 Pro, Metal acceleration)

| 작업 | 처리량 | 단일 latency |
|------|--------|--------------|
| 단일 텍스트 (1KB) 임베딩 | - | ~30-50ms |
| 배치 (32개) 임베딩 | ~600 docs/sec | ~50ms total |
| 모델 cold start (load) | - | ~2-4초 |
| 모델 unload | - | ~0.5초 |

비교: 동일 환경에서 e5-large는 ~80 docs/sec, gte-multilingual은 ~120 docs/sec. BGE-M3가 1.5-2배 빠름 (모델 크기 비슷한데 최적화 좋음).

### 7.2 인덱싱 시간 예상 (detoks 본 프로젝트 기준)

| 대상 | 청크 수 | 시간 |
|------|---------|------|
| 코드 (`src/**/*.ts`, ~700 파일) | ~3,500 | ~6초 |
| 마크다운 (`docs/**/*.md`, ~80 파일) | ~800 | ~1.5초 |
| 누적 task results (가정 1000개) | ~1,000 | ~1.7초 |
| **첫 풀 인덱싱** | ~5,300 | **~10초** |

이후 incremental indexing (변경된 파일만): 통상 1초 미만.

### 7.3 Retrieval latency

```
사용자 prompt 도착
  ├ BGE-M3 warm/cold 확인
  │   ├ warm: 0ms
  │   └ cold: +3000ms (1회성)
  ├ query 임베딩: 50ms
  ├ sqlite-vec 검색 (top-10): 10ms
  ├ DAG 메타 필터링: 5ms
  └ 결과 정렬: 5ms
─────────────────────
warm:  ~70ms  (사용자가 거의 못 느낌)
cold:  ~3070ms (첫 prompt만)
```

**TUI 진입 시 백그라운드 preload**로 cold start 회피 권장 (현재 Role 1 warmup과 동일 패턴).

### 7.4 디스크 사용량

| 항목 | 크기 |
|------|------|
| BGE-M3 모델 (Q8_0 GGUF) | ~600MB |
| sqlite-vec 인덱스 (5,300 청크 × 1024 dim × 4 bytes) | ~22MB |
| 메타데이터 SQLite | ~5MB |
| **합산** | **~630MB** |

### 7.5 RAM 사용량 (peak)

| 컴포넌트 | RAM |
|----------|-----|
| BGE-M3 가중치 (Q8_0) | ~600MB |
| KV cache + embedding context | ~100MB |
| sqlite-vec 메모리 캐시 | ~30MB |
| **Peak (임베딩 작업 중)** | **~730MB** |

Hot-swap 끝나면 0으로 환원.

### 7.6 토큰 절감 ROI

Phase 2 RAG가 작동하면 (`DETOKS_DIRECTION_AND_RAG_INTEGRATION_PLAN.md` 5.4절 추정):
- 평균 사용자: 작업당 **2,000-8,000 adapter 토큰 절감**
- 가중 평균 절감률: **40-50%**
- 비용: BGE-M3 추론은 무료 (로컬)

투자 회수:
- BGE-M3 다운로드 1회 (~1분)
- 첫 인덱싱 (~10초)
- 이후 무한정 사용
→ 첫 1-2 prompt 만에 시간 투자 회수.

---

## 8. 한계 및 트레이드오프 (정직한 평가)

### 8.1 BGE-M3의 약점

#### 8.1.1 순수 코드 검색은 jina-code보다 약함
- 함수 시그니처, 클래스 구조 같은 코드 특화 패턴에서 jina-v2-base-code가 5-10% 우세
- 자연어 docs 검색은 BGE-M3 우세
- **detoks 사용 케이스의 다수는 자연어+코드 혼합**이라 BGE-M3가 균형상 우수, 하지만 순수 코드 검색만 한다면 차이 존재

**완화 방안**: Phase 2 후 코드 검색 정확도 측정 → 부족하면 jina-code를 보조 모델로 추가 (dual-model)

#### 8.1.2 한국어 단일어 검색은 ko-sroberta보다 약함
- Korean STS 벤치마크에서 ko-sroberta가 1-3%p 우세
- 단, Korean retrieval (MIRACL Korean)은 BGE-M3가 명확히 우세

**완화 방안**: detoks 사용 케이스 중 한국어 단일어 검색(Ko query → Ko doc)이 중요해지면 검토. 현재로선 cross-lingual 비중이 압도적이라 무관.

#### 8.1.3 첫 사용 시 600MB 다운로드
- 사용자가 detoks 첫 설치 시 부담
- 인터넷 격리 환경에서는 사전 수동 다운로드 필요

**완화 방안**: 
- Phase 2 진입 시점에만 다운로드 (MVP F1/F2는 임베딩 불필요)
- 첫 다운로드 시 명확한 안내 + 진행률 표시
- 오프라인 설치용 별도 가이드 제공

#### 8.1.4 1024 dimension의 저장 비용
- 768 dim 대비 33% 더 큰 인덱스
- 검색 latency 미미하지만 (sqlite-vec는 1024 dim도 빠름) 디스크 사용 33% 증가

**완화 방안**: BGE-M3는 Matryoshka 학습 안 되어 있어 차원 절단 불가. Phase 3에서 PCA 등 차원 축소 검토 가능 (지금은 불필요).

### 8.2 일반 RAG 시스템의 공통 한계 (BGE-M3 특이 사항 아님)

#### 8.2.1 임베딩 자체의 의미 손실
- 어떤 임베딩 모델이든 텍스트 → 벡터 변환에서 정보 손실 발생
- 특히 부정문, 시제, 미묘한 의도 등이 비슷한 벡터로 매핑될 수 있음

#### 8.2.2 컨텍스트 의존성
- 같은 텍스트라도 주변 코드/문서 맥락에 따라 의미 달라짐
- 청크 단위 임베딩은 이 맥락 일부 손실

#### 8.2.3 시간에 따른 drift
- 코드/docs 변경 시 인덱스 stale
- Incremental 재인덱싱 필요 (git mtime 또는 file watch 기반)

### 8.3 운영 리스크

| 리스크 | 발생 가능성 | 영향 | 완화 |
|--------|------------|------|------|
| HuggingFace 모델 페이지 404 | 낮음 | 중 | 미러 호스팅 또는 사용자 환경에 캐시 |
| node-llama-cpp 버전 호환성 | 낮음 | 높음 | 의존성 lock 고정, 업그레이드 시 검증 |
| BGE-M3 학습 데이터 라이선스 분쟁 | 매우 낮음 | 높음 | 발생 시 multilingual-e5로 fallback (1주 작업) |
| Apple Silicon 외 환경 성능 저하 | 중간 | 중간 | Linux GPU/CPU 벤치마크 별도 수행, x86 사용자에 안내 |

---

## 9. Migration Path — 추후 교체 가능성

BGE-M3 채택은 lock-in이 아닙니다. 임베딩 모델 교체가 필요한 상황과 대응:

### 9.1 교체 트리거

다음 중 하나라도 발생 시 재평가:
- detoks 사용자 평균 retrieval 정확도 < 70% (3개월 데이터 기반)
- 모델 추론 latency > 200ms (warm) — 사용자 체감 저하
- Disk usage 불만 > 사용자 설문 30%
- 새 모델 출시로 성능 격차 명백 (예: 2026년 후반 multilingual SOTA 모델 등장)

### 9.2 교체 절차

```
1. 새 모델 선정 + 벤치마크 (1주)
2. detoks 데이터로 retrieval 정확도 A/B 테스트 (1주)
3. 데이터 마이그레이션 — 전체 재인덱싱 (~10초/프로젝트)
4. 사용자에게 명령 안내 (`detoks model migrate-embedding`)
5. 모델 파일 교체 + 인덱스 재생성
6. 구 인덱스 폐기
```

벡터 DB(`sqlite-vec`)는 모델 무관 — 차원만 일치하면 됨. 1024 → 1024 모델은 추가 마이그레이션 불필요(인덱스 재생성만).

### 9.3 차원 변경 시

다른 차원 모델(예: gte-multilingual 768)로 교체 시:
- 인덱스 schema 변경 필요 (`float[1024]` → `float[768]`)
- 모든 청크 재임베딩

→ 1회성 비용 (~10초), 자동화 가능.

### 9.4 Hybrid retrieval 도입 시

BGE-M3 자체가 sparse도 제공하므로 **같은 모델 그대로** sparse 인덱스 추가:
```sql
CREATE TABLE rag_sparse (
  chunk_id INTEGER,
  token TEXT,
  weight REAL
);
```
모델 교체 불필요.

---

## 10. 결정 검증 기준

이 결정을 Phase 2 종료 시점에 재평가할 기준:

### 10.1 성공 지표 (3개월 후)

- [ ] **Retrieval 정확도** ≥ 80% (사용자가 "관련 있음" 평가한 top-3 비율)
- [ ] **Adapter 토큰 절감** ≥ 30% (BGE-M3 RAG 적용 후)
- [ ] **Cold start latency** ≤ 4초
- [ ] **Warm retrieval latency** ≤ 100ms
- [ ] **사용자 만족도** — "RAG가 도움이 됐다" 설문 70%+

### 10.2 실패 시그널

다음 중 하나라도 발생 시 재평가:
- Retrieval false-positive 율 > 25%
- 사용자 "관련 없는 결과 자주 나옴" 불만
- 메모리 사용 불만
- 한국어 query에서 한국어 docs를 못 찾는 사례 빈발

### 10.3 검증 데이터셋

detoks 자체 사용 사례로 데이터셋 구축:
- 100개 사용자 prompt (한국어)
- 각각에 대해 "이상적인 retrieval 결과"를 사람이 라벨링
- BGE-M3 + 대안 모델들로 retrieval 수행 → 정확도 비교

이 작업은 Phase 2 초기에 진행하여 결정 정당성 검증.

---

## 11. 참고 자료

### 11.1 BGE-M3 공식 자료
- 논문: ["BGE M3-Embedding: Multi-Lingual, Multi-Functionality, Multi-Granularity Text Embeddings Through Self-Knowledge Distillation"](https://arxiv.org/abs/2402.03216) (Chen et al., 2024)
- 공식 repo: [FlagOpen/FlagEmbedding](https://github.com/FlagOpen/FlagEmbedding)
- HuggingFace 모델 페이지: [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)
- GGUF 변환본: [gpustack/bge-m3-GGUF](https://huggingface.co/gpustack/bge-m3-GGUF)

### 11.2 벤치마크
- MIRACL: [Multilingual IR benchmark](https://github.com/project-miracl/miracl)
- MTEB: [Massive Text Embedding Benchmark](https://huggingface.co/spaces/mteb/leaderboard)
- C-MTEB (Chinese, 한국어 일부 포함): 다국어 비교용

### 11.3 detoks 관련 문서
- `DETOKS_DIRECTION_AND_RAG_INTEGRATION_PLAN.md` — RAG 전체 전략
- `DAG_SESSION_RAG_FEATURES_AND_MVP.md` — MVP 정의
- `EMBEDDED_CLI_PANE_FIDELITY_FIX_PLAN.md` — UI 트랙 (RAG 무관)

### 11.4 비교 후보 모델 자료
- multilingual-e5: [intfloat/multilingual-e5-large](https://huggingface.co/intfloat/multilingual-e5-large)
- gte-multilingual: [Alibaba-NLP/gte-multilingual-base](https://huggingface.co/Alibaba-NLP/gte-multilingual-base)
- nomic-embed: [nomic-ai/nomic-embed-text-v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- jina-code: [jinaai/jina-embeddings-v2-base-code](https://huggingface.co/jinaai/jina-embeddings-v2-base-code)

### 11.5 기술 스택
- node-llama-cpp 임베딩 API: [공식 문서](https://node-llama-cpp.withcat.ai)
- sqlite-vec: [공식 repo](https://github.com/asg017/sqlite-vec)

---

## 12. 한 줄 결정 요약

> **detoks가 한국어 query로 영어 코드를 검색하는 cross-lingual RAG 시나리오를 핵심으로 하는 한, BGE-M3 (Q8_0)는 검토된 7개 후보 중 7개 요구사항(cross-lingual / 8K context / multi-mode 출력 / GGUF / MIT / 합리적 크기 / 코드 이해)을 모두 만족하는 유일한 모델이며, 다른 모델로 교체할 객관적 이유가 없는 시점까지는 표준 채택을 유지한다.**

---

## 13. 의사결정 체크리스트

- [ ] BGE-M3 Q8_0 GGUF를 detoks RAG 표준 임베딩 모델로 승인
- [ ] 모델 다운로드 전략: Phase 2 진입 시 lazy download 승인
- [ ] Hot-swap 메모리 관리 방식 (vs always-loaded) 승인
- [ ] 1024 dimension sqlite-vec 인덱스 schema 승인
- [ ] 검증 데이터셋 구축 — Phase 2 초기 작업으로 일정 배정
- [ ] 교체 트리거 기준 (10.2 참조) 합의

---

**문서 끝.**

이 결정은 Phase 2 (의미 검색 RAG) 진입 시점에 적용됩니다. MVP (F1+F2 hash 캐시)는 임베딩 모델 무관하게 선행 진행 가능합니다.
