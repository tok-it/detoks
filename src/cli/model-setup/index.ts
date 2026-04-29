import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { colors } from "../colors.js";
import { TRANSLATION_MODELS, type TranslationModel } from "./models.js";
import { selectModel } from "./select.js";
import { downloadModel } from "./download.js";
import { updateEnvFile } from "./env-writer.js";
import { updateTranslationModel } from "../config/config-manager.js";

const getModelsDir = () => join(homedir(), ".detoks", "models");

const isModelDownloaded = (model: TranslationModel): boolean => {
  const modelsDir = getModelsDir();
  const filePath = join(modelsDir, model.hfFile);
  return existsSync(filePath);
};

export const runModelSetupIfNeeded = async (cwd: string = process.cwd()): Promise<void> => {
  const canPrompt =
    Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);

  if (!canPrompt) {
    return;
  }

  // 이미 설정된 모델이 있으면 건너뛰기
  const modelName = process.env.LOCAL_LLM_MODEL_NAME || process.env.MODEL_NAME;
  if (modelName) {
    return;
  }

  // 모델 선택
  const selectedModel = await selectModel();

  // 이미 다운로드된 경우 건너뛰기
  if (!isModelDownloaded(selectedModel)) {
    await downloadModel(selectedModel);
  } else {
    process.stdout.write(
      colors.info(`모델이 이미 다운로드되어 있습니다.\n\n`),
    );
  }

  // .env 파일 업데이트
  updateEnvFile(selectedModel, cwd);

  // 현재 프로세스의 환경변수도 업데이트
  process.env.LOCAL_LLM_MODEL_NAME = selectedModel.modelName;
  process.env.LOCAL_LLM_HF_REPO = `${selectedModel.hfRepo}:Q4_K_S`;
  process.env.LOCAL_LLM_HF_FILE = selectedModel.hfFile;

  // 설정 저장 (재진입 시 자동으로 로드되도록)
  updateTranslationModel(selectedModel.modelName);

  process.stdout.write(
    colors.success(`✓ 설정 완료!\n\n`),
  );

  // llama-server 실행 안내
  process.stdout.write(
    colors.title("다음 단계: llama-server 실행\n\n"),
  );
  process.stdout.write(
    colors.info(
      "설치된 모델을 사용하려면 llama-server를 별도로 실행해야 합니다.\n",
    ),
  );
  process.stdout.write(
    colors.muted("# 빠른 시작\n"),
  );
  process.stdout.write(
    colors.muted(
      "export $(cat .env | xargs)\n",
    ),
  );
  process.stdout.write(
    colors.muted(
      'llama-server -m "$LOCAL_LLM_MODEL_PATH" -ngl 32 -c 4096\n\n',
    ),
  );
  process.stdout.write(
    colors.info(
      "자세한 가이드: src/cli/model-setup/LLAMA_SERVER_GUIDE.md\n\n",
    ),
  );
};
