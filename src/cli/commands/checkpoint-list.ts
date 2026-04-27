import { SessionStateManager } from "../../core/state/SessionStateManager.js";

export interface CheckpointListOutput {
  ok: true;
  mode: "checkpoint-list";
  sessionId: string;
  checkpointCount: number;
  checkpoints: Array<{
    id: string;
    title: string;
    taskId: string;
    createdAt: string;
    changedFiles: string[];
    nextAction: string;
  }>;
}

export const runCheckpointListCommand = async (
  sessionId: string,
): Promise<CheckpointListOutput> => {
  const checkpoints = await SessionStateManager.listCheckpoints(sessionId);

  return {
    ok: true,
    mode: "checkpoint-list",
    sessionId,
    checkpointCount: checkpoints.length,
    checkpoints: checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      title: checkpoint.title,
      taskId: checkpoint.task_id,
      createdAt: checkpoint.created_at,
      changedFiles: checkpoint.changed_files,
      nextAction: checkpoint.next_action,
    })),
  };
};
