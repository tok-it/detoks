import type { UserRequest } from "../../schemas/pipeline.js";
import type { ProjectInfo } from "../state/SessionStateManager.js";
import type { TraceLog } from "../utils/PipelineTracer.js";

export const AdapterValues = ["codex", "gemini"] as const;
export type Adapter = (typeof AdapterValues)[number];
export type InteractionMode = "run" | "repl";
export const ExecutionModeValues = ["stub", "real"] as const;
export type ExecutionMode = (typeof ExecutionModeValues)[number];

export interface PipelineExecutionRequest {
  mode: InteractionMode;
  adapter: Adapter;
  executionMode: ExecutionMode;
  verbose: boolean;
  trace?: boolean;
  userRequest: UserRequest;
  projectInfo?: ProjectInfo;
  env?: NodeJS.ProcessEnv;
  fetchImplementation?: typeof fetch;
}

export interface PipelineStageStatus {
  name: string;
  owner: "role1" | "role2.1" | "role2.2" | "role3";
  status: "ready" | "stubbed" | "completed" | "failed";
}

export interface TaskExecutionRecord {
  taskId: string;
  status: "completed" | "failed" | "skipped";
  rawOutput: string;
  blockedBy?: string;
}

export interface PipelineExecutionResult {
  ok: boolean;
  mode: InteractionMode;
  adapter: Adapter;
  summary: string;
  nextAction: string;
  stages: PipelineStageStatus[];
  rawOutput: string;
  sessionId: string;
  taskRecords: TaskExecutionRecord[];
  compiledPrompt?: string;
  role2Handoff?: string;
  promptLanguage?: "ko" | "en" | "mixed";
  promptInferenceTimeSec?: number;
  promptValidationErrors?: string[];
  promptRepairActions?: string[];
  traceLog?: TraceLog;
  traceFilePath?: string;
}
