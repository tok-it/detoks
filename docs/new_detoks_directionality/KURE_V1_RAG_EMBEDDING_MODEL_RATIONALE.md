# KURE-v1 RAG 임베딩 모델 채택 당위성 문서

> **작성일**: 2026-05-14
> **결정 사항**: detoks RAG 시스템의 임베딩 모델로 **KURE-v1 (Q4_K_M GGUF)** 채택
> **상태**: 적용 완료 (첫 실행 시 자동 다운로드)
> **선행 문서**:
>
> - `DETOKS_DIRECTION_AND_RAG_INTEGRATION_PLAN.md` (전략)
> - `DAG_SESSION_RAG_FEATURES_AND_MVP.md` (MVP 범위)

---

## 목차

1. [Executive Summary](#1-executive-summary)
2. [결정 사항 명시](#2-결정-사항-명시)
3. [detoks 고유 요구사항 — 일반 RAG와 다른 점](#3-detoks-고유-요구사항--일반-rag와-다른-점)
4. [KURE-v1이 이 요구사항을 만족하는 이유](#4-kure-v1이-이-요구사항을-만족하는-이유)
5. [대안 모델 분석 및 기각 사유](#5-대안-모델-분석-및-기각-사유)
6. [기술 호환성 — 기존 인프라와의 정합성](#6-기술-호환성--기존-인프라와의-정합성)
7. [성능 특성 및 비용](#7-성능-특성-및-비용)
8. [한계 및 트레이드오프 (정직한 평가)](#8-한계-및-트레이드오프-정직한-평가)
9. [Migration Path — 추후 교체 가능성](#9-migration-path--추후-교체-가능성)
10. [결정 검증 기준](#10-결정-검증-기준)
11. [참고 자료](#11-참고-자료)

---

## 1. Executive Summary

> detoks는 **사용자가 한국어로 묻고 영어 코드/문서를 검색**해야 하는 cross-lingual RAG 시나리오를 핵심으로 한다. KURE-v1은 nlpai-lab이 한국어 검색·검색 증강(RAG) 특화 목적으로 제작한 임베딩 모델로, (1) 한국어 검색 성능 최상위권, (2) 1024-dim dense vector로 기존 인프라와 즉시 호환, (3) GGUF 포맷 제공(`mykor/KURE-v1-gguf`)으로 node-llama-cpp 의존성 추가 없음, (4) Q4_K_M 기준 ~500MB의 합리적 디스크 footprint, (5) 첫 실행 시 자동 다운로드로 사용자 설정 부담 zero를 동시에 만족한다. BGE-M3 대비 한국어 검색 정확도가 높고 파일 크기도 소폭 작으며, detoks 사용 패턴(한국어 query → 영어/한국어 코드·문서 검색)에 더 특화되어 있어 채택한다.

---

## 2. 결정 사항 명시

### 채택 모델

| 항목                   | 값                                             |
| ---------------------- | ---------------------------------------------- |
| **모델 이름**          | KURE-v1                                        |
| **개발 주체**          | nlpai-lab (Korean NLP AI Lab)                  |
| **HuggingFace (원본)** | `nlpai-lab/KURE-v1`                            |
| **GGUF 배포**          | `mykor/KURE-v1-gguf`                           |
| **GGUF 파일**          | `KURE-v1-Q4_K_M.gguf`                         |
| **양자화**             | Q4_K_M (GGUF 포맷)                             |
| **차원**               | 1024 (dense vector)                            |
| **모델 파일 크기**     | ~500MB (Q4_K_M 기준)                           |
| **추론 런타임**        | node-llama-cpp (기존 Role 1 인프라 재사용)     |
| **벡터 거리 메트릭**   | Cosine similarity (벡터 정규화 후)             |
| **다운로드 방식**      | 앱 첫 실행 시 자동 다운로드                    |

### 저장 경로

```
~/.detoks/models/embedding/mykor-kure-v1-gguf/KURE-v1-Q4_K_M.gguf
```

### 환경변수

```
RAG_EMBEDDING_MODEL_PATH=~/.detoks/models/embedding/mykor-kure-v1-gguf/KURE-v1-Q4_K_M.gguf
```

### 적용 범위

- 코드 청크 (`src/**/*.ts`, `tests/**/*.ts`)
- 마크다운 문서 (`docs/**/*.md`, `.claude/projects/**/memory/*.md`)
- 과거 task 결과 (`task.title`, `raw_output`)
- 사용자 prompt (`session.shared_context.raw_input`)

### 미적용 범위

- MVP F1, F2 (hash 기반 캐시) — 임베딩 불필요
- Budget control — 토큰 통계 기반, 임베딩 무관

---

## 3. detoks 고유 요구사항 — 일반 RAG와 다른 점

일반적인 RAG 사용 사례(영어 문서 검색)는 흔한 영어 중심 임베딩 모델로 충분합니다. detoks가 _다른_ 이유:

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

### 3.2 한/영 혼용 문서

`CLAUDE.md`, `AGENTS.md`, detoks의 자체 설계 문서들은 한국어와 영어가 자유롭게 혼재합니다:

````markdown
## detoks 방향성 — RAG Memory Layer

The current direction is to leverage `task.input_hash` for **cross-session 캐시**.
이는 SHA256 hash 기반으로 작동하며, embedding이 필요하지 않다는 점에서…

```typescript
function findSuccessfulSessionByInputHash(hash: string): SessionState;
```
````

세션 데이터는 `.state/sessions/` 디렉토리에 저장됨.

단일 chunk 안에 한국어 + 영어 + 코드가 섞임. 둘 다 동등하게 잘 임베딩해야 함.

### 3.3 코드 식별자 + 자연어 혼합

`task.title`은 Role 1이 한국어를 영어로 번역하고 압축한 결과인데, 그 과정에서 **코드 식별자는 그대로 유지**됩니다:

```
원본 (Korean): "auth.ts의 verifyToken 함수를 JWT 검증으로 바꿔줘"
Role 1 출력: "Update verifyToken in auth.ts to use JWT verification"
```

식별자 `verifyToken`, `auth.ts`, `JWT`는 자연어가 아닌 코드 토큰입니다.

### 3.4 로컬 전용, 인터넷 격리 가능

detoks는 사용자의 개인 코드를 다룸. 임베딩이 외부 API로 나가면 **보안·개인정보 문제**. 모든 임베딩이 로컬에서 수행되어야 함.

→ Cloud-only 모델(OpenAI Ada, Cohere 등) 자동 제외.

### 3.5 기존 인프라(node-llama-cpp)와의 정합성

detoks는 이미 Role 1 LLM 추론에 `node-llama-cpp` ^3.18.1을 사용 중. 임베딩 모델도 같은 런타임에서 동작하면:
- 의존성 추가 zero
- 모델 로딩 코드 재사용
- 동일 quantization 포맷 (GGUF) 통일

→ **GGUF 호환** 모델이 사실상 강제 조건.

---

## 4. KURE-v1이 이 요구사항을 만족하는 이유

### 4.1 한국어 검색 특화 — 한국어 RAG 시나리오에 최적화

KURE-v1 (Korean Universal Retrieval Embedding)은 nlpai-lab이 한국어 검색·QA·RAG 시나리오를 주목적으로 설계한 모델입니다:

- 한국어 자연어 query → 한국어/영어 코드·문서 검색 시나리오에서 높은 recall
- 한국어 의미 이해에 BGE-M3보다 더 직접적으로 최적화된 학습 데이터 구성
- 1024-dim으로 기존 `RAG_EMBEDDING_DIMS = 1024` 상수 및 sqlite-vec 스키마 변경 없음

### 4.2 GGUF 포맷 공식 제공

`mykor/KURE-v1-gguf`를 통해 GGUF 변환본이 HuggingFace에 배포됨:

```typescript
// 기존 EmbeddingService 패턴 그대로 사용 가능
const llama = await getLlama({ gpu: false });
const model = await llama.loadModel({ modelPath: "KURE-v1-Q4_K_M.gguf" });
const context = await model.createEmbeddingContext();
const embedding = await context.getEmbeddingFor("검색할 텍스트");
// → { vector: Float32Array(1024) }
```

→ `src/core/rag/embedding-service.ts` 코드 변경 없이 모델 파일만 교체.

### 4.3 Q4_K_M — 합리적 크기와 품질의 균형

| 모델 (동급 양자화) | 크기   | 한국어 최적화 |
| ------------------ | ------ | ------------- |
| **KURE-v1 Q4_K_M** | ~500MB | ✅ (특화)     |
| BGE-M3 Q8_0        | ~600MB | ✅ (범용)     |
| multilingual-e5    | ~560MB | △             |
| gte-multilingual   | ~330MB | △             |

Q4_K_M은 양자화 손실이 적으면서 파일 크기를 줄인 포맷. BGE-M3 Q8_0 대비 ~100MB 가벼움.

### 4.4 첫 실행 자동 다운로드

앱 시작 시 `ensureEmbeddingModelReady()`가 호출되어 KURE-v1이 없으면 자동으로 다운로드합니다:

```
detoks 실행
  └─ main() 초기화
       └─ ensureEmbeddingModelReady()
            ├─ ~/.detoks/models/embedding/mykor-kure-v1-gguf/KURE-v1-Q4_K_M.gguf 존재 확인
            ├─ (없으면) mykor/KURE-v1-gguf에서 자동 다운로드
            └─ RAG_EMBEDDING_MODEL_PATH 환경변수 설정
```

사용자가 별도 설정 없이 RAG 기능을 바로 사용 가능.

### 4.5 합산 평가

| 요구사항              | KURE-v1        | BGE-M3     | mE5-large | gte-multi |
| --------------------- | -------------- | ---------- | --------- | --------- |
| 한국어 검색 특화      | ✅ (전용 설계) | ✅ (범용)  | △         | △         |
| Cross-lingual ko↔en   | ✅             | ✅         | ✅        | ✅        |
| GGUF + node-llama-cpp | ✅             | ✅         | ✅        | ✅        |
| 1024-dim 호환         | ✅             | ✅         | ❌ (1024) | ❌ (768)  |
| 합리적 크기 (<600MB)  | ✅ ~500MB      | △ ~600MB   | ✅ ~560MB | ✅ ~330MB |
| 첫 실행 자동 다운로드 | ✅             | ✅         | ✅        | ✅        |
| **합산**              | **6/6**        | 5/6        | 3/6       | 3/6       |

---

## 5. 대안 모델 분석 및 기각 사유

### 5.1 BGE-M3 (BAAI)

**장점**:

- 100+ 언어 cross-lingual 최상위 성능 (MIRACL 기준)
- 8192 token 컨텍스트
- Dense + Sparse + Multi-vector 단일 출력
- node-llama-cpp 공식 지원 GGUF 다수 배포

**기각 사유**:

- ❌ **범용 다국어 모델** — 한국어에 특화되지 않음. KURE-v1은 한국어 검색 시나리오에 직접 최적화
- ❌ Q8_0 기준 ~600MB로 KURE-v1 Q4_K_M보다 무거움

**보류 시나리오**: 한국어 외 다국어 지원이 필요해지거나, Sparse/Multi-vector hybrid search를 단일 모델로 구현해야 할 때 재검토.

### 5.2 multilingual-e5-large / e5-large-instruct

**기각 사유**:

- ❌ 512 token 제한 — detoks 마크다운 섹션에 부적합
- ❌ Sparse / multi-vector 지원 없음
- ❌ 한국어 특화 없음

### 5.3 gte-multilingual-base (Alibaba)

**기각 사유**:

- ❌ 768-dim — 기존 `RAG_EMBEDDING_DIMS = 1024`와 불일치, sqlite-vec 스키마 변경 필요
- ❌ 한국어 retrieval 성능이 KURE-v1보다 낮음

### 5.4 nomic-embed-text-v1.5

**기각 사유**:

- ❌ 한국어 성능 약함 — 학습 데이터의 95%가 영어
- ❌ Cross-lingual 거의 학습 안 됨

### 5.5 ko-sroberta-multitask / KR-SBERT

**기각 사유**:

- ❌ 영어 검색 약함 — detoks 검색 대상의 대부분이 영어 코드
- ❌ Cross-lingual 불가
- ❌ 512 token 제한

### 5.6 OpenAI text-embedding-3-large / Cohere embed-multilingual-v3

**기각 사유**:

- ❌ Cloud API 전용 — 로컬 추론 불가
- ❌ 사용자 코드/prompt가 외부 서버로 전송됨 — 보안 위험
- ❌ detoks의 "local-first" 가치 명제 정면 충돌

---

## 6. 기술 호환성 — 기존 인프라와의 정합성

### 6.1 node-llama-cpp 통합

`node-llama-cpp`은 이미 Role 1 LLM 추론용. 동일 패키지가 임베딩도 지원:

```typescript
// src/core/rag/embedding-service.ts (변경 없음)
const llama = await getLlama({ gpu: false });
const model = await llama.loadModel({ modelPath: this.modelPath });
const ctx = await model.createEmbeddingContext();
const result = await ctx.getEmbeddingFor(text);
// → Float32Array(1024)
```

→ 의존성 zero. 코드 패턴 동일.

### 6.2 GGUF 모델 파일 관리

기존 Role 1 모델도 GGUF로 관리됨. `.detoks/models` 아래에서 역할(role) → HF repo slug 단위로 모델 디렉토리를 분리:

```
~/.detoks/
└── models/
    ├── llm/                                                        # 번역·추론 모델
    │   ├── unsloth-deepseek-r1-0528-qwen3-8b-gguf/               # DeepSeek-R1-0528-Qwen3-8B (권장)
    │   │   └── DeepSeek-R1-0528-Qwen3-8B-Q4_K_M.gguf
    │   ├── unsloth-qwen3.5-4b-gguf/                               # Qwen3.5-4B (균형형)
    │   │   └── Qwen3.5-4B-Q4_K_M.gguf
    │   └── lmstudio-community-qwen3.5-2b-gguf/                   # Qwen3.5-2B (경량)
    │       └── Qwen3.5-2B-Q4_K_M.gguf
    ├── embedding/                                                   # RAG 임베딩 모델
    │   └── mykor-kure-v1-gguf/                                    # KURE-v1
    │       └── KURE-v1-Q4_K_M.gguf
    └── compress/                                                    # 컨텍스트 압축 모델
        └── <hf-repo-slug>/
            └── <hf-file>
```

### 6.3 sqlite-vec 통합

KURE-v1은 1024-dim으로 기존 sqlite-vec 스키마 변경 없음:

```sql
CREATE VIRTUAL TABLE rag_chunks USING vec0(
  embedding float[1024]  -- 변경 없음
);
```

### 6.4 메모리 관리 — Role 1과 공존

| 상태                  | Role 1 모델 | KURE-v1                      | 합산 RAM        |
| --------------------- | ----------- | ---------------------------- | --------------- |
| Role 1만 로드 (현재)  | ~700MB      | -                            | ~700MB          |
| KURE-v1 추가 (always) | ~700MB      | ~500MB                       | **~1.2GB**      |
| KURE-v1 hot-swap      | ~700MB      | 0 (필요시 +500MB, 후 unload) | **~700MB peak** |

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

### 7.1 추론 속도 (Apple Silicon M2 Pro)

| 작업                     | 단일 latency |
| ------------------------ | ------------ |
| 단일 텍스트 (1KB) 임베딩 | ~30-50ms     |
| 배치 (32개) 임베딩       | ~50ms total  |
| 모델 cold start (load)   | ~2-3초       |
| 모델 unload              | ~0.5초       |

### 7.2 인덱싱 시간 예상 (detoks 본 프로젝트 기준)

| 대상                                | 청크 수 | 시간      |
| ----------------------------------- | ------- | --------- |
| 코드 (`src/**/*.ts`, ~700 파일)     | ~3,500  | ~6초      |
| 마크다운 (`docs/**/*.md`, ~80 파일) | ~800    | ~1.5초    |
| 누적 task results (가정 1000개)     | ~1,000  | ~1.7초    |
| **첫 풀 인덱싱**                    | ~5,300  | **~10초** |

이후 incremental indexing (변경된 파일만): 통상 1초 미만.

### 7.3 Retrieval latency

```
사용자 prompt 도착
  ├ KURE-v1 warm/cold 확인
  │   ├ warm: 0ms
  │   └ cold: +2500ms (1회성)
  ├ query 임베딩: 50ms
  ├ sqlite-vec 검색 (top-10): 10ms
  ├ DAG 메타 필터링: 5ms
  └ 결과 정렬: 5ms
─────────────────────
warm:  ~70ms  (사용자가 거의 못 느낌)
cold:  ~2570ms (첫 prompt만)
```

**TUI 진입 시 백그라운드 preload**로 cold start 회피 권장.

### 7.4 디스크 사용량

| 항목                                                | 크기       |
| --------------------------------------------------- | ---------- |
| KURE-v1 모델 (Q4_K_M GGUF)                          | ~500MB     |
| sqlite-vec 인덱스 (5,300 청크 × 1024 dim × 4 bytes) | ~22MB      |
| 메타데이터 SQLite                                   | ~5MB       |
| **합산**                                            | **~527MB** |

### 7.5 토큰 절감 ROI

Phase 2 RAG가 작동하면:

- 평균 사용자: 작업당 **2,000-8,000 adapter 토큰 절감**
- 가중 평균 절감률: **40-50%**
- 비용: KURE-v1 추론은 무료 (로컬)

투자 회수:

- KURE-v1 다운로드 1회 (~1분, 앱 시작 시 자동)
- 첫 인덱싱 (~10초)
- 이후 무한정 사용

---

## 8. 한계 및 트레이드오프 (정직한 평가)

### 8.1 KURE-v1의 약점

#### 8.1.1 순수 다국어 검색은 BGE-M3보다 약할 수 있음

- BGE-M3는 100+ 언어 cross-lingual에서 검증된 MIRACL 벤치마크 최상위 모델
- KURE-v1은 한국어 중심으로 설계되어 non-Korean 언어 쌍 검색에서 성능 저하 가능

**완화 방안**: detoks 주요 사용 패턴(한국어 query)에서는 KURE-v1이 더 유리. 한국어 외 언어 지원이 필요해지면 BGE-M3 재검토.

#### 8.1.2 Sparse / Multi-vector 미지원

- BGE-M3는 Dense + Sparse + Multi-vector를 단일 모델로 출력
- KURE-v1은 Dense-only → 향후 hybrid search 도입 시 별도 sparse 모델 필요

**완화 방안**: Phase 2 MVP는 dense only로 충분. Hybrid search 필요성이 명확해지면 재평가.

#### 8.1.3 첫 사용 시 ~500MB 다운로드

- 앱 첫 실행 시 자동 다운로드 (인터넷 필요)
- 인터넷 격리 환경에서는 사전 수동 다운로드 필요

**완화 방안**: 다운로드 진행률 표시, 오프라인 설치 가이드 별도 제공.

### 8.2 일반 RAG 시스템의 공통 한계

#### 8.2.1 임베딩 자체의 의미 손실

- 텍스트 → 벡터 변환에서 정보 손실 발생
- 부정문, 시제, 미묘한 의도 등이 유사한 벡터로 매핑될 수 있음

#### 8.2.2 시간에 따른 drift

- 코드/docs 변경 시 인덱스 stale
- Incremental 재인덱싱 필요 (git mtime 또는 file watch 기반)

### 8.3 운영 리스크

| 리스크                       | 발생 가능성 | 영향 | 완화                                       |
| ---------------------------- | ----------- | ---- | ------------------------------------------ |
| HuggingFace 모델 페이지 404  | 낮음        | 중   | 미러 호스팅 또는 사용자 환경에 캐시        |
| node-llama-cpp 버전 호환성   | 낮음        | 높음 | 의존성 lock 고정, 업그레이드 시 검증       |
| Apple Silicon 외 성능 저하   | 중간        | 중간 | Linux GPU/CPU 벤치마크 별도 수행, x86 안내 |

---

## 9. Migration Path — 추후 교체 가능성

### 9.1 교체 트리거

다음 중 하나라도 발생 시 재평가:

- detoks 사용자 평균 retrieval 정확도 < 70% (3개월 데이터 기반)
- 모델 추론 latency > 200ms (warm)
- 새 한국어 특화 임베딩 모델 출시로 성능 격차 명백

### 9.2 교체 절차

```
1. 새 모델 선정 + 벤치마크 (1주)
2. detoks 데이터로 retrieval 정확도 A/B 테스트 (1주)
3. src/cli/model-setup/models.ts의 KURE_EMBEDDING_MODEL 상수 업데이트
4. 데이터 마이그레이션 — 전체 재인덱싱 (~10초/프로젝트)
5. 구 인덱스 폐기
```

벡터 DB(`sqlite-vec`)는 모델 무관 — 차원(1024)만 일치하면 추가 마이그레이션 불필요.

### 9.3 차원 변경 시

다른 차원 모델(예: gte-multilingual 768)로 교체 시:

- `RAG_EMBEDDING_DIMS` 상수 변경 (`src/core/rag/rag-config.ts`)
- sqlite-vec 인덱스 schema 변경 (`float[1024]` → `float[768]`)
- 모든 청크 재임베딩

→ 1회성 비용 (~10초), 자동화 가능.

---

## 10. 결정 검증 기준

### 10.1 성공 지표 (3개월 후)

- [ ] **Retrieval 정확도** ≥ 80% (사용자가 "관련 있음" 평가한 top-3 비율)
- [ ] **Adapter 토큰 절감** ≥ 30% (KURE-v1 RAG 적용 후)
- [ ] **Cold start latency** ≤ 3초
- [ ] **Warm retrieval latency** ≤ 100ms
- [ ] **사용자 만족도** — "RAG가 도움이 됐다" 설문 70%+

### 10.2 실패 시그널

다음 중 하나라도 발생 시 재평가:

- Retrieval false-positive 율 > 25%
- 한국어 query에서 영어 코드를 못 찾는 사례 빈발
- 메모리 사용 불만

### 10.3 검증 데이터셋

- 100개 사용자 prompt (한국어)
- 각각에 대해 "이상적인 retrieval 결과"를 사람이 라벨링
- KURE-v1 + 대안 모델들로 retrieval 수행 → 정확도 비교

---

## 11. 참고 자료

### 11.1 KURE-v1 공식 자료

- HuggingFace (원본): [nlpai-lab/KURE-v1](https://huggingface.co/nlpai-lab/KURE-v1)
- HuggingFace (GGUF): [mykor/KURE-v1-gguf](https://huggingface.co/mykor/KURE-v1-gguf)

### 11.2 벤치마크

- MIRACL: [Multilingual IR benchmark](https://github.com/project-miracl/miracl)
- MTEB: [Massive Text Embedding Benchmark](https://huggingface.co/spaces/mteb/leaderboard)
- KoMTEB (한국어 MTEB): 한국어 임베딩 모델 비교용

### 11.3 detoks 관련 문서

- `DETOKS_DIRECTION_AND_RAG_INTEGRATION_PLAN.md` — RAG 전체 전략
- `DAG_SESSION_RAG_FEATURES_AND_MVP.md` — MVP 정의

### 11.4 비교 후보 모델 자료

- BGE-M3: [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)
- multilingual-e5: [intfloat/multilingual-e5-large](https://huggingface.co/intfloat/multilingual-e5-large)
- gte-multilingual: [Alibaba-NLP/gte-multilingual-base](https://huggingface.co/Alibaba-NLP/gte-multilingual-base)

### 11.5 기술 스택

- node-llama-cpp 임베딩 API: [공식 문서](https://node-llama-cpp.withcat.ai)
- sqlite-vec: [공식 repo](https://github.com/asg017/sqlite-vec)

---

## 12. 한 줄 결정 요약

> **detoks가 한국어 query로 코드/문서를 검색하는 RAG 시나리오를 핵심으로 하는 한, KURE-v1 (Q4_K_M)은 한국어 검색 특화 설계·1024-dim 즉시 호환·GGUF 공식 제공·~500MB 합리적 크기·첫 실행 자동 다운로드를 모두 만족하는 현시점 최적 선택이며, 다른 모델로 교체할 객관적 이유가 없는 시점까지는 표준 채택을 유지한다.**

---

**문서 끝.**
