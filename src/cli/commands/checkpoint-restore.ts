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
            message: `Target session ${sessionId} for checkpoint ${checkpointId} was not found.`
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
            message: `Task ${checkpoint.task_id} not found in session history.`
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
      message: `Session ${sessionId} restored to checkpoint ${checkpointId}.`,
    };
  } catch (error: any) {
    return {
      ok: false,
      mode: "checkpoint-restore",
      sessionId: "unknown",
      checkpointId,
      restored: false,
      mutatesState: false,
      message: `Failed to restore checkpoint ${checkpointId}: ${error.message}`,
    };
  }
};
