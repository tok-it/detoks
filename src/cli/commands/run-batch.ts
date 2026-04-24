import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { runBatchPromptPipeline } from "../../core/pipeline/batch.js";
import type { CliArgs, CliBatchExecutionResult } from "../types.js";

const BatchInputFileSchema = z.object({
  data: z.array(z.string().min(1)),
});

export const runBatchCommand = async (
  args: Pick<CliArgs, "inputFile">,
): Promise<CliBatchExecutionResult> => {
  const filePath = resolve(process.cwd(), args.inputFile ?? "");
  const parsed = BatchInputFileSchema.parse(
    JSON.parse(readFileSync(filePath, "utf8")),
  );

  return runBatchPromptPipeline(parsed.data, {
    cwd: process.cwd(),
    env: process.env,
  });
};
