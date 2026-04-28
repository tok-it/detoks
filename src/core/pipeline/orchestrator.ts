import { randomInt } from "node:crypto";
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
import type { RequestCategory, SessionState, TaskGraph, TaskResult } from "../../schemas/pipeline.js";
import type {
  PipelineExecutionRequest,
  PipelineExecutionResult,
  PipelineStageStatus,
  TaskExecutionRecord,
} from "./types.js";

const SESSION_VERSION = "1";

const SESSION_ID_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SESSION_ID_LENGTH = 24;

function generateSessionId(): string {
  return Array.from(
    { length: SESSION_ID_LENGTH },
    () => SESSION_ID_CHARSET[randomInt(SESSION_ID_CHARSET.length)]!,
  ).join("");
}

async function allocateSessionId(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const sessionId = generateSessionId();
    if (!(await SessionStateManager.sessionExists(sessionId))) {
      return sessionId;
    }
  }
  throw new Error("Unable to allocate a unique session id after 10 attempts");
}

function taskResultRawOutput(result: TaskResult | undefined): string {
  return result && "raw_output" in result && typeof result.raw_output === "string"
    ? result.raw_output
    : "";
}

function taskIdNumber(taskId: string): number | null {
  const match = /^t(\d+)$/u.exec(taskId);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function nextTaskIdOffset(state: SessionState): number {
  const taskIds = new Set<string>([
    ...state.completed_task_ids,
    ...Object.keys(state.task_results),
  ]);
  if (state.current_task_id) {
    taskIds.add(state.current_task_id);
  }

  let max = 0;
  for (const taskId of taskIds) {
    const number = taskIdNumber(taskId);
    if (number && number > max) {
      max = number;
    }
  }

  return max;
}

function retargetTaskGraphIds(graph: TaskGraph, offset: number): TaskGraph {
  if (offset <= 0) {
    return graph;
  }

  const idMap = new Map<string, string>();
  graph.tasks.forEach((task, index) => {
    idMap.set(task.id, `t${offset + index + 1}`);
  });

  graph.tasks.forEach((task) => {
    task.id = idMap.get(task.id) ?? task.id;
    task.depends_on = task.depends_on.map((depId) => idMap.get(depId) ?? depId);
  });

  return graph;
}

function appendSessionInputHistory(
  state: SessionState,
  nextRawInput: string,
): SessionState {
  const existingHistory = Array.isArray(state.shared_context.input_history)
    ? state.shared_context.input_history.filter((entry): entry is string => typeof entry === "string")
    : [];
  const previousRawInput =
    typeof state.shared_context.raw_input === "string"
      ? state.shared_context.raw_input
      : undefined;
  const nextHistory = [...existingHistory];

  if (previousRawInput && !nextHistory.includes(previousRawInput)) {
    nextHistory.push(previousRawInput);
  }
  if (!nextHistory.includes(nextRawInput)) {
    nextHistory.push(nextRawInput);
  }

  return {
    ...state,
    shared_context: {
      ...state.shared_context,
      raw_input: nextRawInput,
      input_history: nextHistory,
    },
    updated_at: new Date().toISOString(),
  };
}

function initSessionState(sessionId: string, rawInput: string): SessionState {
  return {
    version: SESSION_VERSION,
    shared_context: { session_id: sessionId, raw_input: rawInput },
    task_results: {},
    current_task_id: null,
    completed_task_ids: [],
    updated_at: new Date().toISOString(),
  };
}

function markTaskCompleted(
  state: SessionState,
  taskId: string,
  rawOutput: string,
  taskType?: RequestCategory,
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
  taskType?: RequestCategory,
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
    errorMessage.includes("LOCAL_LLM_API_BASE") ||
    errorMessage.includes("LOCAL_LLM_MODEL_NAME") ||
    errorMessage.includes("MODEL_NAME") ||
    errorMessage.includes("llama.cpp server") ||
    errorMessage.includes("llama-server") ||
    errorMessage.includes("GGUF model") ||
    errorMessage.includes("fetch support")
  ) {
    return "Install llama-server or set Role 1 local LLM runtime config (LOCAL_LLM_API_BASE, LOCAL_LLM_MODEL_NAME) and retry";
  }

  return "Fix prompt compilation inputs or runtime config and retry";
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
  const sessionId = request.userRequest.session_id ?? (await allocateSessionId());
  PipelineTracer.clear();

  // ── Step 1: Prompt compile + Role 2.1 handoff 생성 (Role 1) ──────────────
  let compiledPrompt;
  let role2PromptInput;
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
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    logger.error(`Prompt compilation failed: ${errorMessage}`);
    await PipelineTracer.trace({
      sessionId,
      stage: "PromptCompiler",
      role: "role1",
      phase: "output",
      dataType: "PromptCompilerError",
      data: { error: errorMessage },
      durationMs: PipelineTracer.endStage("PromptCompiler"),
    });
    const traceFilePath = request.trace
      ? await PipelineTracer.saveTrace(sessionId)
      : undefined;
    return {
      ok: false,
      mode: request.mode,
      adapter: request.adapter,
      summary: `Prompt compilation failed: ${errorMessage}`,
      nextAction: inferPromptFailureNextAction(errorMessage),
      stages: buildPipelineStages(false),
      rawOutput: errorMessage,
      sessionId,
      taskRecords: [],
      ...(request.trace ? { traceLog: PipelineTracer.getTrace(sessionId) } : {}),
      ...(traceFilePath ? { traceFilePath } : {}),
    };
  }

  // ── Step 2: TaskGraph 생성 (Role 2.1) ────────────────────────────────────
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
    logger.error(`DAG validation failed: ${validation.reason} — ${validation.detail}`);
    const traceFilePath = request.trace
      ? await PipelineTracer.saveTrace(sessionId)
      : undefined;
    return {
      ok: false,
      mode: request.mode,
      adapter: request.adapter,
      summary: `Graph validation failed: ${validation.reason}`,
      nextAction: "Fix the task graph and retry",
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

  // ── Step 5: 세션 상태 초기화 / 로드 (Role 2.2) ───────────────────────────
  let state: SessionState;
  const taskRecords: TaskExecutionRecord[] = [];
  const failedTaskIds = new Set<string>();

  PipelineTracer.startStage("SessionLoader");
  let graphTaskIds = graph.tasks.map((t) => t.id);

  if (await SessionStateManager.sessionExists(sessionId)) {
    try {
      const loaded = await SessionStateManager.loadSession(sessionId);
      if (loaded.version !== SESSION_VERSION) {
        logger.warn(`[Role 2.2] 세션 버전 불일치 (${loaded.version ?? "none"} → ${SESSION_VERSION}). 새로 시작.`);
        state = initSessionState(sessionId, request.userRequest.raw_input);
        logger.info(`[Role 2.2] 새 세션 생성 (버전 불일치): ${sessionId}`);
      } else {
        const loadedRawInput =
          typeof loaded.shared_context.raw_input === "string"
            ? loaded.shared_context.raw_input
            : "";
        const isContinuationInput =
          loadedRawInput.trim().length > 0 &&
          loadedRawInput.trim() !== request.userRequest.raw_input.trim();

        if (isContinuationInput) {
          retargetTaskGraphIds(graph, nextTaskIdOffset(loaded));
          graphTaskIds = graph.tasks.map((t) => t.id);
          logger.info(`Continuing existing session: ${sessionId}`);
          state = appendSessionInputHistory(loaded, request.userRequest.raw_input);
        } else {
        const orphanedTaskIds = loaded.completed_task_ids.filter((id) => !graphTaskIds.includes(id));
        if (orphanedTaskIds.length > 0) {
          logger.warn(`[Role 2.2] 세션의 Task가 현재 그래프에 없음: ${orphanedTaskIds.join(", ")}. 세션 초기화.`);
          state = initSessionState(sessionId, request.userRequest.raw_input);
          logger.info(`[Role 2.2] 새 세션 생성 (그래프 불일치): ${sessionId}`);
        } else {
          logger.info(`Loading existing session: ${sessionId}`);
          state = {
            ...loaded,
            shared_context: {
              ...loaded.shared_context,
              session_id: sessionId,
              raw_input:
                typeof loaded.shared_context.raw_input === "string" &&
                loaded.shared_context.raw_input.trim().length > 0
                  ? loaded.shared_context.raw_input
                  : request.userRequest.raw_input,
            },
          };
          const loadedFailedIds = Array.isArray(state.shared_context.failed_task_ids)
            ? state.shared_context.failed_task_ids.filter((id): id is string => typeof id === "string")
            : [];
          loadedFailedIds.forEach((id) => failedTaskIds.add(id));
          }
        }
      }
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error(`[Role 2.2] Session load failed for [${sessionId}]: ${errorMessage}`);
      const traceFilePath = request.trace
        ? await PipelineTracer.saveTrace(sessionId)
        : undefined;
      return {
        ok: false,
        mode: request.mode,
        adapter: request.adapter,
        summary: `Session load failed: ${errorMessage}`,
        nextAction: "Fix or reset the existing session before retrying",
        stages: buildPipelineStages(false),
        rawOutput: errorMessage,
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
    }
  } else {
    state = initSessionState(sessionId, request.userRequest.raw_input);
  }

  await PipelineTracer.trace({
    sessionId,
    stage: "SessionLoader",
    role: "role2.2",
    phase: "output",
    dataType: "SessionState",
    data: {
      session_id: state.shared_context.session_id,
      completed_task_count: state.completed_task_ids.length,
      next_task_id: state.current_task_id,
    },
    durationMs: PipelineTracer.endStage("SessionLoader"),
  });
  // ── Step 6: 실행 루프 ────────────────────────────────────────────────────
  for (const { stage, tasks } of stages) {
    logger.info(`Executing stage ${stage} — ${tasks.length} task(s)`);

    for (const task of tasks) {
      // 이미 완료된 작업이면 스킵 (Role 2.2 / Role 3 경계)
      if (state.completed_task_ids.includes(task.id)) {
        logger.info(`Task [${task.id}] already completed in session — skipping`);
        taskRecords.push({
          taskId: task.id,
          status: "completed",
          rawOutput: taskResultRawOutput(state.task_results[task.id]),
        });
        continue;
      }

      // Strict 모드: 의존 Task가 실패했으면 현재 Task 실행 불가
      const blockedBy = task.depends_on.find((depId) => failedTaskIds.has(depId));
      if (blockedBy) {
        failedTaskIds.add(task.id);
        const rawOutput = `Skipped because dependency [${blockedBy}] failed`;
        state = markTaskFailed(state, task.id, rawOutput, task.type);
        state = {
          ...state,
          shared_context: {
            ...state.shared_context,
            failed_task_ids: Array.from(failedTaskIds),
          },
        };
        await SessionStateManager.saveSession(state, request.projectInfo);
        taskRecords.push({ taskId: task.id, status: "skipped", rawOutput: "", blockedBy });
        logger.warn(`Task [${task.id}] skipped — dependency [${blockedBy}] failed`);
        continue;
      }

      // 현재 실행 중인 Task 기록 (Role 2.2)
      state = { ...state, current_task_id: task.id };

      // ExecutionContext 생성 (Role 2.2 — ContextCompressor → ContextSelector → ContextBuilder)
      PipelineTracer.startStage(`ContextOptimizer:${task.id}`);
      const context = ContextBuilder.build(state, task);
      await PipelineTracer.trace({
        sessionId, stage: "ContextOptimizer", role: "role2.2", phase: "output",
        dataType: "ExecutionContext", data: context,
        durationMs: PipelineTracer.endStage(`ContextOptimizer:${task.id}`),
      });

      // Task 실행 (Role 3)
      const prompt = `[${task.type.toUpperCase()}] ${task.title}\n\nContext: ${context.context_summary}`;
      logger.info(`Running task [${task.id}] type=${task.type}`);
      await PipelineTracer.trace({
        sessionId, stage: `Executor:${task.id}`, role: "role3", phase: "input",
        dataType: "ExecutionRequest", data: { task_id: task.id, type: task.type, prompt },
      });

      PipelineTracer.startStage(`Executor:${task.id}`);
      const execResult = await executeWithAdapter({
        adapter: request.adapter,
        ...(request.model !== undefined ? { model: request.model } : {}),
        mode: request.mode,
        executionMode: request.executionMode,
        prompt,
        verbose: request.verbose,
        taskType: task.type,
        ...(request.userRequest.cwd ? { cwd: request.userRequest.cwd } : {}),
        sessionId,
      });

      if (!execResult.ok) {
        // 실패 — Strict 모드에 따라 후속 의존 Task도 차단됨
        failedTaskIds.add(task.id);
        state = markTaskFailed(state, task.id, execResult.rawOutput, task.type);
        await SessionStateManager.saveSession(state, request.projectInfo);
        taskRecords.push({ taskId: task.id, status: "failed", rawOutput: execResult.rawOutput });
        await PipelineTracer.trace({
          sessionId, stage: `Executor:${task.id}`, role: "role3", phase: "output",
          dataType: "ExecutionResult", data: { task_id: task.id, type: task.type, success: false, raw_output: execResult.rawOutput },
          durationMs: PipelineTracer.endStage(`Executor:${task.id}`),
        });
        logger.error(`Task [${task.id}] failed (exit ${execResult.exitCode}) — dependent tasks will be skipped`);
      } else {
        // 성공 — 세션 상태 갱신 및 저장 (Role 2.2)
        await PipelineTracer.trace({
          sessionId, stage: `Executor:${task.id}`, role: "role3", phase: "output",
          dataType: "ExecutionResult", data: { task_id: task.id, type: task.type, success: true, raw_output: execResult.rawOutput },
          durationMs: PipelineTracer.endStage(`Executor:${task.id}`),
        });
        failedTaskIds.delete(task.id);
        state = markTaskCompleted(state, task.id, execResult.rawOutput, task.type);
        await SessionStateManager.saveSession(state, request.projectInfo);
        taskRecords.push({ taskId: task.id, status: "completed", rawOutput: execResult.rawOutput });
        logger.info(`Task [${task.id}] completed`);
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

  return {
    ok: allOk,
    mode: request.mode,
    adapter: request.adapter,
    summary: allOk
      ? `All ${totalCount} task(s) completed`
      : `${completedCount}/${totalCount} task(s) completed — ${failedTaskIds.size} failed`,
    nextAction: allOk ? "Pipeline complete" : "Fix failed tasks and retry",
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
