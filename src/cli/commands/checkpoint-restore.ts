import { SessionStateManager } from "../../core/state/SessionStateManager.js";

export interface CheckpointRestoreOutput {
  ok: boolean;
  mode: "checkpoint-restore";
  sessionId: string;
  checkpointId: string;
  restored: boolean;
  mutatesState: boolean;
  message: string;
}

export const runCheckpointRestoreCommand = async (
  checkpointId: string,
): Promise<CheckpointRestoreOutput> => {
  try {
    const checkpoint = await SessionStateManager.loadCheckpoint(checkpointId);
    const sessionId = checkpoint.id.split('_checkpoint_')[0] || checkpoint.id;
    
    // Check if session exists
    if (!(await SessionStateManager.sessionExists(sessionId))) {
        return {
            ok: false,
            mode: "checkpoint-restore",
            sessionId,
            checkpointId,
            restored: false,
            mutatesState: false,
            message: `체크포인트 ${checkpointId}의 대상 세션 ${sessionId}를 찾지 못했습니다.`
        };
    }

    const state = await SessionStateManager.loadSession(sessionId);
    
    // Find index of task that created this checkpoint
    const taskIndex = state.completed_task_ids.indexOf(checkpoint.task_id);
    if (taskIndex === -1) {
        return {
            ok: false,
            mode: "checkpoint-restore",
            sessionId,
            checkpointId,
            restored: false,
            mutatesState: false,
            message: `세션 기록에서 작업 ${checkpoint.task_id}를 찾지 못했습니다.`
        };
    }

    // Truncate history to this checkpoint
    const newCompletedIds = state.completed_task_ids.slice(0, taskIndex + 1);
    const newTaskResults: Record<string, unknown> = {};
    for (const id of newCompletedIds) {
        newTaskResults[id] = state.task_results[id];
    }

    const newState = {
        ...state,
        completed_task_ids: newCompletedIds,
        task_results: newTaskResults,
        current_task_id: null,
        updated_at: new Date().toISOString()
    };

    await SessionStateManager.saveSession(newState);

    return {
      ok: true,
      mode: "checkpoint-restore",
      sessionId,
      checkpointId,
      restored: true,
      mutatesState: true,
      message: `세션 ${sessionId}를 체크포인트 ${checkpointId} 시점으로 복원했습니다.`,
    };
  } catch (error: any) {
    return {
      ok: false,
      mode: "checkpoint-restore",
      sessionId: "unknown",
      checkpointId,
      restored: false,
      mutatesState: false,
      message: `체크포인트 ${checkpointId} 복원에 실패했습니다: ${error.message}`,
    };
  }
};
