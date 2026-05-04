import type { Adapter } from "../../core/pipeline/types.js";
import { loadConfig, getAdapterModel, getTranslationModel } from "./config-manager.js";

export const applyConfigToEnv = (adapter: Adapter): void => {
  const config = loadConfig();

  // CLI adapter에 해당하는 모델만 로드
  // (저장된 adapter와 무관하게 CLI 인자 존중)
  const modelForAdapter = config.adapter.models[adapter];

  if (modelForAdapter) {
    process.env.ADAPTER_MODEL = modelForAdapter;
  }

  // 번역 모델 설정 (LOCAL_LLM_MODEL_NAME이 이미 설정되지 않은 경우만)
  // (번역 모델은 adapter와 무관한 글로벌 설정)
  if (!process.env.LOCAL_LLM_MODEL_NAME && config.translation.model) {
    process.env.LOCAL_LLM_MODEL_NAME = config.translation.model;
  }
};

export const loadAndApplyConfig = (adapter: Adapter): void => {
  applyConfigToEnv(adapter);
};
