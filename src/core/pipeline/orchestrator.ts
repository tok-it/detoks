import { createHash } from "node:crypto";
import { DAGValidator } from "../task-graph/DAGValidator.js";
import { DependencyResolver } from "../task-graph/DependencyResolver.js";
import { ParallelClassifier } from "../task-graph/ParallelClassifier.js";
import { TaskGraphProcessor } from "../task-graph/TaskGraphProcessor.js";
import { TaskSentenceSplitter } from "../task-graph/TaskSentenceSplitter.js";
import { compilePrompt, createRole2PromptInput } from "../prompt/compiler.js";
import { loadRole1Policies, loadRole1RuntimeConfig } from "../prompt/config.js";
import { compress_prompt } from "../prompt/compression.js";
import { ContextBuilder } from "../context/ContextBuilder.js";
import { ContextCompressor } from "../context/ContextCompressor.js";
import { SessionStateManager, resolveSessionsDir } from "../state/SessionStateManager.js";
import { executeWithAdapter } from "../executor/execute.js";
import { logger } from "../utils/logger.js";
import { PipelineTracer } from "../utils/PipelineTracer.js";
import { translateVisibleText } from "../utils/visibleText.js";
import {
  buildTokenMetrics,
  buildTokenReductionSnapshot,
  type TokenMetricsSnapshot,
  type TokenReductionSnapshot,
} from "../utils/tokenMetrics.js";
import { getLLMModelConfig } from "../llm-client/llm-models.js";
import { computeProjectId, hashRawInput } from "../rag/hash.js";
import { CACHE_DISABLED, CACHE_TTL_DAYS } from "../cache/cache-config.js";
import { isSessionCacheValid, isTaskCacheValid } from "../cache/cache-validator.js";
import { isRagEnabled, getRagModelPath, getRagVectorDbPath, RAG_EMBEDDING_DIMS } from "../rag/rag-config.js";
import { EmbeddingService } from "../rag/embedding-service.js";
import { VectorStore } from "../rag/vector-store.js";
import { SemanticRetriever } from "../rag/semantic-retriever.js";
import { EmbeddingIndexer } from "../rag/embedding-indexer.js";
import { RagContextLoader, formatRagSnippetsForPrompt } from "../rag/rag-context-loader.js";
import type { RagSnippet } from "../rag/rag-context-loader.js";
import { TaskSequenceMiner } from "../rag/task-sequence-miner.js";
import { FailurePatternAnalyzer } from "../rag/failure-pattern-analyzer.js";
import { WorkflowTemplateBuilder } from "../rag/workflow-template-builder.js";
import { AdapterStatsLearner } from "../rag/adapter-stats-learner.js";
import { ProjectMemory } from "../rag/project-memory.js";
import type { PtyTranscript } from "../../integrations/subprocess/types.js";
import type { SessionState } from "../../schemas/pipeline.js";
import type {
  PipelineProgressEvent,
  PipelineProgressLog,
  PipelineExecutionRequest,
  PipelineExecutionResult,
  PipelineStageStatus,
  TaskExecutionRecord,
  ResumeHintInfo,
  SemanticContextResult,
} from "./types.js";
import { createActionTimelineEvent } from "../timeline/types.js";
import type { ActionTimelineEvent } from "../timeline/types.js";

const ADAPTER_MODEL_MAP: Record<string, string> = {
  claude: 'claude-3.5-sonnet',
  gemini: 'gemini-2.0-flash',
  codex: 'gpt-4-turbo',
};

/**
 * adapter 타입과 환경변수(ADAPTER_MODEL)를 조합해 llm-models 키를 반환합니다.
 * 미지원 모델명이 넘어오면 fallback으로 adapter 기본값을 씁니다.
 */
function resolveModelName(adapter: string, env?: NodeJS.ProcessEnv): string {
  const envModel = env?.ADAPTER_MODEL ?? process.env.ADAPTER_MODEL;
  if (envModel && getLLMModelConfig(envModel)) {
    return envModel;
  }
  return ADAPTER_MODEL_MAP[adapter] ?? 'claude-3.5-sonnet';
}

function generateSessionId(): string {
  return createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 12);
}

function initSessionState(sessionId: string, rawInput: string, executionMode: string): SessionState {
  return {
    shared_context: {
      session_id: sessionId,
      raw_input: rawInput,
      // stub 모드 세션은 캐시 조회 대상에서 제외 — real 모드가 stub 결과를 캐시 hit으로 받는 오염 방지
      ...(executionMode !== "stub" ? { raw_input_hash: hashRawInput(rawInput) } : {}),
    },
    task_results: {},
    current_task_id: null,
    completed_task_ids: [],
    updated_at: new Date().toISOString(),
  };
}

function applyProjectInfo(
  state: SessionState,
  projectInfo: PipelineExecutionRequest["projectInfo"],
  fallbackCwd?: string,
): SessionState {
  if (projectInfo) {
    return {
      ...state,
      shared_context: {
        ...state.shared_context,
        project_id: projectInfo.projectId,
        project_path: projectInfo.projectPath,
        project_name: projectInfo.projectName,
      },
    };
  }

  // projectInfo가 없어도 RAG 캐시 필터링을 위해 project_id는 항상 채운다.
  if (!state.shared_context.project_id) {
    const cwd = fallbackCwd ?? process.cwd();
    return {
      ...state,
      shared_context: {
        ...state.shared_context,
        project_id: computeProjectId(cwd),
        project_path: state.shared_context.project_path ?? cwd,
      },
    };
  }

  return state;
}

// RAG 메타데이터: Task 객체에서 task_results에 보존할 필드만 추출
function extractRagMeta(task?: { title?: string; input_hash?: string; depends_on?: string[] }) {
  if (!task) return {};
  return {
    ...(task.title !== undefined ? { title: task.title } : {}),
    ...(task.input_hash !== undefined ? { input_hash: task.input_hash } : {}),
    ...(task.depends_on !== undefined ? { depends_on: task.depends_on } : {}),
  };
}

function markTaskCompleted(
  state: SessionState,
  taskId: string,
  rawOutput: string,
  taskType?: string,
  task?: { title?: string; input_hash?: string; depends_on?: string[] },
): SessionState {
  const now = new Date().toISOString();
  return {
    ...state,
    current_task_id: null,
    completed_task_ids: [...state.completed_task_ids, taskId],
    task_results: {
      ...state.task_results,
      [taskId]: {
        task_id: taskId,
        success: true,
        summary: rawOutput.slice(0, 200),
        raw_output: rawOutput,
        ...(taskType ? { type: taskType } : {}),
        ...extractRagMeta(task),
        completed_at: now,
      },
    },
    updated_at: now,
  };
}

function markTaskFailed(
  state: SessionState,
  taskId: string,
  rawOutput: string,
  taskType?: string,
  task?: { title?: string; input_hash?: string; depends_on?: string[] },
): SessionState {
  const now = new Date().toISOString();
  return {
    ...state,
    current_task_id: taskId,
    task_results: {
      ...state.task_results,
      [taskId]: {
        task_id: taskId,
        success: false,
        summary: rawOutput.slice(0, 200),
        raw_output: rawOutput,
        ...(taskType ? { type: taskType } : {}),
        ...extractRagMeta(task),
        completed_at: now,
      },
    },
    updated_at: now,
  };
}

function markTaskSkipped(
  state: SessionState,
  taskId: string,
  blockedBy: string,
  taskType?: string,
  task?: { title?: string; input_hash?: string; depends_on?: string[] },
): SessionState {
  const skipReason = `의존성 [${blockedBy}] 실패로 건너뜀`;
  const now = new Date().toISOString();

  return {
    ...state,
    current_task_id: null,
    task_results: {
      ...state.task_results,
      [taskId]: {
        task_id: taskId,
        success: false,
        summary: skipReason,
        raw_output: skipReason,
        ...(taskType ? { type: taskType } : {}),
        ...extractRagMeta(task),
        completed_at: now,
      },
    },
    updated_at: now,
  };
}

function collectTaskOutputText(state: SessionState): {
  rawOutputText: string;
  summaryText: string;
} {
  const taskResults = Object.values(state.task_results ?? {}) as Array<{
    raw_output?: unknown;
    summary?: unknown;
  }>;

  const rawOutputText = taskResults
    .map((result) => (typeof result.raw_output === "string" ? result.raw_output : ""))
    .filter((value) => value.trim().length > 0)
    .join("\n---\n");

  const summaryText = taskResults
    .map((result) => (typeof result.summary === "string" ? result.summary : ""))
    .filter((value) => value.trim().length > 0)
    .join("\n---\n");

  return { rawOutputText, summaryText };
}

function applySessionTokenMetrics(
  state: SessionState,
  inputOriginalText: string,
  inputOptimizedText: string,
): {
  state: SessionState;
  tokenMetrics: TokenMetricsSnapshot | null;
} {
  const { rawOutputText, summaryText } = collectTaskOutputText(state);
  if (!rawOutputText.trim() || !summaryText.trim()) {
    const sharedContext = { ...state.shared_context };
    delete sharedContext.token_metrics;
    return {
      state: {
        ...state,
        shared_context: sharedContext,
      },
      tokenMetrics: null,
    };
  }

  const tokenMetrics = buildTokenMetrics({
    inputOriginalText,
    inputOptimizedText,
    outputOriginalText: rawOutputText,
    outputOptimizedText: summaryText,
  });

  return {
    state: {
      ...state,
      shared_context: {
        ...state.shared_context,
        token_metrics: tokenMetrics,
      },
    },
    tokenMetrics,
  };
}

async function compressExecutionContextSummary(
  summary: string | undefined,
  request: PipelineExecutionRequest,
): Promise<{ summary: string | undefined; repairActions: string[] }> {
  if (!summary?.trim() || !summary.includes("Previous Task Results:")) {
    return { summary, repairActions: [] };
  }

  try {
    const runtimeConfig = loadRole1RuntimeConfig({
      ...(request.userRequest.cwd ? { cwd: request.userRequest.cwd } : {}),
      ...(request.env ? { env: request.env } : {}),
    });
    const policies = loadRole1Policies({
      ...(request.userRequest.cwd ? { cwd: request.userRequest.cwd } : {}),
    });
    const compressionResult = await compress_prompt(summary, {
      config: runtimeConfig,
      policies,
      ...(runtimeConfig.localLlmModelName
        ? { localLlmModelName: runtimeConfig.localLlmModelName }
        : {}),
      ...(request.userRequest.cwd ? { cwd: request.userRequest.cwd } : {}),
      ...(request.env ? { env: request.env } : {}),
      ...(request.compressionImplementation
        ? { compressionImplementation: request.compressionImplementation }
        : {}),
    });

    return {
      summary: compressionResult.compressed_prompt,
      repairActions: compressionResult.repair_actions,
    };
  } catch (error) {
    return {
      summary,
      repairActions: [`context_compression_failed:${toErrorMessage(error)}`],
    };
  }
}

function mergePtyTranscripts(
  existing: PtyTranscript | undefined,
  incoming: PtyTranscript | undefined,
): PtyTranscript | undefined {
  if (!incoming) {
    return existing;
  }

  if (!existing) {
    return {
      ...incoming,
      events: [...incoming.events],
    };
  }

  const startTime = Math.min(existing.startTime, incoming.startTime);
  const endTime = Math.max(existing.endTime, incoming.endTime);

  return {
    events: [...existing.events, ...incoming.events],
    startTime,
    endTime,
    totalDuration: endTime - startTime,
    ...(incoming.exitCode !== undefined
      ? { exitCode: incoming.exitCode }
      : existing.exitCode !== undefined
        ? { exitCode: existing.exitCode }
        : {}),
    timedOut: existing.timedOut || incoming.timedOut,
  };
}

function buildPipelineStages(ok: boolean): PipelineStageStatus[] {
  const resultStatus = ok ? "completed" : "failed";
  return [
    { name: "Prompt Compiler",   owner: "role1",   status: resultStatus   },
    { name: "Task Graph Builder", owner: "role2.1", status: resultStatus   },
    { name: "Context Optimizer",  owner: "role2.2", status: resultStatus   },
    { name: "Executor",           owner: "role3",   status: "ready"        },
    { name: "State Manager",      owner: "role2.2", status: resultStatus   },
  ];
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function inferPromptFailureNextAction(errorMessage: string): string {
  if (
    errorMessage.includes("GGUF") ||
    errorMessage.includes("LOCAL_LLM_MODEL_PATH") ||
    errorMessage.includes("LOCAL_LLM_HF_FILE") ||
    errorMessage.includes("모델 파일") ||
    errorMessage.includes("비어 있습니다")
  ) {
    return "로컬 GGUF 모델 파일이 유효한지 확인한 뒤, .env의 LOCAL_LLM_MODEL_PATH / LOCAL_LLM_HF_FILE을 다시 맞추고 시도하세요.";
  }

  if (
    errorMessage.includes("LOCAL_LLM_API_BASE") ||
    errorMessage.includes("LOCAL_LLM_SERVER_PORT") ||
    errorMessage.includes("LOCAL_LLM_MODEL_NAME") ||
    errorMessage.includes("MODEL_NAME") ||
    errorMessage.includes("fetch support")
  ) {
    return "Role 1 로컬 LLM 실행 설정(.env의 LOCAL_LLM_API_BASE, LOCAL_LLM_SERVER_PORT, LOCAL_LLM_MODEL_NAME)을 맞춘 뒤 다시 시도하세요.";
  }

  return "프롬프트 컴파일 입력이나 실행 설정을 수정한 뒤 다시 시도하세요.";
}

async function emitProgress(
  request: PipelineExecutionRequest,
  event: PipelineProgressEvent,
): Promise<void> {
  if (!request.onProgress) {
    return;
  }

  try {
    await request.onProgress(event);
  } catch {
    // Progress UI should never break the pipeline.
  }
}

/**
 * 회의록 기준 오케스트레이터 실행 흐름:
 *
 * [Role 2.1] TaskGraph 생성 (DAGValidator → DependencyResolver → ParallelClassifier)
 *   → [Role 2.2] 세션 상태 초기화 / 로드
 *   → [Role 2.1] stage 순서로 실행 가능한 Task 결정
 *   → [Role 2.2] ExecutionContext 생성 (ContextBuilder)
 *   → [Role 3]   Task 실행 (executeWithAdapter)
 *   → [Role 2.2] 세션 상태 갱신 (SessionStateManager)
 *   → (반복)
 *
 * Strict 모드: 의존 Task 실패 시 후속 Task 실행 불가 — 명확한 오류 메시지 출력
 */
export const orchestratePipeline = async (
  request: PipelineExecutionRequest,
): Promise<PipelineExecutionResult> => {
  const sessionId = request.userRequest.session_id ?? generateSessionId();
  const progressLog: PipelineProgressLog[] = [];
  const actionTimeline: ActionTimelineEvent[] = [];
  let adapterTranscript: PtyTranscript | undefined;
  let promptTokenSavings: TokenReductionSnapshot | null = null;
  PipelineTracer.clear();

  const emitActionTimelineWithLogging = async (event: ActionTimelineEvent): Promise<void> => {
    actionTimeline.push(event);
    if (!request.onActionTimelineEvent) {
      return;
    }

    try {
      await request.onActionTimelineEvent(event);
    } catch {
      // Timeline callbacks must not break the pipeline.
    }
  };

  // Progress 이벤트 수집 및 콜백 호출
  const emitProgressWithLogging = async (event: PipelineProgressEvent): Promise<void> => {
    progressLog.push({
      stage: event.stage,
      status: event.status,
      message: event.message,
      timestamp: Date.now(),
    });
    const timelineEvent = createActionTimelineEvent({
      kind: "stage_update",
      source: "pipeline",
      stage: event.stage,
      summary: `${event.stage}: ${event.status} · ${event.message}`,
      rawPayload: event,
    });
    await emitActionTimelineWithLogging(timelineEvent);
    if (request.onProgress) {
      request.onProgress(event);
    }
  };

  // ── F1: Cross-session input_hash cache bypass ────────────────────────────
  // stub 모드는 테스트/개발용이므로 캐시 우회 대상에서 제외
  if (!request.noCache && !CACHE_DISABLED && request.executionMode !== "stub") {
    const inputHash = hashRawInput(request.userRequest.raw_input);
    const projectId =
      request.projectInfo?.projectId ??
      computeProjectId(request.userRequest.cwd ?? process.cwd());
    const cachedSession = await SessionStateManager.findSuccessfulSessionByInputHash(
      inputHash,
      { project_id: projectId, recencyDays: CACHE_TTL_DAYS },
    );
    if (cachedSession && isSessionCacheValid(cachedSession, { project_id: projectId })) {
      const cacheAge = cachedSession.updated_at
        ? Date.now() - new Date(cachedSession.updated_at).getTime()
        : 0;
      const cachedSessionId = cachedSession.shared_context.session_id;
      await emitActionTimelineWithLogging(
        createActionTimelineEvent({
          kind: "cache_hit",
          source: "pipeline",
          summary: `F1 캐시 hit — 세션 ${cachedSessionId} (${Math.round(cacheAge / 86400000)}일 전)`,
        }),
      );
      const { rawOutputText, summaryText } = collectTaskOutputText(cachedSession);
      return {
        ok: true,
        mode: request.mode,
        adapter: request.adapter,
        summary: cachedSession.last_summary ?? summaryText.slice(0, 200),
        nextAction: cachedSession.next_action ?? "캐시된 결과를 반환했습니다.",
        originalPrompt: request.userRequest.raw_input,
        stages: buildPipelineStages(true),
        rawOutput: rawOutputText,
        sessionId: cachedSessionId,
        taskRecords: cachedSession.completed_task_ids.map((id) => ({
          taskId: id,
          status: "completed" as const,
          rawOutput: (cachedSession.task_results[id] as Record<string, unknown>)?.raw_output as string ?? "",
        })),
        cacheHit: {
          kind: "session" as const,
          sourceSessionId: cachedSessionId,
          cacheAge,
          tokensSaved: 0,
        },
        ...(actionTimeline.length ? { actionTimeline } : {}),
      };
    }
    await emitActionTimelineWithLogging(
      createActionTimelineEvent({
        kind: "cache_miss",
        source: "pipeline",
        summary: `F1 캐시 miss — hash ${inputHash}`,
      }),
    );
  }

  // ── F3: 미완성 세션 resume 힌트 ──────────────────────────────────────────
  let resumeHint: ResumeHintInfo | undefined;
  if (!request.noCache && !CACHE_DISABLED && request.executionMode !== "stub") {
    const inputHash = hashRawInput(request.userRequest.raw_input);
    const projectId =
      request.projectInfo?.projectId ??
      computeProjectId(request.userRequest.cwd ?? process.cwd());
    const incompleteSession = await SessionStateManager.findIncompleteSessionByInputHash(
      inputHash,
      { project_id: projectId },
    );
    if (incompleteSession && incompleteSession.current_task_id) {
      resumeHint = {
        sessionId: incompleteSession.shared_context.session_id,
        completedTaskIds: incompleteSession.completed_task_ids,
        currentTaskId: incompleteSession.current_task_id,
        updatedAt: incompleteSession.updated_at ?? new Date().toISOString(),
      };
      await emitProgressWithLogging({
        stage: "State Manager",
        status: "info",
        message: `이전 미완성 세션 발견: ${resumeHint.sessionId} (완료: ${resumeHint.completedTaskIds.join(", ")} | 중단: ${resumeHint.currentTaskId})`,
      });
    }
  }

  // ── F4~F7: Semantic retrieval (RAG Phase 2A) — BGE-M3 + sqlite-vec ───────
  let semanticContext: SemanticContextResult[] | undefined;
  let ragSnippets: RagSnippet[] = [];
  let ragEmbedder: EmbeddingService | undefined;
  let ragStore: VectorStore | undefined;
  if (isRagEnabled() && request.executionMode !== "stub") {
    try {
      const modelPath = getRagModelPath()!;
      const cwd = request.userRequest.cwd ?? process.cwd();
      const dbPath = getRagVectorDbPath(cwd);
      ragEmbedder = new EmbeddingService(modelPath);
      await ragEmbedder.init();
      ragStore = new VectorStore(dbPath, RAG_EMBEDDING_DIMS);
      ragStore.open();
      const retriever = new SemanticRetriever(ragStore, ragEmbedder);
      const hits = await retriever.hybridSearch(request.userRequest.raw_input, 5);
      if (hits.length > 0) {
        semanticContext = hits.map((h) => ({
          id: h.id,
          distance: h.distance,
          kind: h.meta.kind as SemanticContextResult["kind"],
          session_id: h.meta.session_id as string,
          ...(h.meta.task_id ? { task_id: h.meta.task_id as string } : {}),
        }));
        const sessionsDir = resolveSessionsDir(cwd);
        const loader = new RagContextLoader(sessionsDir);
        ragSnippets = await loader.load(hits.slice(0, 3));
        await emitProgressWithLogging({
          stage: "State Manager",
          status: "info",
          message: `RAG: 유사 과거 컨텍스트 ${hits.length}건 발견 (스니펫 ${ragSnippets.length}건 로딩)`,
        });
      }
    } catch (ragErr) {
      logger.warn(`RAG retrieval 실패 (non-fatal): ${toErrorMessage(ragErr)}`);
      await ragEmbedder?.dispose().catch(() => {});
      ragStore?.close();
      ragEmbedder = undefined;
      ragStore = undefined;
    }
  }

  // ── Step 1: Prompt compile + Role 2.1 handoff 생성 (Role 1) ──────────────
  let compiledPrompt;
  let role2PromptInput;
  await emitProgressWithLogging( {
    stage: "Prompt Compiler",
    status: "start",
    message: "Prompt Compiler 시작",
  });
  await PipelineTracer.trace({
    sessionId, stage: "PromptCompiler", role: "role1", phase: "input",
    dataType: "UserRequest", data: { raw_input: request.userRequest.raw_input },
  });
  try {
    PipelineTracer.startStage("PromptCompiler");
    compiledPrompt = await compilePrompt(
      {
        raw_input: request.userRequest.raw_input,
      },
      {
        ...(request.userRequest.cwd ? { cwd: request.userRequest.cwd } : {}),
        ...(request.env ? { env: request.env } : {}),
        ...(request.fetchImplementation
          ? { fetchImplementation: request.fetchImplementation }
          : {}),
        ...(request.compressionImplementation
          ? { compressionImplementation: request.compressionImplementation }
          : {}),
      },
    );
    promptTokenSavings = buildTokenReductionSnapshot(
      request.userRequest.raw_input,
      compiledPrompt.compressed_prompt,
    );
    role2PromptInput = createRole2PromptInput(compiledPrompt);
    await PipelineTracer.trace({
      sessionId, stage: "PromptCompiler", role: "role1", phase: "output",
      dataType: "CompiledPrompt", data: compiledPrompt,
      durationMs: PipelineTracer.endStage("PromptCompiler"),
    });
    await emitProgressWithLogging( {
      stage: "Prompt Compiler",
      status: "end",
      message: "Prompt Compiler 완료",
    });
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    logger.error(`프롬프트 컴파일 실패: ${translateVisibleText(errorMessage)}`);
    await PipelineTracer.trace({
      sessionId,
      stage: "PromptCompiler",
      role: "role1",
      phase: "output",
      dataType: "PromptCompilerError",
      data: { error: errorMessage },
      durationMs: PipelineTracer.endStage("PromptCompiler"),
    });
    await emitProgressWithLogging( {
      stage: "Prompt Compiler",
      status: "error",
      message: "Prompt Compiler 실패",
    });
    const traceFilePath = request.trace
      ? await PipelineTracer.saveTrace(sessionId)
      : undefined;
    return {
      ok: false,
      mode: request.mode,
      adapter: request.adapter,
      summary: `프롬프트 컴파일 실패: ${errorMessage}`,
      nextAction: inferPromptFailureNextAction(errorMessage),
      originalPrompt: request.userRequest.raw_input,
      stages: buildPipelineStages(false),
      rawOutput: errorMessage,
      sessionId,
      taskRecords: [],
      ...(actionTimeline.length ? { actionTimeline } : {}),
      ...(request.trace ? { traceLog: PipelineTracer.getTrace(sessionId) } : {}),
      ...(traceFilePath ? { traceFilePath } : {}),
    };
  }

  // ── Step 2: TaskGraph 생성 (Role 2.1) ────────────────────────────────────
  await emitProgressWithLogging( {
    stage: "Task Graph Builder",
    status: "start",
    message: "Task Graph Builder 시작",
  });
  await PipelineTracer.trace({
    sessionId, stage: "TaskGraphBuilder", role: "role2.1", phase: "input",
    dataType: "Role2PromptInput", data: role2PromptInput,
  });
  PipelineTracer.startStage("TaskGraphBuilder");
  const compiledSentences = TaskSentenceSplitter.split(role2PromptInput.compiled_prompt);
  const graph = TaskGraphProcessor.process(compiledSentences);
  await PipelineTracer.trace({
    sessionId, stage: "TaskGraphBuilder", role: "role2.1", phase: "output",
    dataType: "TaskGraph", data: graph,
    durationMs: PipelineTracer.endStage("TaskGraphBuilder"),
  });

  // ── Step 3: DAG 검증 (Role 2.1 — 1차 검증) ───────────────────────────────
  const validation = DAGValidator.validate(graph);
  await PipelineTracer.trace({
    sessionId, stage: "DAGValidator", role: "role2.1", phase: "output",
    dataType: "DAGValidationResult", data: validation,
  });
  const validationEvent = createActionTimelineEvent({
    kind: "validation",
    source: "validation",
    summary: validation.valid
      ? `작업 그래프 검증 통과 (${graph.tasks.length}개 작업)`
      : `작업 그래프 검증 실패: ${validation.reason}`,
    rawPayload: validation,
  });
    await emitActionTimelineWithLogging(validationEvent);
  if (!validation.valid) {
    logger.error(`DAG 검증 실패: ${translateVisibleText(validation.reason)} — ${translateVisibleText(validation.detail)}`);
    const traceFilePath = request.trace
      ? await PipelineTracer.saveTrace(sessionId)
      : undefined;
    return {
      ok: false,
      mode: request.mode,
      adapter: request.adapter,
      summary: `작업 그래프 검증 실패: ${validation.reason}`,
      nextAction: "작업 그래프를 수정한 뒤 다시 시도하세요.",
      originalPrompt: request.userRequest.raw_input,
      stages: buildPipelineStages(false),
      rawOutput: "",
      sessionId,
      taskRecords: [],
      compiledPrompt: compiledPrompt.compressed_prompt,
      role2Handoff: role2PromptInput.compiled_prompt,
      promptLanguage: compiledPrompt.language,
      promptInferenceTimeSec: compiledPrompt.inference_time_sec ?? 0,
      promptValidationErrors: compiledPrompt.validation_errors ?? [],
      promptRepairActions: compiledPrompt.repair_actions ?? [],
      ...(promptTokenSavings ? { promptTokenSavings } : {}),
      ...(actionTimeline.length ? { actionTimeline } : {}),
      ...(request.trace ? { traceLog: PipelineTracer.getTrace(sessionId) } : {}),
      ...(traceFilePath ? { traceFilePath } : {}),
    };
  }

  // ── Step 4: 의존성 해결 + stage 분류 (Role 2.1) ───────────────────────────
  const resolution = DependencyResolver.resolve(graph, validation);
  await PipelineTracer.trace({
    sessionId, stage: "DependencyResolver", role: "role2.1", phase: "output",
    dataType: "DependencyResolution", data: {
      orderedTasks: resolution.orderedTasks.map(({ task, deps }) => ({
        taskId: task.id,
        type: task.type,
        title: task.title,
        dependsOn: task.depends_on,
        resolvedDeps: deps.map((dep) => ({
          taskId: dep.id,
          type: dep.type,
          title: dep.title,
        })),
      })),
    },
  });
  const { stages } = ParallelClassifier.classify(resolution);
  await PipelineTracer.trace({
    sessionId, stage: "ParallelClassifier", role: "role2.1", phase: "output",
    dataType: "ParallelClassification", data: {
      stages: stages.map(({ stage, tasks }) => ({
        stage,
        runnableInParallel: tasks.map((task) => ({
          taskId: task.id,
          type: task.type,
          title: task.title,
          dependsOn: task.depends_on,
        })),
      })),
    },
  });
  await emitProgressWithLogging({
    stage: "Task Graph Builder",
    status: "end",
    message: `태스크 ${graph.tasks.length}개 생성 완료`,
    data: {
      tasks: graph.tasks.map((t) => ({
        id: t.id,
        type: t.type,
        title: t.title,
        depends_on: t.depends_on,
      })),
      stages: stages.map(({ stage, tasks: stageTasks }) => ({
        stage,
        taskIds: stageTasks.map((t) => t.id),
      })),
    },
  });

  // ── Step 5: 세션 상태 초기화 / 로드 (Role 2.2) ───────────────────────────
  await emitProgressWithLogging( {
    stage: "State Manager",
    status: "start",
    message: "State Manager: 세션 상태 로드/초기화 중",
  });
  let state: SessionState;
  const taskRecords: TaskExecutionRecord[] = [];
  const failedTaskIds = new Set<string>();

  if (await SessionStateManager.sessionExists(sessionId)) {
    logger.info(`기존 세션을 불러옵니다: ${sessionId}`);
    state = await SessionStateManager.loadSession(sessionId);
    const resolvedRawInput =
      typeof state.shared_context.raw_input === "string" &&
      state.shared_context.raw_input.trim().length > 0
        ? state.shared_context.raw_input
        : request.userRequest.raw_input;
    state = {
      ...state,
      shared_context: {
        ...state.shared_context,
        session_id: sessionId,
        raw_input: resolvedRawInput,
        // 구 세션 backfill: stub 모드는 hash 미설정, real 모드는 없으면 생성 있으면 보존
        ...(request.executionMode !== "stub"
          ? { raw_input_hash: state.shared_context.raw_input_hash ?? hashRawInput(resolvedRawInput) }
          : {}),
      },
    };
    // 이전에 실패한 작업들을 failedTaskIds에 추가하여 의존성 차단 로직이 작동하게 함
    const loadedFailedIds = (state.shared_context.failed_task_ids as string[]) || [];
    loadedFailedIds.forEach((id) => failedTaskIds.add(id));
  } else {
    state = initSessionState(sessionId, request.userRequest.raw_input, request.executionMode);
  }
  state = applyProjectInfo(state, request.projectInfo, request.userRequest.cwd);
  // RAG Phase 2: 전체 DAG 보존 (Task의 input_hash, depends_on, priority 등 완전 보존)
  state = { ...state, task_graph: graph };
  await emitProgressWithLogging( {
    stage: "State Manager",
    status: "end",
    message: "State Manager: 세션 상태 준비 완료",
  });

  // ── F8~F14: 프로젝트별 패턴 학습 (non-fatal) ─────────────────────────────
  if (request.executionMode !== "stub") {
    const cwd = request.userRequest.cwd ?? process.cwd();
    const sessionsDir = resolveSessionsDir(cwd);
    const projectId = state.shared_context.project_id as string | undefined;
    const projectMemory = new ProjectMemory(sessionsDir, projectId);
    const firstTaskType = graph.tasks[0]?.type;

    // F8: 시퀀스 예측
    if (firstTaskType) {
      try {
        const miner = new TaskSequenceMiner(sessionsDir);
        const predicted = await miner.predictNext([firstTaskType]);
        if (predicted) {
          await emitProgressWithLogging({
            stage: "Task Graph Builder", status: "info",
            message: `패턴 예측: ${firstTaskType} 다음은 ${predicted} 가능성 높음`,
          });
        }
      } catch { /* non-fatal */ }
    }

    // F9: 실패 패턴 경고 (project_id 격리)
    try {
      const failStats = await projectMemory.getFailureStats();
      for (const task of graph.tasks.slice(0, 3)) {
        const entry = failStats.find((s) => s.taskType === task.type && s.adapter === request.adapter);
        if (entry && entry.failureRate >= 0.2) {
          const pct = Math.round(entry.failureRate * 100);
          await emitProgressWithLogging({
            stage: "Executor", status: "info",
            message: `⚠️ ${task.type} × ${request.adapter} 실패율 ${pct}% (${entry.failCount}/${entry.totalCount}건)`,
          });
        }
      }
    } catch { /* non-fatal */ }

    // F11: 워크플로우 템플릿 매칭 (project_id 격리)
    if (firstTaskType) {
      try {
        const suggestion = await projectMemory.getWorkflowSuggestion([firstTaskType]);
        if (suggestion) {
          await emitProgressWithLogging({
            stage: "Task Graph Builder", status: "info",
            message: `워크플로우 템플릿 매칭: [${suggestion.typeSequence.join(" → ")}] (${suggestion.count}회 사용)`,
          });
        }
      } catch { /* non-fatal */ }
    }

    // F13+F14: Adapter 토큰 통계 (project_id 격리)
    try {
      const adapterStats = await projectMemory.getAdapterStats();
      const adapterStat = adapterStats.find((s) => s.adapter === request.adapter);
      if (adapterStat && adapterStat.avgInputTokens > 0) {
        await emitProgressWithLogging({
          stage: "Context Optimizer", status: "info",
          message: `${request.adapter} 평균 입력 ${Math.round(adapterStat.avgInputTokens)} 토큰, 압축율 ${Math.round(adapterStat.avgReductionRatio * 100)}%`,
        });
      }
    } catch { /* non-fatal */ }
  }

  // ── Step 6: 실행 루프 ────────────────────────────────────────────────────
  for (const { stage, tasks } of stages) {
    logger.info(`단계 ${stage} 실행 중 — 작업 ${tasks.length}개`);

    for (const task of tasks) {
      // 이미 완료된 작업이면 스킵 (Role 2.2 / Role 3 경계)
      if (state.completed_task_ids.includes(task.id)) {
        logger.info(`작업 [${task.id}]는 세션에서 이미 완료되어 건너뜁니다`);
        await emitProgressWithLogging( {
          stage: "Executor",
          status: "skip",
          taskId: task.id,
          message: `Executor(${task.id})는 이미 완료되어 건너뜁니다`,
        });
        const previousResult = state.task_results[task.id] as any;
        taskRecords.push({
          taskId: task.id,
          status: "completed",
          rawOutput: previousResult?.raw_output ?? "",
        });
        continue;
      }

      // Strict 모드: 의존 Task가 실패했으면 현재 Task 실행 불가
      const blockedBy = task.depends_on.find((depId) => failedTaskIds.has(depId));
      if (blockedBy) {
        failedTaskIds.add(task.id);
        const skipReason = `의존성 [${blockedBy}] 실패로 건너뜀`;
        state = markTaskSkipped(state, task.id, blockedBy, task.type, task);
        state = applySessionTokenMetrics(
          state,
          request.userRequest.raw_input,
          compiledPrompt.compressed_prompt,
        ).state;
        await SessionStateManager.saveSession(state);
        taskRecords.push({ taskId: task.id, status: "skipped", rawOutput: "", blockedBy });
        await PipelineTracer.trace({
          sessionId, stage: `Executor:${task.id}`, role: "role3", phase: "output",
          dataType: "ExecutionResult", data: {
            task_id: task.id,
            success: false,
            raw_output: skipReason,
            type: task.type,
          },
        });
        logger.warn(`작업 [${task.id}] 건너뜀 — 의존성 [${blockedBy}] 실패`);
        await emitProgressWithLogging( {
          stage: "Executor",
          status: "skip",
          taskId: task.id,
          message: `Executor(${task.id})는 의존성 ${blockedBy} 실패로 건너뜁니다`,
        });
        continue;
      }

      // F2: Task-level input_hash cache bypass (stub 모드 제외)
      if (!request.noCache && !CACHE_DISABLED && request.executionMode !== "stub" && task.input_hash) {
        const projectId = state.shared_context.project_id as string | undefined;
        const cachedTask = await SessionStateManager.findSuccessfulTaskByHash(
          task.input_hash,
          { ...(projectId ? { project_id: projectId } : {}), recencyDays: CACHE_TTL_DAYS },
        );
        if (cachedTask && isTaskCacheValid(cachedTask.taskResult, {})) {
          const cachedOutput = (cachedTask.taskResult.raw_output as string) ?? "";
          state = markTaskCompleted(state, task.id, cachedOutput, task.type, task);
          state = applySessionTokenMetrics(
            state,
            request.userRequest.raw_input,
            compiledPrompt.compressed_prompt,
          ).state;
          await SessionStateManager.saveSession(state);
          taskRecords.push({ taskId: task.id, status: "completed", rawOutput: cachedOutput });
          await emitActionTimelineWithLogging(
            createActionTimelineEvent({
              kind: "cache_hit",
              source: "pipeline",
              summary: `F2 캐시 hit — task ${task.id} (세션 ${cachedTask.sessionId})`,
              taskId: task.id,
            }),
          );
          await emitProgressWithLogging({
            stage: "Executor",
            status: "skip",
            taskId: task.id,
            message: `Executor(${task.id}) F2 캐시 hit — adapter 호출 생략`,
          });
          continue;
        }
        await emitActionTimelineWithLogging(
          createActionTimelineEvent({
            kind: "cache_miss",
            source: "pipeline",
            summary: `F2 캐시 miss — task ${task.id} hash ${task.input_hash}`,
            taskId: task.id,
          }),
        );
      }

      // 현재 실행 중인 Task 기록 (Role 2.2)
      state = { ...state, current_task_id: task.id };

      // ExecutionContext 생성 (Role 2.2 — ContextCompressor → ContextSelector → ContextBuilder)
      await emitProgressWithLogging({
        stage: "Context Optimizer",
        status: "start",
        taskId: task.id,
        message: `Context Optimizer(${task.id}) 시작`,
      });
      PipelineTracer.startStage(`ContextOptimizer:${task.id}`);
      const modelName = resolveModelName(request.adapter, request.env);
      const tokensBeforeCompression = ContextCompressor.estimateTokens(state, modelName);
      const context = ContextBuilder.build(state, task, modelName);
      const contextCompression = await compressExecutionContextSummary(
        context.context_summary,
        request,
      );
      const executionContext = {
        ...context,
        context_summary: contextCompression.summary,
      };
      const compressedTaskIds = Object.entries(state.task_results)
        .filter(([, r]) => (r as Record<string, unknown>)._compressed === true)
        .map(([id]) => id);
      const keptTaskIds = state.completed_task_ids.filter(
        (id) => !compressedTaskIds.includes(id),
      );
      const contextTokens = ContextCompressor.estimateTokens(
        { ...state, task_results: context.selected_context as typeof state.task_results },
        modelName,
      );
      await PipelineTracer.trace({
        sessionId, stage: "ContextOptimizer", role: "role2.2", phase: "output",
        dataType: "ExecutionContext", data: executionContext,
        durationMs: PipelineTracer.endStage(`ContextOptimizer:${task.id}`),
      });
      await emitProgressWithLogging({
        stage: "Context Optimizer",
        status: "end",
        taskId: task.id,
        message: `Context Optimizer(${task.id}) 완료`,
        data: {
          tokensBeforeCompression,
          contextTokens,
          contextCompressionRepairActions: contextCompression.repairActions,
          compressedTaskIds,
          keptTaskIds,
        },
      });

      // Task 실행 (Role 3)
      const responseLanguageInstruction =
        compiledPrompt.language !== "en"
          ? "Respond entirely in Korean.\n\n"
          : "";
      const ragContext = formatRagSnippetsForPrompt(ragSnippets);
      const prompt = `${responseLanguageInstruction}${ragContext ? `${ragContext}\n\n` : ""}[${task.type.toUpperCase()}] ${task.title}\n\nContext: ${executionContext.context_summary}`;
      logger.info(`작업 [${task.id}] 실행 중 type=${task.type}`);
      await emitProgressWithLogging( {
        stage: "Executor",
        status: "start",
        taskId: task.id,
        message: `Executor(${task.id}) 실행 중`,
      });
      await PipelineTracer.trace({
        sessionId, stage: `Executor:${task.id}`, role: "role3", phase: "input",
        dataType: "ExecutionRequest", data: { task_id: task.id, type: task.type, prompt },
      });

      PipelineTracer.startStage(`Executor:${task.id}`);
      const adapterModel = request.env?.ADAPTER_MODEL ?? process.env.ADAPTER_MODEL;
      const execResult = await executeWithAdapter({
        adapter: request.adapter,
        mode: request.mode,
        executionMode: request.executionMode,
        ...(request.presentationMode ? { presentationMode: request.presentationMode } : {}),
        prompt,
        verbose: request.verbose,
        ...(adapterModel ? { model: adapterModel } : {}),
        ...(request.userRequest.cwd ? { cwd: request.userRequest.cwd } : {}),
        sessionId,
        ...(request.onAdapterEvent ? { onAdapterEvent: request.onAdapterEvent } : {}),
        ...(request.onPtyController ? { onPtyController: request.onPtyController } : {}),
        onActionTimelineEvent: emitActionTimelineWithLogging,
      });
      adapterTranscript = mergePtyTranscripts(adapterTranscript, execResult.transcript);
      if (!execResult.ok) {
        // 실패 — Strict 모드에 따라 후속 의존 Task도 차단됨
        failedTaskIds.add(task.id);
        state = markTaskFailed(state, task.id, execResult.rawOutput, task.type, task);
        state = applySessionTokenMetrics(
          state,
          request.userRequest.raw_input,
          compiledPrompt.compressed_prompt,
        ).state;
        await SessionStateManager.saveSession(state);
        await PipelineTracer.trace({
          sessionId, stage: `Executor:${task.id}`, role: "role3", phase: "output",
          dataType: "ExecutionResult", data: { task_id: task.id, success: false, raw_output: execResult.rawOutput, type: task.type },
          durationMs: PipelineTracer.endStage(`Executor:${task.id}`),
        });
        await emitProgressWithLogging( {
          stage: "Executor",
          status: "error",
          taskId: task.id,
          message: `Executor(${task.id}) 실패`,
        });
        logger.error(`작업 [${task.id}] 실패 (exit ${execResult.exitCode}) — 의존 작업은 건너뜁니다`);
      } else {
        // 성공 — 세션 상태 갱신 및 저장 (Role 2.2)
        await PipelineTracer.trace({
          sessionId, stage: `Executor:${task.id}`, role: "role3", phase: "output",
          dataType: "ExecutionResult", data: { task_id: task.id, success: true, raw_output: execResult.rawOutput, type: task.type },
          durationMs: PipelineTracer.endStage(`Executor:${task.id}`),
        });
        await emitProgressWithLogging( {
          stage: "Executor",
          status: "end",
          taskId: task.id,
          message: `Executor(${task.id}) 완료`,
        });
        failedTaskIds.delete(task.id);
        state = markTaskCompleted(state, task.id, execResult.rawOutput, task.type, task);
        state = applySessionTokenMetrics(
          state,
          request.userRequest.raw_input,
          compiledPrompt.compressed_prompt,
        ).state;
        await emitProgressWithLogging( {
          stage: "State Manager",
          status: "start",
          taskId: task.id,
          message: `State Manager(${task.id}) 저장 중`,
        });
        await SessionStateManager.saveSession(state);
        await emitProgressWithLogging( {
          stage: "State Manager",
          status: "end",
          taskId: task.id,
          message: `State Manager(${task.id}) 저장 완료`,
        });
        taskRecords.push({ taskId: task.id, status: "completed", rawOutput: execResult.rawOutput });
        logger.info(`작업 [${task.id}] 완료`);
      }
    }
  }

  // ── Step 7: 결과 반환 ────────────────────────────────────────────────────
  const allOk = failedTaskIds.size === 0;
  const completedCount = taskRecords.filter((r) => r.status === "completed").length;
  const totalCount = graph.tasks.length;

  // trace 저장 (DETOKS_TRACE=1 또는 request.trace 플래그)
  let traceFilePath: string | undefined;
  if (request.trace) {
    traceFilePath = await PipelineTracer.saveTrace(sessionId);
  }

  const finalSummary = allOk
    ? `${totalCount}개 작업을 모두 완료했습니다`
    : `${completedCount}/${totalCount}개 작업을 완료했습니다 — ${failedTaskIds.size}개 실패`;
  const finalNextAction = allOk
    ? "파이프라인이 완료되었습니다."
    : "실패한 작업을 수정한 뒤 다시 시도하세요.";

  state = {
    ...state,
    last_summary: finalSummary,
    next_action: finalNextAction,
    updated_at: new Date().toISOString(),
  };
  const sessionTokenMetrics = applySessionTokenMetrics(
    state,
    request.userRequest.raw_input,
    compiledPrompt.compressed_prompt,
  );
  state = sessionTokenMetrics.state;
  await emitProgressWithLogging( {
    stage: "State Manager",
    status: "start",
    message: "State Manager: 최종 세션 저장 중",
  });
  await SessionStateManager.saveSession(state);
  await emitProgressWithLogging( {
    stage: "State Manager",
    status: "end",
    message: "State Manager: 최종 세션 저장 완료",
  });

  // ── RAG indexing: 완료된 세션을 벡터 DB에 인덱싱 ─────────────────────────
  if (ragEmbedder && ragStore) {
    try {
      const indexer = new EmbeddingIndexer(ragStore, ragEmbedder);
      await indexer.indexSession(state as any);
    } catch (idxErr) {
      logger.warn(`RAG indexing 실패 (non-fatal): ${toErrorMessage(idxErr)}`);
    } finally {
      await ragEmbedder.dispose().catch(() => {});
      ragStore.close();
    }
  }

  return {
    ok: allOk,
    mode: request.mode,
    adapter: request.adapter,
    summary: finalSummary,
    nextAction: finalNextAction,
    originalPrompt: request.userRequest.raw_input,
    tokenMetrics: sessionTokenMetrics.tokenMetrics,
    stages: buildPipelineStages(allOk),
    rawOutput: taskRecords.map((r) => r.rawOutput).filter(Boolean).join("\n---\n"),
    sessionId,
    taskRecords,
    ...(adapterTranscript ? { adapterTranscript } : {}),
    compiledPrompt: compiledPrompt.compressed_prompt,
    role2Handoff: role2PromptInput.compiled_prompt,
    promptLanguage: compiledPrompt.language,
    promptInferenceTimeSec: compiledPrompt.inference_time_sec ?? 0,
    promptValidationErrors: compiledPrompt.validation_errors ?? [],
    promptRepairActions: compiledPrompt.repair_actions ?? [],
    ...(promptTokenSavings ? { promptTokenSavings } : {}),
    ...(actionTimeline.length ? { actionTimeline } : {}),
    ...(request.trace ? { traceLog: PipelineTracer.getTrace(sessionId) } : {}),
    ...(traceFilePath ? { traceFilePath } : {}),
    progressLog,
    ...(resumeHint ? { resumeHint } : {}),
    ...(semanticContext ? { semanticContext } : {}),
  };
};
