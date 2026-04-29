import { loadConfig, getAdapterModel, getTranslationModel } from "./config-manager.js";

export const applyConfigToEnv = (): void => {
  const config = loadConfig();

  // 어댑터별 모델 설정
  const selectedAdapter = config.adapter.selected;
  const modelForAdapter = config.adapter.models[selectedAdapter];

  if (modelForAdapter) {
    process.env.ADAPTER_MODEL = modelForAdapter;
  }

  // 번역 모델 설정 (LOCAL_LLM_MODEL_NAME이 이미 설정되지 않은 경우만)
  if (!process.env.LOCAL_LLM_MODEL_NAME && config.translation.model) {
    process.env.LOCAL_LLM_MODEL_NAME = config.translation.model;
  }
};

export const loadAndApplyConfig = (): void => {
  applyConfigToEnv();
};
