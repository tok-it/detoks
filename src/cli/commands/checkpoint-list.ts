import { SessionStateManager } from "../../core/state/SessionStateManager.js";

export interface CheckpointListOutput {
  ok: true;
  mode: "checkpoint-list";
  sessionId: string;
  mutatesState: false;
  hasCheckpoints: boolean;
  checkpointCount: number;
  message: string;
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
  const checkpointCount = checkpoints.length;

  return {
    ok: true,
    mode: "checkpoint-list",
    sessionId,
    mutatesState: false,
    hasCheckpoints: checkpointCount > 0,
    checkpointCount,
    message:
      checkpointCount === 0
        ? `세션 ${sessionId}에서 체크포인트를 찾지 못했습니다.`
        : `세션 ${sessionId}에서 체크포인트 ${checkpointCount}개를 찾았습니다.`,
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
