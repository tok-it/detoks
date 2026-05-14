# DeToks RAG Embedding Eval Dataset

이 데이터셋은 `/Users/siho/Downloads/DETOKS_EXECUTION_MEMORY_FLOW_AND_GAP.md`를 기준으로,
현재 저장소에 있는 관련 설계 문서들과 함께 RAG 임베딩 검색 성능을 평가할 수 있도록 만든 JSONL 데이터입니다.

참고 문서:
- `docs/TRACK_A_CACHE_SAFETY.md`
- `docs/TRACK_B_ACCOUNTING_GATE_PRIVACY.md`
- `docs/new_detoks_directionality/DAG_SESSION_RAG_FEATURES_AND_MVP.md`
- `docs/new_detoks_directionality/BGE_M3_RAG_EMBEDDING_MODEL_RATIONALE.md`

## 포맷

각 줄은 하나의 JSON 객체입니다.

- `id`: 샘플 식별자
- `category`: 평가 축
- `difficulty`: `easy`, `medium`, `hard`
- `query`: 한국어 검색 질의
- `gold`: 관련 섹션 라벨 배열

`gold` 값은 `문서경로::섹션명` 형식을 따릅니다.

## 용도

- `recall@k`
- `MRR`
- 섹션 단위 정답 문서 매칭

## 비고

- 질의는 실제 사용 맥락을 흉내 낸 한국어 문장으로 구성했습니다.
- 일부 질의는 코드 용어나 영어 키워드를 섞어 cross-lingual 검색 성능도 같이 볼 수 있게 했습니다.
