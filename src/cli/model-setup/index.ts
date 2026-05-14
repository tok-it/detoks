import { colors } from "../colors.js";
import { TRANSLATION_MODELS, type TranslationModel } from "./models.js";
import { selectModel } from "./select.js";
import { downloadModel } from "./download.js";
import { updateEnvFile } from "./env-writer.js";
import { updateTranslationModel } from "../config/config-manager.js";
import { readRole1ModelName } from "../../core/prompt/config.js";
import { inspectLocalModelFile, shouldDownloadModelFile } from "./file-status.js";
import {
  getDetoksModelDir,
  getDetoksModelFilePath,
} from "../../core/model-store.js";

const getModelFileStatus = (model: TranslationModel) =>
  inspectLocalModelFile(getDetoksModelFilePath(model));

export const runModelSetupIfNeeded = async (cwd: string = process.cwd()): Promise<void> => {
  const canPrompt =
    Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);

  if (!canPrompt) {
    return;
  }

  // 이미 설정된 모델이 있으면 건너뛰기
  const modelName = readRole1ModelName({ cwd });
  if (modelName) {
    process.env.LOCAL_LLM_MODEL_NAME = modelName;
    return;
  }

  // 모델 선택
  let selectedModel: TranslationModel;
  try {
    selectedModel = await selectModel();
  } catch (error) {
    process.stdout.write(
      colors.error(
        `선택 UI를 여는 중 오류가 발생했습니다. detoks를 다시 실행해 주세요.\n${error instanceof Error ? error.message : String(error)}\n\n`,
      ),
    );
    return;
  }

  // 정상 파일은 재사용하고, 손상/누락 파일은 명시적 선택 시 재다운로드
  const modelFileStatus = getModelFileStatus(selectedModel);

  if (modelFileStatus.kind === "invalid") {
    process.stdout.write(
      colors.warning(
        `손상된 GGUF 파일이 감지되었습니다. 이 모델을 다시 다운로드해 덮어씁니다: ${selectedModel.hfFile} (${modelFileStatus.reason})\n`,
      ),
    );
  }

  if (shouldDownloadModelFile(modelFileStatus)) {
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
  process.env.LOCAL_LLM_MODEL_DIR = getDetoksModelDir(selectedModel);
  process.env.LOCAL_LLM_MODEL_PATH = getDetoksModelFilePath(selectedModel);
  process.env.LOCAL_LLM_HF_REPO = `${selectedModel.hfRepo}:Q4_K_S`;
  process.env.LOCAL_LLM_HF_FILE = selectedModel.hfFile;

  // 설정 저장 (재진입 시 자동으로 로드되도록)
  updateTranslationModel(selectedModel.modelName);

  process.stdout.write(
    colors.success(`✓ 설정 완료!\n\n`),
  );

  process.stdout.write(
    colors.title("다음 단계: detoks 실행\n\n"),
  );
  process.stdout.write(
    colors.info(
      "detoks는 node-llama-cpp를 우선 사용합니다. 선택한 모델이 in-process backend와 맞지 않으면 호환되는 GGUF로 바꾸거나 llama-server 경로를 따로 사용하세요.\n",
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
      'npm run verify:role1 -- --prompt "새 파일을 생성해"\n\n',
    ),
  );
  process.stdout.write(
    colors.info(
      "자세한 비교/수동 실행 가이드: src/cli/model-setup/LLAMA_SERVER_GUIDE.md\n\n",
    ),
  );
};
