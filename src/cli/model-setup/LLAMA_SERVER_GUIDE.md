# llama-server 실행 가이드

detoks 모델 선택 후, 다음 가이드에 따라 llama-server를 실행하세요.

## 환경변수 확인

모델 선택 완료 후 `.env` 파일에 다음 변수들이 저장됩니다:

```env
LOCAL_LLM_MODEL_NAME=mradermacher/supergemma4-e4b-abliterated-GGUF
LOCAL_LLM_MODEL_DIR=/Users/{username}/.detoks/models
LOCAL_LLM_MODEL_PATH=/Users/{username}/.detoks/models/supergemma4-e4b-abliterated.Q4_K_S.gguf
LOCAL_LLM_HF_REPO=mradermacher/supergemma4-e4b-abliterated-GGUF:Q4_K_S
LOCAL_LLM_HF_FILE=supergemma4-e4b-abliterated.Q4_K_S.gguf
LOCAL_LLM_API_BASE=http://127.0.0.1:12370/v1
```

## llama-server 실행 방법

### 방법 1: 환경변수 기반 실행 (권장)

```bash
# .env 파일 로드 후 llama-server 실행
export $(cat .env | xargs)
llama-server -m "$LOCAL_LLM_MODEL_PATH" -ngl 32 -c 4096
```

### 방법 2: 직접 경로 지정

```bash
llama-server -m ~/.detoks/models/supergemma4-e4b-abliterated.Q4_K_S.gguf -ngl 32 -c 4096
```

### 방법 3: Docker 사용

```bash
docker run --rm -it \
  -v ~/.detoks/models:/models \
  -p 8000:8000 \
  ghcr.io/ggerganov/llama.cpp:server \
  -m /models/supergemma4-e4b-abliterated.Q4_K_S.gguf \
  -ngl 32 -c 4096
```

## 주요 파라미터

| 파라미터 | 의미 | 예시 |
|---------|------|------|
| `-m` | 모델 파일 경로 | `-m ~/.detoks/models/model.gguf` |
| `-ngl` | GPU 레이어 수 | `-ngl 32` (전체 로드) / `-ngl 0` (CPU만) |
| `-c` | 컨텍스트 크기 | `-c 4096` |
| `-n` | 생성할 토큰 수 | `-n 512` |
| `-p` | 포트 | `-p 8000` |
| `--host` | 바인드 주소 | `--host 0.0.0.0` |

## API 테스트

서버 실행 후:

```bash
curl -X POST http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mradermacher/supergemma4-e4b-abliterated-GGUF",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## 트러블슈팅

### 포트 이미 사용 중인 경우

```bash
# 포트 확인
lsof -i :8000

# 다른 포트로 실행
llama-server -m ~/.detoks/models/model.gguf -p 8001
```

### VRAM 부족 시

GPU 레이어 수를 줄이세요:

```bash
# 전체: -ngl 32
# 일부: -ngl 16
# CPU만: -ngl 0 (가장 느림)
llama-server -m ~/.detoks/models/model.gguf -ngl 16
```

### M1/M2 Mac에서

```bash
llama-server -m ~/.detoks/models/model.gguf -ngl 32 -c 4096 -e
```

## 자동 시작 설정

### macOS (launchd)

`~/Library/LaunchAgents/com.detoks.llama-server.plist` 생성:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.detoks.llama-server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/llama-server</string>
    <string>-m</string>
    <string>~/.detoks/models/supergemma4-e4b-abliterated.Q4_K_S.gguf</string>
    <string>-ngl</string>
    <string>32</string>
    <string>-p</string>
    <string>8000</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
```

로드:

```bash
launchctl load ~/Library/LaunchAgents/com.detoks.llama-server.plist
```

### Linux (systemd)

`/etc/systemd/user/llama-server.service` 생성:

```ini
[Unit]
Description=Llama.cpp Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/llama-server -m %h/.detoks/models/supergemma4-e4b-abliterated.Q4_K_S.gguf -ngl 32 -p 8000
Restart=on-failure

[Install]
WantedBy=default.target
```

활성화:

```bash
systemctl --user enable llama-server
systemctl --user start llama-server
```
