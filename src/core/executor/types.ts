import type { Adapter, ExecutionMode, InteractionMode } from "../pipeline/types.js";
import type { RequestCategory } from "../../schemas/pipeline.js";
import type { PtyEvent, PtyTranscript } from "../../integrations/subprocess/types.js";
import type { ActionTimelineEvent, ActionTimelineSink } from "../timeline/types.js";
import type { TokenReductionSnapshot } from "../utils/tokenMetrics.js";

export interface AdapterExecutionRequest {
  mode: InteractionMode;
  prompt: string;
  verbose: boolean;
  model?: string;
  taskType?: RequestCategory;
  cwd?: string;
  sessionId?: string;
  presentationMode?: "passthrough";
}

export interface AdapterExecutionResult {
  success: boolean;
  rawOutput: string;
  exitCode: number;
  stderr?: string;
  transcript?: PtyTranscript; // PTY 실행 기록 (optional)
  actionTimeline?: ActionTimelineEvent[];
}

export interface ExecutorRequest extends AdapterExecutionRequest {
  adapter: Adapter;
  executionMode: ExecutionMode;
  presentationMode?: "passthrough";
  onAdapterEvent?: (event: PtyEvent) => void;
  onActionTimelineEvent?: ActionTimelineSink;
}

export interface ExecutorResult {
  ok: boolean;
  adapter: Adapter;
  rawOutput: string;
  exitCode: number;
  stderr?: string;
  transcript?: PtyTranscript; // PTY 실행 기록 (optional)
  actionTimeline?: ActionTimelineEvent[];
  promptTokenSavings?: TokenReductionSnapshot | null;
}
