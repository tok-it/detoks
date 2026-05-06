# Documentation Management Policy

## 개요

DeToks 저장소의 문서를 체계적으로 관리하기 위한 정책입니다.

## 규칙

### ✅ Git 추적 대상 (공유 문서)

**docs/ 폴더 내 모든 문서**
- `ARCHITECTURE.md` - 시스템 아키텍처
- `PROJECT_STRUCTURE.md` - 폴더 구조
- `ROLES.md` - 팀원 역할 정의
- `SCHEMAS.md` - 데이터 스키마
- `STACK_VERSIONS.md` - 기술 스택 버전
- `ENGINEERING_GUIDELINES.md` - 개발 가이드
- `DEPENDENCY_WORKFLOW.md` - 의존성 관리
- `PIPELINE.md` - 파이프라인 설계
- 기타 필수 문서

**루트 파일**
- `README.md` - 프로젝트 개요 (기본 루트 추적 문서)
- `README.ko.md` - 한국어 사용자용 개요
- `README.en.md` - English user-facing overview

**GitHub 설정**
- `.github/pull_request_template.md` - PR 템플릿

---

### ❌ Git 무시 대상 (개인 문서)

**루트 .md 파일 (README variants 제외)**
```
/*.md                    # 모든 루트 .md 파일
!README.md              # 예외: README.md 추적
!README.ko.md          # 예외: 한국어 README 추적
!README.en.md          # 예외: English README 추적
```

**예시:**
- `AGENTS.md` → ❌ 추적 안 함 (로컬 유지)
- `session.md` → ❌ 추적 안 함 (로컬 유지)
- `task_classify.md` → ❌ 추적 안 함 (로컬 유지)
- `detoks_model.md` → ❌ 추적 안 함 (로컬 유지)

**기타 무시 대상**
- `.codex/` - 개인 스킬/설정
- `.devlogs/` - 개인 개발 로그
- `*.local.md` - 로컬 전용 문서

---

## 사용 방법

### 공유 문서 추가
```bash
# docs/ 폴더에 파일 추가
cp my_document.md docs/MY_DOCUMENT.md
git add docs/MY_DOCUMENT.md
```

### 개인 문서 작성
```bash
# 루트 또는 .codex/에 파일 추가 (자동으로 무시됨)
cat > session_notes.md << EOF
...개인 메모...
EOF

# 추적되지 않는 것 확인
git status                # session_notes.md 표시 안 됨
```

---

## 예외 처리

**새로운 공유 문서가 필요한 경우:**
1. docs/ 폴더에 작성
2. git add로 명시적 추적
3. PR로 리뷰 후 병합

**긴급으로 루트 .md 추적이 필요한 경우:**
```bash
git add -f SPECIAL_FILE.md    # 강제 추적
```

---

## 이점

✅ 저장소 크기 제어  
✅ 무분별한 문서 확산 방지  
✅ 공식 문서와 개인 노트 명확히 구분  
✅ CI/CD에서 일관된 문서 정책 유지  

---

## 변경 이력

- **2026-04-23**: 초기 정책 수립 (엄격한 관리)
