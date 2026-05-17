# 번역 모델 벤치마크 분석

- 생성 시각: 2026-05-17T05:37:57.613Z
- 실행 모드: 번역 벤치마크 실행
- 모델 수: 1

## 모델별 종합 비교

| 모델 | 입력 수 | 성공률 | 평균 추론 시간 | 평균 출력 토큰 | 검증 실패 | 한국어 잔존 | fallback span | 평균 ref 유사도 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lmstudio-community/Qwen3.5-2B-GGUF | 100 | 99.000% | 1.281s | 52.150 | 1 | 1 | 19 | 0.929 |

## 텍스트 막대 시각화

### 성공률

| 모델 | 값 | 시각화 |
| --- | ---: | --- |
| lmstudio-community/Qwen3.5-2B-GGUF | 99.000% | `########################` |

### 평균 latency

| 모델 | 값 | 시각화 |
| --- | ---: | --- |
| lmstudio-community/Qwen3.5-2B-GGUF | 1.281s | `########################` |

### reference similarity

| 모델 | 값 | 시각화 |
| --- | ---: | --- |
| lmstudio-community/Qwen3.5-2B-GGUF | 0.929 | `######################--` |

### validation failure count

| 모델 | 값 | 시각화 |
| --- | ---: | --- |
| lmstudio-community/Qwen3.5-2B-GGUF | 1.000 | `########################` |

## 실패/검증 오류 요약

### lmstudio-community/Qwen3.5-2B-GGUF

| 오류 | 발생 수 |
| --- | ---: |
| korean_text_remaining | 1 |
| source_korean_copied | 1 |

## 샘플 분석

### lmstudio-community/Qwen3.5-2B-GGUF

느린 샘플
| index | latency | ref 유사도 | 입력 | 번역 |
| ---: | ---: | ---: | --- | --- |
| 52 | 8.797s | 0.858 | 아, 프론트엔드에서 상태 관리를 위한 Context API를 쓰고 있는데, 상태가 너무 자주 업데이트되니까 리렌더링이 너무 많이 일어나서 버벅거리는 느낌이야. Redux나 Zustand 같은 걸로 옮기는 게 좋을까? 아니면 context 자체를 좀 더 분리해서 써야 하는 건지. 이걸 어떻게 풀어야 할지 감이 안 오네. | 아, 프론트엔드에서 상태 관리를 위한 Context API를 쓰고 있는데, 상태가 너무 자주 업데이트되니까 리렌더링이 너무 많이 일어나서 버벅거리는 느낌이야. Redux나 Zustand 같은 걸로 옮기는 게 좋을까? 아니면 context 자체를 좀 더 분리해서 써야 하는 건지. 이걸 어떻게 풀어야 할지 감이 안 오네. |
| 67 | 6.095s | 0.959 | 우리 서비스에 RBAC(Role-Based Access Control) 권한 관리를 하고 있는데, 특정 API 엔드포인트에 대한 권한 체크 로직이 중복으로 많이 들어가 있어. 이걸 좀 더 중앙화하거나, 아니면 decorator 패턴 같은 걸로 깔끔하게 분리하고 싶은데, 어떻게 하면 좋을까? FastAPI의 Depends나 custom decorator 활용법 좀 알려줘. | We are managing permissions for our service, RBAC(Role-Based Access Control). There is a lot of duplication in the permission check logic for specific API endpoints. We would like to centralize this or refactor it cleanly using a decorator pattern, but how should we proceed? Please advise on how to use FastAPI's Depends or custom decorators. |
| 64 | 5.615s | 0.969 | 아, DB 트랜잭션 롤백 처리가 좀 이상하게 동작하는 것 같아. 특정 조건에서 에러가 발생하면 트랜잭션이 롤백되어야 하는데, 일부 데이터는 rollback이 안 되고 남아있는 경우가 있어. 이건 lock contention 문제일 수도 있고, 아니면 코드 상에서 commit을 너무 빨리 호출하는 건지. 디버깅이 너무 어렵네. | Ah, DB transaction rollback handling seems to be behaving strangely. In certain conditions, an error occurs and the transaction should rollback, but some data remains after the rollback. This could be a lock contention issue, or it could be that commit is being called too quickly in the code. Debugging is becoming very difficult. |

품질 낮은 샘플
| index | latency | ref 유사도 | 입력 | 번역 |
| ---: | ---: | ---: | --- | --- |
| 19 | 1.609s | 0.483 | 이벤트 드리븐 아키텍처로 바꿨는데, 메시지 브로커(RabbitMQ)에서 컨슈머가 갑자기 느려지는 것 같아. 혹시 ACK(승인) 처리 타이밍이나, 메시지 재처리 로직에서 병목이 생기는 건가 싶기도 하고. | Converted to an event-driven architecture, but the consumer in RabbitMQ seems to be slowing down suddenly. I'm wondering if there's a bottleneck in the approval timing or in the retry logic for messages. |
| 23 | 0.589s | 0.821 | 우리가 쓰던 그 레거시 코드를 최대한 건드리지 않고, 딱히 새로운 기능만 붙여서 빠르게 돌려야 하는데, 이 '덧붙이는' 작업 범위가 어디까지인지 명확하게 정의해 줄 수 있어? 너무 깊게 들어가면 또 다른 버그 생길 것 같아서. | How clearly can we define the scope of adding new features to legacy code without touching it too deeply, so that we can quickly spin it up without introducing new bugs? |
| 16 | 0.747s | 0.838 | 이 서버리스 함수(Lambda)가 호출은 되는데, 실행 시간이 너무 길어서 비용 폭탄 맞을까 봐 걱정인데. 일단은 이 함수가 실행되는 동안의 모든 단계(콜드 스타트 포함)를 프로파일링 해봤는데, 어디서 시간을 잡아먹는지 잘 모르겠어. | The Lambda function is being called, but the execution time is too long, raising concerns about cost explosion. I've profiled all steps the function executes, including cold starts, but I'm not sure where the time is being consumed. |

검증 실패 샘플
| index | latency | ref 유사도 | 입력 | 번역 |
| ---: | ---: | ---: | --- | --- |
| 52 | 8.797s | 0.858 | 아, 프론트엔드에서 상태 관리를 위한 Context API를 쓰고 있는데, 상태가 너무 자주 업데이트되니까 리렌더링이 너무 많이 일어나서 버벅거리는 느낌이야. Redux나 Zustand 같은 걸로 옮기는 게 좋을까? 아니면 context 자체를 좀 더 분리해서 써야 하는 건지. 이걸 어떻게 풀어야 할지 감이 안 오네. | 아, 프론트엔드에서 상태 관리를 위한 Context API를 쓰고 있는데, 상태가 너무 자주 업데이트되니까 리렌더링이 너무 많이 일어나서 버벅거리는 느낌이야. Redux나 Zustand 같은 걸로 옮기는 게 좋을까? 아니면 context 자체를 좀 더 분리해서 써야 하는 건지. 이걸 어떻게 풀어야 할지 감이 안 오네. |

