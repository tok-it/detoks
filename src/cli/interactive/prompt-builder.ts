import type { Adapter } from "../../core/pipeline/types.js";
import { colors } from "../colors.js";

export interface PromptState {
  adapter: Adapter;
  adapterModel: string | undefined;
  translationModel: string | undefined;
}

export const buildPrompt = (state: PromptState): string => {
  const adapterName = state.adapter.toUpperCase();
  const modelInfo = state.adapterModel || "미설정";

  // 포맷: [어댑터:모델] detoks>
  return colors.prompt(
    `[${colors.boldText(adapterName)}${colors.muted(":")}${colors.info(modelInfo)}] detoks> `,
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
