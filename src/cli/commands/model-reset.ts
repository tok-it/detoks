import { resetTranslationModel } from "../config/config-manager.js";
import { resetModelEnvFiles } from "../model-setup/env-writer.js";

export interface ModelResetOutput {
  ok: boolean;
  mode: "model-reset";
  reset: boolean;
  mutatesState: boolean;
  message: string;
}

const CLEAR_ENV_KEYS = [
  "LOCAL_LLM_MODEL_NAME",
  "MODEL_NAME",
  "LOCAL_LLM_MODEL_PATH",
  "LOCAL_LLM_HF_REPO",
  "LOCAL_LLM_HF_FILE",
] as const;

const clearRuntimeModelEnv = (): void => {
  for (const key of CLEAR_ENV_KEYS) {
    delete process.env[key];
  }
};

export const runModelResetCommand = (
  cwd: string = process.cwd(),
): ModelResetOutput => {
  try {
    const envResetTargets = resetModelEnvFiles(cwd);
    const translationReset = resetTranslationModel();

    clearRuntimeModelEnv();

    const reset = envResetTargets.length > 0 || translationReset;

    return {
      ok: true,
      mode: "model-reset",
      reset,
      mutatesState: reset,
      message: reset
        ? "번역 모델 설정을 초기화했습니다. GGUF 파일은 삭제하지 않았습니다."
        : "초기화할 번역 모델 설정이 없습니다. GGUF 파일은 유지했습니다.",
    };
  } catch (error: any) {
    return {
      ok: false,
      mode: "model-reset",
      reset: false,
      mutatesState: false,
      message: `번역 모델 설정 초기화에 실패했습니다: ${error?.message ?? String(error)}`,
    };
  }
};
