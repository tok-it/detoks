import { createHash } from "node:crypto";
import { DAGValidator } from "../task-graph/DAGValidator.js";
import { DependencyResolver } from "../task-graph/DependencyResolver.js";
import { ParallelClassifier } from "../task-graph/ParallelClassifier.js";
import { TaskGraphProcessor } from "../task-graph/TaskGraphProcessor.js";
import { ContextBuilder } from "../context/ContextBuilder.js";
import { SessionStateManager } from "../state/SessionStateManager.js";
import { executeWithAdapter } from "../executor/execute.js";
import { logger } from "../utils/logger.js";
import type { SessionState } from "../../schemas/pipeline.js";
import type {
  PipelineExecutionRequest,
  PipelineExecutionResult,
  PipelineStageStatus,
  TaskExecutionRecord,
} from "./types.js";

function generateSessionId(): string {
  return createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 12);
}

function initSessionState(sessionId: string): SessionState {
  return {
    shared_context: { session_id: sessionId },
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
): SessionState {
  return {
    ...state,
    current_task_id: null,
    completed_task_ids: [...state.completed_task_ids, taskId],
    task_results: {
      ...state.task_results,
      [taskId]: { summary: rawOutput.slice(0, 200), raw_output: rawOutput },
    },
    updated_at: new Date().toISOString(),
  };
}

function buildPipelineStages(ok: boolean): PipelineStageStatus[] {
  const resultStatus = ok ? "completed" : "failed";
  return [
    { name: "Prompt Compiler",   owner: "role1",   status: "stubbed"      },
    { name: "Task Graph Builder", owner: "role2.1", status: resultStatus   },
    { name: "Context Optimizer",  owner: "role2.2", status: resultStatus   },
    { name: "Executor",           owner: "role3",   status: "ready"        },
    { name: "State Manager",      owner: "role2.2", status: resultStatus   },
  ];
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

  // ── Step 1: TaskGraph 생성 (Role 2.1) ────────────────────────────────────
  // Role 1이 아직 stub이므로 raw_input을 단일 sentence로 취급
  const graph = TaskGraphProcessor.process({
    sentences: [request.userRequest.raw_input],
  });

  // ── Step 2: DAG 검증 (Role 2.1 — 1차 검증) ───────────────────────────────
  const validation = DAGValidator.validate(graph);
  if (!validation.valid) {
    logger.error(`DAG validation failed: ${validation.reason} — ${validation.detail}`);
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
    };
  }

  // ── Step 3: 의존성 해결 + stage 분류 (Role 2.1) ───────────────────────────
  const resolution = DependencyResolver.resolve(graph, validation);
  const { stages } = ParallelClassifier.classify(resolution);

  // ── Step 4: 세션 상태 초기화 (Role 2.2) ──────────────────────────────────
  let state = initSessionState(sessionId);

  // ── Step 5: 실행 루프 ────────────────────────────────────────────────────
  const taskRecords: TaskExecutionRecord[] = [];
  const failedTaskIds = new Set<string>();

  for (const { stage, tasks } of stages) {
    logger.info(`Executing stage ${stage} — ${tasks.length} task(s)`);

    for (const task of tasks) {
      // Strict 모드: 의존 Task가 실패했으면 현재 Task 실행 불가
      const blockedBy = task.depends_on.find((depId) => failedTaskIds.has(depId));
      if (blockedBy) {
        failedTaskIds.add(task.id);
        taskRecords.push({ taskId: task.id, status: "skipped", rawOutput: "", blockedBy });
        logger.warn(`Task [${task.id}] skipped — dependency [${blockedBy}] failed`);
        continue;
      }

      // 현재 실행 중인 Task 기록 (Role 2.2)
      state = { ...state, current_task_id: task.id };

      // ExecutionContext 생성 (Role 2.2 — ContextCompressor → ContextSelector → ContextBuilder)
      const context = ContextBuilder.build(state, task);

      // Task 실행 (Role 3)
      const prompt = `[${task.type.toUpperCase()}] ${task.title}\n\nContext: ${context.context_summary}`;
      logger.info(`Running task [${task.id}] type=${task.type}`);

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
        taskRecords.push({ taskId: task.id, status: "failed", rawOutput: execResult.rawOutput });
        logger.error(`Task [${task.id}] failed (exit ${execResult.exitCode}) — dependent tasks will be skipped`);
      } else {
        // 성공 — 세션 상태 갱신 및 저장 (Role 2.2)
        state = markTaskCompleted(state, task.id, execResult.rawOutput);
        await SessionStateManager.saveSession(state);
        taskRecords.push({ taskId: task.id, status: "completed", rawOutput: execResult.rawOutput });
        logger.info(`Task [${task.id}] completed`);
      }
    }
  }

  // ── Step 6: 결과 반환 ────────────────────────────────────────────────────
  const allOk = failedTaskIds.size === 0;
  const completedCount = taskRecords.filter((r) => r.status === "completed").length;
  const totalCount = graph.tasks.length;

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
  };
};
