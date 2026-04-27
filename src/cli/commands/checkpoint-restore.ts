import { SessionStateManager } from "../../core/state/SessionStateManager.js";
import type { TaskResult } from "../../schemas/pipeline.js";

const CHECKPOINT_SEPARATOR = "_checkpoint_";

function parseSessionIdFromCheckpointId(checkpointId: string): string | null {
  const separatorIndex = checkpointId.indexOf(CHECKPOINT_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === checkpointId.length - CHECKPOINT_SEPARATOR.length) {
    return null;
  }
  return checkpointId.slice(0, separatorIndex);
}

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
    const sessionId = parseSessionIdFromCheckpointId(checkpoint.id);
    if (!sessionId) {
      return {
        ok: false,
        mode: "checkpoint-restore",
        sessionId: "unknown",
        checkpointId,
        restored: false,
        mutatesState: false,
        message: `Checkpoint ${checkpointId} does not use <session-id>_checkpoint_<checkpoint-id>.`,
      };
    }
    
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
    const newTaskResults: Record<string, TaskResult> = {};
    for (const id of newCompletedIds) {
        const result = state.task_results[id];
        if (result) {
          newTaskResults[id] = result;
        }
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
