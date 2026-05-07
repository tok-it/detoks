import type { Adapter } from "../../core/pipeline/types.js";
import { colors } from "../colors.js";

export interface PromptState {
  adapter: Adapter;
  adapterModel: string | undefined;
  translationModel: string | undefined;
}

export const DETOKS_PROMPT_SUFFIX = "detoks> " as const;

export const buildPromptText = (state: PromptState): string => {
  const adapterName = state.adapter.toUpperCase();
  const modelInfo = state.adapterModel || "미설정";
  return `[${adapterName}:${modelInfo}] ${DETOKS_PROMPT_SUFFIX}`;
};

export const buildPromptPrefixText = (state: PromptState): string =>
  buildPromptText(state).slice(0, -DETOKS_PROMPT_SUFFIX.length);

export const buildPrompt = (state: PromptState): string => {
  return colors.prompt(
    `[${colors.boldText(state.adapter.toUpperCase())}${colors.muted(":")}${colors.info(state.adapterModel || "미설정")}] ${DETOKS_PROMPT_SUFFIX}`,
  );
};

export const buildStatusBar = (state: PromptState): string => {
  const adapterInfo = `adapter: ${colors.boldText(state.adapter)}`;
  const modelInfo = state.adapterModel
    ? `model: ${colors.info(state.adapterModel)}`
    : `model: ${colors.warning("미설정")}`;
  const translationInfo = state.translationModel
    ? `translate: ${colors.info(state.translationModel)}`
    : "";

  const parts = [adapterInfo, modelInfo];
  if (translationInfo) {
    parts.push(translationInfo);
  }

  return parts.join(` ${colors.muted("|")} `);
};
