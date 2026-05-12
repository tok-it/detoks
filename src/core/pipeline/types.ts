import type { UserRequest } from "../../schemas/pipeline.js";
import type { ProjectInfo } from "../state/SessionStateManager.js";
import type { CompressTextImplementation } from "../prompt/compression.js";
import type { TraceLog } from "../utils/PipelineTracer.js";
import type { TokenMetricsSnapshot } from "../utils/tokenMetrics.js";
import type { PtyTranscript } from "../../integrations/subprocess/types.js";
import type { PtyEvent } from "../../integrations/subprocess/types.js";
import type { ActionTimelineEvent, ActionTimelineSink } from "../timeline/types.js";
import type { TokenReductionSnapshot } from "../utils/tokenMetrics.js";

export const AdapterValues = ["codex", "gemini", "claude"] as const;
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
  data?: Record<string, unknown>;
}

export type PipelineProgressHandler = (
  event: PipelineProgressEvent,
) => void | Promise<void>;

export interface PipelineExecutionRequest {
  mode: InteractionMode;
  adapter: Adapter;
  executionMode: ExecutionMode;
  verbose: boolean;
  presentationMode?: "passthrough" | "embedded-pane";
  trace?: boolean;
  projectInfo?: ProjectInfo;
  compressionImplementation?: CompressTextImplementation;
  userRequest: UserRequest;
  env?: NodeJS.ProcessEnv;
  fetchImplementation?: typeof fetch;
  onProgress?: PipelineProgressHandler;
  onAdapterEvent?: (event: PtyEvent) => void;
  onActionTimelineEvent?: ActionTimelineSink;
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

export interface PipelineProgressLog {
  stage: string;
  status: PipelineProgressStatus;
  message: string;
  timestamp: number;
}

export interface PipelineExecutionResult {
  ok: boolean;
  mode: InteractionMode;
  adapter: Adapter;
  summary: string;
  nextAction: string;
  originalPrompt?: string;
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
  // PTY/Adapter execution metadata
  progressLog?: PipelineProgressLog[]; // detoks 내부 진행 로그
  adapterTranscript?: PtyTranscript; // adapter 실행 이벤트/메타데이터
  adapterStderr?: string; // adapter stderr 출력
  actionTimeline?: ActionTimelineEvent[];
  promptTokenSavings?: TokenReductionSnapshot | null;
}
