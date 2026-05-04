# Release Notes Template

이 문서는 `claude` 어댑터가 포함된 새 npm 배포 버전을 안내할 때 사용할 수 있는 릴리스 노트 템플릿입니다.

## 예시 제목

- `detoks v0.x.x — Claude adapter 지원 추가`
- `feat: add claude adapter`

## 예시 본문

### What’s new

- `claude` adapter가 새로 추가되었습니다.
- 이제 `--adapter claude` 또는 REPL의 `/adapter claude`로 Claude Code를 사용할 수 있습니다.
- `claude` 로그인/상태 조회도 detoks UI에서 일관되게 확인할 수 있습니다.

### Update required

기존 설치본을 사용 중이라면 최신 버전으로 업데이트해야 `claude` adapter가 표시됩니다.

### 전역 설치

```bash
npm install -g <npm-package-name>@latest
```

### 전역 업데이트

```bash
npm update -g <npm-package-name>
```

### 로컬 설치

```bash
npm install <npm-package-name>@latest
```

### Notes

- `<npm-package-name>`은 실제 npm 배포 이름으로 바꿔서 사용하세요.
- GitHub Releases와 README 상단 안내를 함께 업데이트하면 사용자 인지율이 높습니다.

## 운영 팁

- 릴리스 제목에 `Claude` 또는 `claude adapter`를 넣으면 검색성이 좋습니다.
- README 상단에는 1줄짜리 업데이트 안내만 두고, 상세 내용은 이 릴리스 노트로 분리하는 방식이 가장 깔끔합니다.
- CLI 첫 실행 안내를 추가할 경우에는 한 번만 노출되도록 설계하는 것이 좋습니다.
