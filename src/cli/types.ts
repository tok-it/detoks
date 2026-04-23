import type { UserRequest } from "../schemas/pipeline.js";

export const AdapterValues = ["codex", "gemini"] as const;
export type Adapter = (typeof AdapterValues)[number];

export type CliMode = "run" | "repl";

export interface CliArgs {
  mode: CliMode;
  prompt?: string;
  adapter: Adapter;
  verbose: boolean;
}

export interface NormalizedCliRequest {
  mode: CliMode;
  adapter: Adapter;
  verbose: boolean;
  userRequest: UserRequest;
}

export interface PipelineStageStatus {
  name: string;
  owner: "role1" | "role2.1" | "role2.2" | "role3";
  status: "ready" | "stubbed";
}

export interface CliExecutionResult {
  ok: boolean;
  mode: CliMode;
  adapter: Adapter;
  summary: string;
  nextAction: string;
  stages: PipelineStageStatus[];
  rawOutput: string;
}
