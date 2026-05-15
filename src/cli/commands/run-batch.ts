import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { runBatchPromptPipeline } from "../../core/pipeline/batch.js";
import type { CliArgs, CliBatchExecutionResult } from "../types.js";

const BatchInputFileSchema = z.object({
  data: z.array(z.string().min(1)),
});

export const runBatchCommand = async (
  args: Pick<CliArgs, "inputFile" | "cwd">,
): Promise<CliBatchExecutionResult> => {
  const executionCwd = args.cwd ?? process.cwd();
  const filePath = resolve(executionCwd, args.inputFile ?? "");
  const parsed = BatchInputFileSchema.parse(
    JSON.parse(readFileSync(filePath, "utf8")),
  );

  return runBatchPromptPipeline(parsed.data, {
    cwd: executionCwd,
    env: process.env,
  });
};
