# docs 가이드

`docs/`는 detoks의 설계, 운영, 계획 문서를 모아 둔 저장소입니다.

## 먼저 알 것

- 이 폴더의 **진입점은 `README.md`**, 전체 문서 맵은 [INDEX.md](INDEX.md)입니다.
- `01-architecture/` 같은 번호 폴더는 **문서 분류용 INDEX 허브**입니다.
- 실제 명세 파일은 아직 대부분 `docs/` 루트에 있습니다.
- 따라서 "어느 주제부터 읽어야 하는지"는 섹션 INDEX에서, "정확한 파일 경로"는 루트 INDEX에서 확인하는 흐름이 가장 빠릅니다.

## 빠른 시작

### 시스템 구조를 먼저 볼 때

1. [INDEX.md](INDEX.md)
2. [ARCHITECTURE.md](ARCHITECTURE.md)
3. [PIPELINE.md](PIPELINE.md)
4. [SCHEMAS.md](SCHEMAS.md)

### 구현 전에 규칙을 볼 때

1. [ENGINEERING_GUIDELINES.md](ENGINEERING_GUIDELINES.md)
2. [DOCUMENTATION_POLICY.md](DOCUMENTATION_POLICY.md)
3. [TESTING_GUIDE.md](TESTING_GUIDE.md)

### 로컬 LLM / 런타임 이슈를 볼 때

1. [LLAMA_CPP_SERVER_SPEC.md](LLAMA_CPP_SERVER_SPEC.md)
2. [PORT_CONFLICT_SOLUTION.md](PORT_CONFLICT_SOLUTION.md)

## 섹션 이동

- [01-architecture/INDEX.md](01-architecture/INDEX.md)
- [02-token-efficiency/INDEX.md](02-token-efficiency/INDEX.md)
- [03-roles-workflow/INDEX.md](03-roles-workflow/INDEX.md)
- [04-setup-deployment/INDEX.md](04-setup-deployment/INDEX.md)
- [05-testing-quality/INDEX.md](05-testing-quality/INDEX.md)
- [06-troubleshooting/INDEX.md](06-troubleshooting/INDEX.md)
- [07-guidelines-policies/INDEX.md](07-guidelines-policies/INDEX.md)
- [08-planning-proposals/INDEX.md](08-planning-proposals/INDEX.md)

## 문서 정리 원칙

- 루트 `INDEX.md`는 마스터 인덱스 역할만 맡습니다.
- 섹션 `INDEX.md`는 해당 주제의 읽기 순서와 핵심 문서를 안내합니다.
- 개별 명세 파일은 가능한 한 **source of truth** 하나만 두고, 다른 문서는 그 파일을 참조하도록 유지합니다.
