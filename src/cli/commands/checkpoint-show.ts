import { SessionStateManager } from "../../core/state/SessionStateManager.js";

export interface CheckpointShowOutput {
  ok: true;
  mode: "checkpoint-show";
  mutatesState: false;
  message: string;
  checkpoint: {
    id: string;
    title: string;
    taskId: string;
    createdAt: string;
    changedFiles: string[];
    nextAction: string;
  };
}

export const runCheckpointShowCommand = async (
  checkpointId: string,
): Promise<CheckpointShowOutput> => {
  const checkpoint = await SessionStateManager.loadCheckpoint(checkpointId);

  return {
    ok: true,
    mode: "checkpoint-show",
    mutatesState: false,
    message: `Checkpoint ${checkpoint.id} loaded.`,
    checkpoint: {
      id: checkpoint.id,
      title: checkpoint.title,
      taskId: checkpoint.task_id,
      createdAt: checkpoint.created_at,
      changedFiles: checkpoint.changed_files,
      nextAction: checkpoint.next_action,
    },
  };
};
