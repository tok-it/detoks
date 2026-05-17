# 번역 모델 벤치마크 분석

- 생성 시각: 2026-05-17T05:02:53.426Z
- 실행 모드: 번역 벤치마크 실행
- 모델 수: 1

## 모델별 종합 비교

| 모델 | 입력 수 | 성공률 | 평균 추론 시간 | 평균 출력 토큰 | 검증 실패 | 한국어 잔존 | fallback span | 평균 ref 유사도 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lmstudio-community/Qwen3.5-2B-GGUF | 100 | 98.000% | 1.213s | 51.650 | 2 | 1 | 16 | 0.929 |

## 텍스트 막대 시각화

### 성공률

| 모델 | 값 | 시각화 |
| --- | ---: | --- |
| lmstudio-community/Qwen3.5-2B-GGUF | 98.000% | `########################` |

### 평균 latency

| 모델 | 값 | 시각화 |
| --- | ---: | --- |
| lmstudio-community/Qwen3.5-2B-GGUF | 1.213s | `########################` |

### reference similarity

| 모델 | 값 | 시각화 |
| --- | ---: | --- |
| lmstudio-community/Qwen3.5-2B-GGUF | 0.929 | `######################--` |

### validation failure count

| 모델 | 값 | 시각화 |
| --- | ---: | --- |
| lmstudio-community/Qwen3.5-2B-GGUF | 2.000 | `########################` |

## 실패/검증 오류 요약

### lmstudio-community/Qwen3.5-2B-GGUF

| 오류 | 발생 수 |
| --- | ---: |
| korean_text_remaining | 1 |
| source_korean_copied | 1 |
| required_literal_missing:CI/CD | 1 |

## 샘플 분석

### lmstudio-community/Qwen3.5-2B-GGUF

느린 샘플
| index | latency | ref 유사도 | 입력 | 번역 |
| ---: | ---: | ---: | --- | --- |
| 67 | 7.722s | 0.894 | 우리 서비스에 RBAC(Role-Based Access Control) 권한 관리를 하고 있는데, 특정 API 엔드포인트에 대한 권한 체크 로직이 중복으로 많이 들어가 있어. 이걸 좀 더 중앙화하거나, 아니면 decorator 패턴 같은 걸로 깔끔하게 분리하고 싶은데, 어떻게 하면 좋을까? FastAPI의 Depends나 custom decorator 활용법 좀 알려줘. | 우리 서비스에RBAC(Role-Based Access Control)권한 관리를 하고 있는데, 특정API엔드포인트에 대한 권한 체크 로직이 중복으로 많이 들어가 있어. 이걸 좀 더 중앙화하거나, 아니면 decorator 패턴 같은 걸로 깔끔하게 분리하고 싶은데, 어떻게 하면 좋을까? FastAPI 의 Depends 나 custom decorator 활용법 좀 알려줘. |
| 70 | 4.466s | 0.937 | 음, Gitlab CI/CD에서 artifact 사이즈가 너무 커져서 빌드 시간이랑 배포 시간이 느려지고 있어. 테스트 결과나 로그 파일 같은 게 계속 쌓이는데, 이걸 효과적으로 관리할 수 있는 방법 없을까? artifact cleanup policy를 설정해야 하나? 아니면 필요한 것만 남기고 삭제하는 스크립트를 짜야 하나? | Well, the artifact size in GitLab is becoming too large, causing build and deployment times to increase. Test results and log files are accumulating continuously. Is there an effective way to manage this? Should I configure an artifact cleanup policy, or should I write a script to remove only the necessary files? |
| 78 | 3.016s | 0.932 | 음, Express.js 미들웨어에서 인증 로직을 처리하고 있는데, 인증 실패 시 response가 너무 일관성 없이 나가네. 어떤 API는 401을 반환하고, 어떤 API는 403을 반환하고, 어떤 데는 그냥 에러 메시지만 나옴. 이거 좀 표준화된 에러 핸들링 미들웨어를 만들어서 관리하고 싶은데, 어떻게 하면 좋을까? | Currently, authentication logic is handled in the Express.js middleware, but the response is inconsistent when authentication fails. Some API return 401, others return API, and some simply return an error message. I would like to create a standardized error-handling middleware to manage this, but how should I proceed? |

품질 낮은 샘플
| index | latency | ref 유사도 | 입력 | 번역 |
| ---: | ---: | ---: | --- | --- |
| 19 | 0.829s | 0.464 | 이벤트 드리븐 아키텍처로 바꿨는데, 메시지 브로커(RabbitMQ)에서 컨슈머가 갑자기 느려지는 것 같아. 혹시 ACK(승인) 처리 타이밍이나, 메시지 재처리 로직에서 병목이 생기는 건가 싶기도 하고. | Converted to an event-driven architecture, but the consumer in RabbitMQ seems to be slowing down suddenly. I'm wondering if there's a bottleneck in the approval (ACK) processing timing or in the message reprocessing logic. |
| 23 | 0.567s | 0.820 | 우리가 쓰던 그 레거시 코드를 최대한 건드리지 않고, 딱히 새로운 기능만 붙여서 빠르게 돌려야 하는데, 이 '덧붙이는' 작업 범위가 어디까지인지 명확하게 정의해 줄 수 있어? 너무 깊게 들어가면 또 다른 버그 생길 것 같아서. | How clearly can we define the scope of adding new features to our legacy code without touching it too deeply, so that we can quickly spin it up without introducing new bugs? |
| 16 | 0.924s | 0.839 | 이 서버리스 함수(Lambda)가 호출은 되는데, 실행 시간이 너무 길어서 비용 폭탄 맞을까 봐 걱정인데. 일단은 이 함수가 실행되는 동안의 모든 단계(콜드 스타트 포함)를 프로파일링 해봤는데, 어디서 시간을 잡아먹는지 잘 모르겠어. | The Lambda function is being called, but the execution time is too long, raising concerns about potential cost explosion. I have profiled all steps the function executes, including cold start, but I'm not sure where the time is being consumed. |

검증 실패 샘플
| index | latency | ref 유사도 | 입력 | 번역 |
| ---: | ---: | ---: | --- | --- |
| 67 | 7.722s | 0.894 | 우리 서비스에 RBAC(Role-Based Access Control) 권한 관리를 하고 있는데, 특정 API 엔드포인트에 대한 권한 체크 로직이 중복으로 많이 들어가 있어. 이걸 좀 더 중앙화하거나, 아니면 decorator 패턴 같은 걸로 깔끔하게 분리하고 싶은데, 어떻게 하면 좋을까? FastAPI의 Depends나 custom decorator 활용법 좀 알려줘. | 우리 서비스에RBAC(Role-Based Access Control)권한 관리를 하고 있는데, 특정API엔드포인트에 대한 권한 체크 로직이 중복으로 많이 들어가 있어. 이걸 좀 더 중앙화하거나, 아니면 decorator 패턴 같은 걸로 깔끔하게 분리하고 싶은데, 어떻게 하면 좋을까? FastAPI 의 Depends 나 custom decorator 활용법 좀 알려줘. |
| 70 | 4.466s | 0.937 | 음, Gitlab CI/CD에서 artifact 사이즈가 너무 커져서 빌드 시간이랑 배포 시간이 느려지고 있어. 테스트 결과나 로그 파일 같은 게 계속 쌓이는데, 이걸 효과적으로 관리할 수 있는 방법 없을까? artifact cleanup policy를 설정해야 하나? 아니면 필요한 것만 남기고 삭제하는 스크립트를 짜야 하나? | Well, the artifact size in GitLab is becoming too large, causing build and deployment times to increase. Test results and log files are accumulating continuously. Is there an effective way to manage this? Should I configure an artifact cleanup policy, or should I write a script to remove only the necessary files? |

