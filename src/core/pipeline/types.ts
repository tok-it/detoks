import type { UserRequest } from "../../schemas/pipeline.js";

export const AdapterValues = ["codex", "gemini"] as const;
export type Adapter = (typeof AdapterValues)[number];
export type InteractionMode = "run" | "repl";

export interface PipelineExecutionRequest {
  mode: InteractionMode;
  adapter: Adapter;
  verbose: boolean;
  userRequest: UserRequest;
}

export interface PipelineStageStatus {
  name: string;
  owner: "role1" | "role2.1" | "role2.2" | "role3";
  status: "ready" | "stubbed";
}

export interface PipelineExecutionResult {
  ok: boolean;
  mode: InteractionMode;
  adapter: Adapter;
  summary: string;
  nextAction: string;
  stages: PipelineStageStatus[];
  rawOutput: string;
}
