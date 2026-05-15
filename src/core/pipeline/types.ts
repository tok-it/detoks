import type { UserRequest } from "../../schemas/pipeline.js";
import type { ProjectInfo } from "../state/SessionStateManager.js";
import type { CompressTextImplementation } from "../prompt/compression.js";
import type { TraceLog } from "../utils/PipelineTracer.js";
import type { TokenMetricsSnapshot } from "../utils/tokenMetrics.js";
import type { PtyTranscript, PtyEvent, PtySessionController } from "../../integrations/subprocess/types.js";
import type { ActionTimelineEvent, ActionTimelineSink } from "../timeline/types.js";
import type { TokenReductionSnapshot } from "../utils/tokenMetrics.js";
import type { TokenAccounting, CostAccounting, LightQualityCounters } from "../utils/tokenAccounting.js";

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
  noCache?: boolean;
  projectInfo?: ProjectInfo;
  compressionImplementation?: CompressTextImplementation;
  userRequest: UserRequest;
  env?: NodeJS.ProcessEnv;
  fetchImplementation?: typeof fetch;
  onProgress?: PipelineProgressHandler;
  onAdapterEvent?: (event: PtyEvent) => void;
  onPtyController?: (controller: PtySessionController) => void;
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

export interface CacheHitInfo {
  kind: "session" | "task";
  sourceSessionId: string;
  sourceTaskId?: string;
  cacheAge: number;
  tokensSaved: number;
}

export interface ResumeHintInfo {
  sessionId: string;
  completedTaskIds: string[];
  currentTaskId: string;
  updatedAt: string;
}

export interface SemanticContextResult {
  id: string;
  distance: number;
  kind: "task" | "prompt" | "output";
  session_id: string;
  task_id?: string;
}

export interface RagContextDisplayItem {
  sourceType: "previous_request" | "previous_task" | "previous_output";
  sessionId: string;
  taskId?: string;
  preview: string;
  relevance: "high" | "medium" | "low";
  injected: boolean;
}

export interface RagContextSummary {
  found: number;
  injected: number;
  skipped: number;
  skipReason?: "budget" | "empty_content" | "disabled" | "error";
  items: RagContextDisplayItem[];
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
  cacheHit?: CacheHitInfo;
  resumeHint?: ResumeHintInfo;
  semanticContext?: SemanticContextResult[];
  ragContextSummary?: RagContextSummary;
  tokenAccounting?: TokenAccounting;
  costAccounting?: CostAccounting;
  lightQuality?: LightQualityCounters;
}
