기술적으로 보면, 이 프로젝트의 상태 관리는 “단순 텍스트 저장”도 아니고, 전형적인 RAG만으로 해결하는 것도 아닙니다.
  가장 맞는 건:

  > 구조화된 상태 저장 + 요약 압축 + 필요 시 선택적 retrieval

  입니다.

  ———

  ## 결론

  이 프로젝트는 기본적으로 RAG가 메인 기술은 아닙니다.

  왜냐하면 이 문제는 보통

  - 외부 지식 검색
  - 대규모 문서 검색

  문제라기보다,

  - 세션 상태 관리
  - 작업 문맥 압축
  - 다음 턴에 필요한 정보만 복원

  문제이기 때문입니다.

  즉, 핵심은 knowledge retrieval보다
  session state orchestration에 가깝습니다.

  ———

  # 1) 단순 텍스트 저장만으로는 부족한 이유

  예를 들어 이전 대화를 그냥 파일에 쌓아두는 방식:

  {
    "history": [
      "user: ...",
      "assistant: ...",
      "user: ...",
      "assistant: ..."
    ]
  }

  이건 구현은 쉽지만 문제 많습니다.

  ### 문제

  - 길어질수록 다시 읽는 비용 증가
  - 중복 정보 많음
  - 현재 작업과 무관한 정보도 같이 끌려옴
  - 검색/필터링/재조합이 어려움
  - 결국 “긴 대화 다시 붙이기”가 됨

  즉, 이건 그냥 로그 저장이지
  좋은 상태 관리가 아닙니다.

  ———

  # 2) 그렇다고 전부 RAG로 가는 것도 과함

  RAG는 보통 이런 상황에 강합니다:

  - 문서가 많음
  - 외부 지식 기반 검색이 필요함
  - 의미 유사도 기반 문서 retrieval이 중요함

  예:

  - 사내 문서 검색
  - 매뉴얼/정책/위키 검색
  - 긴 문서 컬렉션에서 관련 문단 찾기

  그런데 지금 프로젝트의 핵심 상태는 보통 이런 것들입니다:

  - 현재 목표
  - 현재 단계
  - 완료한 작업
  - 실패 원인
  - 다음 액션
  - 현재 선택된 파일/모듈
  - 결정된 설계 규칙

  이건 문서 검색보다 세션 상태 데이터에 가깝습니다.

  그래서 전부를 벡터DB에 넣고 semantic search 하는 건
  오버엔지니어링일 가능성이 큽니다.

  ———

  # 3) 이 프로젝트에 맞는 기술적 구조

  ## 기본 구조

  ### A. 구조화된 상태 저장소

  예:

  type SessionState = {
    goal: string;
    current_task: string | null;
    completed_tasks: string[];
    key_decisions: string[];
    active_files: string[];
    summaries: {
      rolling: string;
      latest_checkpoint: string | null;
    };
    artifacts: {
      task_results: Record<string, unknown>;
      errors: string[];
    };
  };

  이게 핵심입니다.

  즉 상태는:

  - 자유 텍스트 전체가 아니라
  - 명시적 필드 구조로 저장

  ———

  ### B. 요약 텍스트 저장

  구조화 데이터만으로 부족한 부분은
  rolling summary 형태의 압축 텍스트를 둡니다.

  예:

  {
    "rolling_summary": "User is implementing CLI dependency workflow. Helper scripts added. Remaining work: onboarding docs and validation."
  }

  이건 필요합니다.
  왜냐하면 모든 상태를 완전히 정형화할 수는 없기 때문입니다.

  즉,

  - 정형 상태: 기계가 쓰기 좋음
  - 요약 텍스트: 모델이 읽기 좋음

  둘 다 필요합니다.

  ———

  ### C. 체크포인트 저장

  작업 단위가 끝날 때마다 checkpoint 생성:

  {
    "checkpoint_id": "cp_003",
    "title": "dependency workflow completed",
    "summary": "...",
    "changed_files": ["README.md", "docs/DEPENDENCY_WORKFLOW.md"],
    "next_action": "set up onboarding docs"
  }

  이러면 긴 세션 전체 대신
  최근 체크포인트 + 현재 상태만 불러오면 됩니다.

  ———

  # 4) 그럼 RAG는 아예 안 쓰나?

  아예 안 쓰는 건 아닙니다.
  다만 보조 수단으로 쓰는 게 맞습니다.

  ## RAG를 쓰면 좋은 지점

  ### 1. Docs / 설계 문서 검색

  - docs/*.md
  - README
  - 역할 문서
  - 아키텍처 문서

  이건 RAG 또는 검색 인덱싱이 유용할 수 있습니다.

  ### 2. 과거 체크포인트가 매우 많아졌을 때

  checkpoint가 수십~수백 개 쌓이면

  - 최근 것만으로 부족할 수 있고
  - 의미 기반 검색이 필요할 수 있음

  이때는 vector search를 붙일 수 있습니다.

  ### 3. 실패 사례/수정 이력 검색

  예:

  - 예전에 비슷한 에러를 어떻게 고쳤는지
  - 어떤 설계 결정을 왜 했는지

  이런 건 semantic retrieval이 도움됩니다.

  ———

  # 5) 그래서 최종적으로는 어떤 모델이냐

  ## 추천 아키텍처

  ### Layer 1: 로그 저장

  - 원본 대화/실행 로그
  - 디버깅/감사용
  - 직접 컨텍스트로는 잘 안 씀

  ### Layer 2: 구조화 상태 저장

  - 현재 목표
  - 현재 task
  - key decisions
  - active files
  - next actions
  - task results

  이게 실제 운영 핵심

  ### Layer 3: 요약 저장

  - rolling summary
  - checkpoint summary
  - compact session summary

  ### Layer 4: 선택적 retrieval

  - docs 검색
  - 오래된 checkpoint 검색
  - 과거 작업 retrieval

  즉:

  > 기본은 structured state store + summaries
  > RAG는 필요할 때 붙는 보조 retrieval layer

  ———

  # 6) 구현 기술 관점에서 보면

  ## 초기 MVP

  RAG 없이 시작 가능

  ### 저장 방식

  - JSON 파일
  - SQLite
  - 로컬 파일 기반 state store

  예:

  .state/
    session.json
    checkpoints/
      cp_001.json
      cp_002.json
    summaries/
      rolling.md

  이 정도로도 충분히 시작 가능합니다.

  ———

  ## 중기 확장

  세션/작업 수가 늘어나면:

  - SQLite로 구조화 상태 저장
  - FTS(full-text search) 붙이기
  - 필요하면 embedding/vector retrieval 추가

  즉 순서는 보통:

  1. 정형 상태 저장
  2. 요약 압축
  3. 텍스트 검색
  4. 필요 시 RAG/벡터 검색

  ———

  # 7) 기술적으로 가장 중요한 포인트

  ## 상태 관리와 RAG는 역할이 다릅니다

  ### 상태 관리

  - 현재 시스템이 무엇을 하고 있는지 저장
  - deterministic
  - workflow 중심

  ### RAG

  - 관련 정보를 검색해서 모델 입력에 넣음
  - probabilistic
  - retrieval 중심

  이 프로젝트의 문제는 1차적으로 상태 관리 문제입니다.

  그래서 RAG만 붙인다고 해결되지 않습니다.

  ———

  # 8) 가장 현실적인 답

  이 프로젝트는 기술적으로

  - 단순 텍스트 저장만으로는 부족하고
  - 전면적인 RAG도 과하고
  - 구조화된 상태 저장 + 압축 요약 + 선택적 검색이 가장 적절합니다.

  ———

  ## 한 줄 요약

  > 이 프로젝트의 상태 관리는 RAG 기반 지식검색 시스템이라기보다, 구조화된 세션 상태 저장 시스템이고, RAG는 문서나 과거 기록 검색이 필요할 때만 보조적으로 붙이는 게 맞습니다.