import { createHash } from "node:crypto";
import { DAGValidator } from "../task-graph/DAGValidator.js";
import { DependencyResolver } from "../task-graph/DependencyResolver.js";
import { ParallelClassifier } from "../task-graph/ParallelClassifier.js";
import { TaskGraphProcessor } from "../task-graph/TaskGraphProcessor.js";
import { TaskSentenceSplitter } from "../task-graph/TaskSentenceSplitter.js";
import { compilePrompt, createRole2PromptInput } from "../prompt/compiler.js";
import { ContextBuilder } from "../context/ContextBuilder.js";
import { SessionStateManager } from "../state/SessionStateManager.js";
import { executeWithAdapter } from "../executor/execute.js";
import { logger } from "../utils/logger.js";
import { PipelineTracer } from "../utils/PipelineTracer.js";
import { translateVisibleText } from "../utils/visibleText.js";
import { buildTokenMetrics, type TokenMetricsSnapshot } from "../utils/tokenMetrics.js";
import type { SessionState } from "../../schemas/pipeline.js";
import type {
  PipelineProgressEvent,
  PipelineExecutionRequest,
  PipelineExecutionResult,
  PipelineStageStatus,
  TaskExecutionRecord,
} from "./types.js";

function generateSessionId(): string {
  return createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 12);
}

function initSessionState(sessionId: string, rawInput: string): SessionState {
  return {
    shared_context: { session_id: sessionId, raw_input: rawInput },
    task_results: {},
    current_task_id: null,
    completed_task_ids: [],
    updated_at: new Date().toISOString(),
  };
}

function applyProjectInfo(
  state: SessionState,
  projectInfo: PipelineExecutionRequest["projectInfo"],
): SessionState {
  if (!projectInfo) {
    return state;
  }

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

function markTaskCompleted(
  state: SessionState,
  taskId: string,
  rawOutput: string,
  taskType?: string,
): SessionState {
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
      },
    },
    updated_at: new Date().toISOString(),
  };
}

function markTaskFailed(
  state: SessionState,
  taskId: string,
  rawOutput: string,
  taskType?: string,
): SessionState {
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
      },
    },
    updated_at: new Date().toISOString(),
  };
}

function markTaskSkipped(
  state: SessionState,
  taskId: string,
  blockedBy: string,
  taskType?: string,
): SessionState {
  const skipReason = `의존성 [${blockedBy}] 실패로 건너뜀`;

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
      },
    },
    updated_at: new Date().toISOString(),
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
  PipelineTracer.clear();

  // ── Step 1: Prompt compile + Role 2.1 handoff 생성 (Role 1) ──────────────
  let compiledPrompt;
  let role2PromptInput;
  await emitProgress(request, {
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
    role2PromptInput = createRole2PromptInput(compiledPrompt);
    await PipelineTracer.trace({
      sessionId, stage: "PromptCompiler", role: "role1", phase: "output",
      dataType: "CompiledPrompt", data: compiledPrompt,
      durationMs: PipelineTracer.endStage("PromptCompiler"),
    });
    await emitProgress(request, {
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
    await emitProgress(request, {
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
      ...(request.trace ? { traceLog: PipelineTracer.getTrace(sessionId) } : {}),
      ...(traceFilePath ? { traceFilePath } : {}),
    };
  }

  // ── Step 2: TaskGraph 생성 (Role 2.1) ────────────────────────────────────
  await emitProgress(request, {
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
  await emitProgress(request, {
    stage: "Task Graph Builder",
    status: "end",
    message: "Task Graph Builder 완료",
  });

  // ── Step 5: 세션 상태 초기화 / 로드 (Role 2.2) ───────────────────────────
  await emitProgress(request, {
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
    state = {
      ...state,
      shared_context: {
        ...state.shared_context,
        session_id: sessionId,
        raw_input:
          typeof state.shared_context.raw_input === "string" &&
          state.shared_context.raw_input.trim().length > 0
            ? state.shared_context.raw_input
            : request.userRequest.raw_input,
      },
    };
    // 이전에 실패한 작업들을 failedTaskIds에 추가하여 의존성 차단 로직이 작동하게 함
    const loadedFailedIds = (state.shared_context.failed_task_ids as string[]) || [];
    loadedFailedIds.forEach((id) => failedTaskIds.add(id));
  } else {
    state = initSessionState(sessionId, request.userRequest.raw_input);
  }
  state = applyProjectInfo(state, request.projectInfo);
  await emitProgress(request, {
    stage: "State Manager",
    status: "end",
    message: "State Manager: 세션 상태 준비 완료",
  });

  // ── Step 6: 실행 루프 ────────────────────────────────────────────────────
  for (const { stage, tasks } of stages) {
    logger.info(`단계 ${stage} 실행 중 — 작업 ${tasks.length}개`);

    for (const task of tasks) {
      // 이미 완료된 작업이면 스킵 (Role 2.2 / Role 3 경계)
      if (state.completed_task_ids.includes(task.id)) {
        logger.info(`작업 [${task.id}]는 세션에서 이미 완료되어 건너뜁니다`);
        await emitProgress(request, {
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
        state = markTaskSkipped(state, task.id, blockedBy, task.type);
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
        await emitProgress(request, {
          stage: "Executor",
          status: "skip",
          taskId: task.id,
          message: `Executor(${task.id})는 의존성 ${blockedBy} 실패로 건너뜁니다`,
        });
        continue;
      }

      // 현재 실행 중인 Task 기록 (Role 2.2)
      state = { ...state, current_task_id: task.id };

      // ExecutionContext 생성 (Role 2.2 — ContextCompressor → ContextSelector → ContextBuilder)
      await emitProgress(request, {
        stage: "Context Optimizer",
        status: "start",
        taskId: task.id,
        message: `Context Optimizer(${task.id}) 시작`,
      });
      PipelineTracer.startStage(`ContextOptimizer:${task.id}`);
      const context = ContextBuilder.build(state, task);
      await PipelineTracer.trace({
        sessionId, stage: "ContextOptimizer", role: "role2.2", phase: "output",
        dataType: "ExecutionContext", data: context,
        durationMs: PipelineTracer.endStage(`ContextOptimizer:${task.id}`),
      });
      await emitProgress(request, {
        stage: "Context Optimizer",
        status: "end",
        taskId: task.id,
        message: `Context Optimizer(${task.id}) 완료`,
      });

      // Task 실행 (Role 3)
      const prompt = `[${task.type.toUpperCase()}] ${task.title}\n\nContext: ${context.context_summary}`;
      logger.info(`작업 [${task.id}] 실행 중 type=${task.type}`);
      await emitProgress(request, {
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
      const execResult = await executeWithAdapter({
        adapter: request.adapter,
        mode: request.mode,
        executionMode: request.executionMode,
        prompt,
        verbose: request.verbose,
        ...(request.userRequest.cwd ? { cwd: request.userRequest.cwd } : {}),
        sessionId,
      });

      if (!execResult.ok) {
        // 실패 — Strict 모드에 따라 후속 의존 Task도 차단됨
        failedTaskIds.add(task.id);
        state = markTaskFailed(state, task.id, execResult.rawOutput, task.type);
        state = applySessionTokenMetrics(
          state,
          request.userRequest.raw_input,
          compiledPrompt.compressed_prompt,
        ).state;
        await SessionStateManager.saveSession(state);
        taskRecords.push({ taskId: task.id, status: "failed", rawOutput: execResult.rawOutput });
        await PipelineTracer.trace({
          sessionId, stage: `Executor:${task.id}`, role: "role3", phase: "output",
          dataType: "ExecutionResult", data: { task_id: task.id, success: false, raw_output: execResult.rawOutput, type: task.type },
          durationMs: PipelineTracer.endStage(`Executor:${task.id}`),
        });
        await emitProgress(request, {
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
        await emitProgress(request, {
          stage: "Executor",
          status: "end",
          taskId: task.id,
          message: `Executor(${task.id}) 완료`,
        });
        failedTaskIds.delete(task.id);
        state = markTaskCompleted(state, task.id, execResult.rawOutput, task.type);
        state = applySessionTokenMetrics(
          state,
          request.userRequest.raw_input,
          compiledPrompt.compressed_prompt,
        ).state;
        await emitProgress(request, {
          stage: "State Manager",
          status: "start",
          taskId: task.id,
          message: `State Manager(${task.id}) 저장 중`,
        });
        await SessionStateManager.saveSession(state);
        await emitProgress(request, {
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
  await emitProgress(request, {
    stage: "State Manager",
    status: "start",
    message: "State Manager: 최종 세션 저장 중",
  });
  await SessionStateManager.saveSession(state);
  await emitProgress(request, {
    stage: "State Manager",
    status: "end",
    message: "State Manager: 최종 세션 저장 완료",
  });

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
    compiledPrompt: compiledPrompt.compressed_prompt,
    role2Handoff: role2PromptInput.compiled_prompt,
    promptLanguage: compiledPrompt.language,
    promptInferenceTimeSec: compiledPrompt.inference_time_sec ?? 0,
    promptValidationErrors: compiledPrompt.validation_errors ?? [],
    promptRepairActions: compiledPrompt.repair_actions ?? [],
    ...(request.trace ? { traceLog: PipelineTracer.getTrace(sessionId) } : {}),
    ...(traceFilePath ? { traceFilePath } : {}),
  };
};
