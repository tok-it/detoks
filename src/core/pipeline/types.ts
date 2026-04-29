import type { UserRequest } from "../../schemas/pipeline.js";
import type { TraceLog } from "../utils/PipelineTracer.js";
import type { TokenMetricsSnapshot } from "../utils/tokenMetrics.js";

export const AdapterValues = ["codex", "gemini"] as const;
export type Adapter = (typeof AdapterValues)[number];
export type InteractionMode = "run" | "repl";
export const ExecutionModeValues = ["stub", "real"] as const;
export type ExecutionMode = (typeof ExecutionModeValues)[number];

export type PipelineProgressStatus = "start" | "end" | "skip" | "error" | "info";

export interface PipelineProgressEvent {
  stage: string;
  status: PipelineProgressStatus;
  message: string;
  taskId?: string;
}

export type PipelineProgressHandler = (
  event: PipelineProgressEvent,
) => void | Promise<void>;

export interface PipelineExecutionRequest {
  mode: InteractionMode;
  adapter: Adapter;
  executionMode: ExecutionMode;
  verbose: boolean;
  trace?: boolean;
  userRequest: UserRequest;
  env?: NodeJS.ProcessEnv;
  fetchImplementation?: typeof fetch;
  onProgress?: PipelineProgressHandler;
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
  tokenMetrics?: TokenMetricsSnapshot | null;
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
