import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gemma4ModelPath =
  "/Users/choi/.detoks/models/gemma-4-E2B-it-heretic-ara.Q4_K_S.gguf";

const gemma4SmokeEnabled =
  process.env.NODE_LLAMA_CPP_GEMMA4_SMOKE === "1" && existsSync(gemma4ModelPath);

const gemma4Smoke = gemma4SmokeEnabled ? it : it.skip;

describe("node-llama-cpp Gemma4 compatibility", () => {
  gemma4Smoke(
    "detects the Gemma4 GGUF metadata but rejects the model at load time",
    async () => {
      const { getLlama, readGgufFileInfo } = await import("node-llama-cpp");

      const fileInfo = await readGgufFileInfo(gemma4ModelPath, {
        readTensorInfo: false,
        logWarnings: false,
      });

      expect(fileInfo.metadata.general.architecture).toBe("gemma4");

      const llama = await getLlama();
      try {
        await expect(
          llama.loadModel({
            modelPath: gemma4ModelPath,
            gpuLayers: 0,
          }),
        ).rejects.toThrow("Failed to load model");
      } finally {
        await llama.dispose();
      }
    },
    300_000,
  );
});
