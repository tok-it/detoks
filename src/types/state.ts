import {
  TaskSchema,
  TaskStatusSchema,
  CheckpointSchema,
  SessionStateSchema,
  type TaskStatus,
  type Task,
  type Checkpoint,
  type SessionState,
  type RequestCategory,
} from "../schemas/pipeline.js";

export type TaskType = RequestCategory;

// Re-export canonical schemas and types
export { TaskSchema, TaskStatusSchema, CheckpointSchema, SessionStateSchema };
export type { Task, TaskStatus, Checkpoint, SessionState };
