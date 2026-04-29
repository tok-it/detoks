import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { colors } from "../colors.js";
import { TRANSLATION_MODELS, type TranslationModel } from "./models.js";

const getModelsDir = () => join(homedir(), ".detoks", "models");

const isModelDownloaded = (model: TranslationModel): boolean => {
  const modelsDir = getModelsDir();
  const filePath = join(modelsDir, model.hfFile);
  return existsSync(filePath);
};

export const selectModel = async (): Promise<TranslationModel> => {
  const rl = createInterface({ input, output });

  output.write(`\n${colors.title("한글→영어 번역 모델 선택")}\n\n`);
  output.write(
    colors.info(
      "번역을 위해 로컬 LLM 모델이 필요합니다. 아래 중 하나를 선택하세요:\n",
    ),
  );
  output.write("\n");

  const modelsDir = getModelsDir();

  for (let i = 0; i < TRANSLATION_MODELS.length; i++) {
    const model = TRANSLATION_MODELS[i];
    if (!model) continue;

    const downloaded = isModelDownloaded(model);
    const badge = downloaded ? colors.success("[설치됨]") : "";
    const status = downloaded ? colors.muted(" (다운로드 필요 없음)") : "";

    output.write(`${colors.boldText(`${i + 1}. ${model.displayName}`)} ${badge}\n`);
    output.write(`   ${model.description}${status}\n`);
    output.write("\n");
  }

  output.write(colors.muted(`모델 저장 경로: ${modelsDir}\n\n`));

  while (true) {
    const answer = (await rl.question(colors.prompt("선택 (1-3): "))).trim();
    const choice = parseInt(answer);

    if (choice >= 1 && choice <= TRANSLATION_MODELS.length) {
      const selected = TRANSLATION_MODELS[choice - 1];
      if (selected) {
        rl.close();
        return selected;
      }
    }

    output.write(colors.warning("1에서 3 사이의 숫자를 입력하세요.\n"));
  }
};
