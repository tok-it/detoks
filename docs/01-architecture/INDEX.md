# 01-architecture (아키텍처 & 설계)

전체 시스템의 아키텍처, 파이프라인, API, 스키마에 관한 문서

## 📑 폴더 구조

### overview/ — 전체 개요
- **ARCHITECTURE.md** — 시스템 전체 아키텍처 설명
- **PROJECT_STRUCTURE.md** — 프로젝트 폴더/파일 구조
- **ROLES.md** — Role1/Role2/Role3의 책임 정의

### pipeline/ — 파이프라인 설계
- **PIPELINE.md** — 파이프라인 기본 개념
- **CLI_WRAPPER_PIPELINE.md** — CLI 래퍼 파이프라인 흐름
- **SHARED_DATA_FLOW.md** — 역할 간 데이터 흐름
- **SCHEMA_FLOW.md** — 스키마 변환 흐름
- **DES_DATA_FLOW.md** — 상세 데이터 흐름 분석
- **REAL_MODE_PIPELINE_FLOW_PLAN.md** — Real 모드 파이프라인 계획

### api/ — API 정의
- **API_SPEC.md** — REST/GraphQL API 명세

### schemas/ — 데이터 스키마
- **SCHEMAS.md** — 스키마 정의 및 검증
- **TYPE_DEFINITION.md** — TypeScript 타입 정의

---

## 🎯 읽기 순서 (처음 접할 때)

1. **overview/ARCHITECTURE.md** — 전체 그림 이해
2. **overview/PROJECT_STRUCTURE.md** — 폴더 구조 파악
3. **pipeline/PIPELINE.md** — 기본 파이프라인 개념
4. **pipeline/SHARED_DATA_FLOW.md** — 역할 간 협력 방식
5. **overview/ROLES.md** — 각 역할의 책임

---

## 💡 빠른 참조

| 찾는 것 | 파일 |
|---------|------|
| 시스템 전체 구조 | overview/ARCHITECTURE.md |
| 폴더/파일 위치 | overview/PROJECT_STRUCTURE.md |
| CLI 실행 흐름 | pipeline/CLI_WRAPPER_PIPELINE.md |
| Role1/2/3 책임 | overview/ROLES.md |
| API 엔드포인트 | api/API_SPEC.md |
| 데이터 스키마 | schemas/SCHEMAS.md |
