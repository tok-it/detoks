import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { colors } from "../colors.js";
import type { TranslationModel } from "./models.js";

const getModelsDir = () => join(homedir(), ".detoks", "models");

const buildHFUrl = (repo: string, file: string): string => {
  return `https://huggingface.co/${repo}/resolve/main/${file}`;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
};

const formatSpeed = (bytesPerSec: number): string => {
  return `${formatBytes(bytesPerSec)}/s`;
};

export const downloadModel = async (model: TranslationModel): Promise<void> => {
  const modelsDir = getModelsDir();
  mkdirSync(modelsDir, { recursive: true });

  const filePath = join(modelsDir, model.hfFile);
  const url = buildHFUrl(model.hfRepo, model.hfFile);

  process.stdout.write(`\n${colors.info(`모델 다운로드 중: ${model.displayName}\n`)}`);
  process.stdout.write(colors.muted(`출처: ${url}\n\n`));

  return new Promise((resolve, reject) => {
    const writeStream = createWriteStream(filePath);
    let downloadedBytes = 0;
    let startTime = Date.now();

    const updateProgress = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = downloadedBytes / elapsed;
      const remainingBytes = model.sizeMb * 1024 * 1024 - downloadedBytes;
      const remainingSeconds =
        speed > 0 ? remainingBytes / speed : 0;
      const percent = (
        (downloadedBytes / (model.sizeMb * 1024 * 1024)) *
        100
      ).toFixed(1);

      const barLength = 30;
      const filledLength = Math.round((parseInt(percent) / 100) * barLength);
      const emptyLength = barLength - filledLength;
      const bar =
        "[" +
        colors.success("=".repeat(filledLength)) +
        colors.muted(">") +
        " ".repeat(Math.max(0, emptyLength - 1)) +
        "]";

      const etaStr =
        remainingSeconds > 0
          ? ` ETA: ${Math.round(remainingSeconds)}s`
          : "";
      const progressLine = `${bar} ${percent}% (${formatBytes(downloadedBytes)} / ${formatBytes(model.sizeMb * 1024 * 1024)}) ${formatSpeed(speed)}${etaStr}`;

      process.stdout.write(`\r${progressLine}`);
    };

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `다운로드 실패: ${response.status} ${response.statusText}`,
          );
        }

        if (!response.body) {
          throw new Error("응답 본문이 없습니다");
        }

        const reader = response.body.getReader();

        const pump = () => {
          reader.read().then(({ done, value }) => {
            if (done) {
              writeStream.end();
              return;
            }

            downloadedBytes += value.length;
            updateProgress();
            writeStream.write(value);
            pump();
          });
        };

        pump();
      })
      .catch((error) => {
        writeStream.destroy();
        reject(error);
      });

    writeStream.on("finish", () => {
      process.stdout.write("\n");
      process.stdout.write(
        colors.success(`✓ 다운로드 완료: ${filePath}\n\n`),
      );
      resolve();
    });

    writeStream.on("error", (error) => {
      reject(error);
    });
  });
};
