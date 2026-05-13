### 1. 스크롤 상태 UX

  - [ ] 사용자가 현재 최신 위치(bottom) 인지 표시
  - [ ] 위로 스크롤한 상태면 기록 탐색 중 같은 힌트 표시
  - [ ] End로 최신 복귀 가능하다는 안내 추가
  - [ ] 새 출력 도착 시 auto-follow on/off 상태를 명확히 유지

  ### 2. 중앙 콘텐츠 구획 정리

  - [ ] Prompt 구역 라벨 톤 정리
  - [ ] Summary 구역 라벨 톤 정리
  - [ ] separator 길이/색상/여백 통일
  - [ ] 빈 상태 문구를 현재 정보 구조와 맞게 간결화

  ### 3. 원본 CLI 가독성 개선

  - [ ] 메타 정보 줄 회색 톤 계층화
  - [ ] key/value 강조 차등 적용
  - [ ] 본문 응답은 더 눈에 띄게 유지
  - [ ] 긴 줄 wrap 시 읽기 흐름 확인

  ### 4. 입력창 UX 정리

  - [ ] 실행 가능 상태/실행 중 상태 표시 명확화
  - [ ] placeholder 문구 다듬기
  - [ ] slash command 도움말이 과하면 축소
  - [ ] 입력창과 footer 시각 구분 보정

  ### 5. footer/status 피드백

  - [ ] 현재 adapter / mode / cwd 표시 밀도 조정
  - [ ] 스크롤 상태와 실행 상태가 겹치지 않게 정리
  - [ ] 너무 자주 바뀌는 정보는 축약

  ### 6. 테스트 정리

  - [ ] cli-smoke는 최소 contract만 유지
  - [ ] viewport/summary/embedded 렌더는 unit test 강화
  - [ ] ANSI/alt-screen 타이밍 의존 assertion 제거
  - [ ] CI에서 flaky한 TUI integration 범위 최소화
