import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { stdout as output } from "node:process";
import { colors } from "../colors.js";
import { TRANSLATION_MODELS, type TranslationModel } from "./models.js";
import { selectWithArrows } from "../interactive/select-with-arrows.js";

const getModelsDir = () => join(homedir(), ".detoks", "models");

const isModelDownloaded = (model: TranslationModel): boolean => {
  const modelsDir = getModelsDir();
  const filePath = join(modelsDir, model.hfFile);
  return existsSync(filePath);
};

export const selectModel = async (): Promise<TranslationModel> => {
  output.write(`\n${colors.title("한글→영어 번역 모델 선택")}\n\n`);
  output.write(
    colors.info(
      "번역을 위해 로컬 LLM 모델이 필요합니다. 아래 중 하나를 선택하세요:\n",
    ),
  );
  output.write("\n");

  const modelsDir = getModelsDir();

  // 옵션 생성
  const options = TRANSLATION_MODELS.map((model) => {
    const downloaded = isModelDownloaded(model);
    const status = downloaded ? ` ${colors.success("[설치됨]")}` : "";
    return {
      value: model.id,
      label: `${model.displayName}${status}`,
      model,
    };
  });

  // 모델 정보 출력
  for (const opt of options) {
    const model = opt.model;
    if (model) {
      output.write(`${colors.muted(opt.label)}\n`);
      output.write(`   ${colors.muted(model.description)}\n`);
      output.write("\n");
    }
  }

  output.write(colors.muted(`모델 저장 경로: ${modelsDir}\n`));

  // 선택 UI
  const selectedId = await selectWithArrows(
    options.map((opt) => ({
      value: opt.value,
      label: opt.label,
    })),
    "모델 선택",
  );

  if (selectedId) {
    const selected = TRANSLATION_MODELS.find((m) => m.id === selectedId);
    if (selected) {
      return selected;
    }
  }

  // 선택 취소 시 다시 선택
  output.write(colors.warning("\n모델을 선택해야 합니다.\n"));
  return selectModel();
};
