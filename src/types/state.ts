import { z } from "zod";
import {
  RequestCategorySchema,
  type RequestCategory,
} from "../schemas/pipeline.js";

export type TaskStatus = "pending" | "running" | "completed" | "failed";
export type TaskType = RequestCategory;

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  input_hash: string;
  output_summary?: string | undefined;
  depends_on: string[];
}

export const TaskStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);
export const TaskTypeSchema = RequestCategorySchema;

export const TaskSchema = z.object({
  id: z.string().min(1),
  type: TaskTypeSchema,
  status: TaskStatusSchema,
  input_hash: z.string(),
  output_summary: z.string().optional(),
  depends_on: z.array(z.string()).default([]),
});

export interface Checkpoint {
  id: string;
  title: string;
  task_id: string;
  summary: string;
  changed_files: string[];
  next_action: string;
  created_at: string;
}

export const CheckpointSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  task_id: z.string(),
  summary: z.string(),
  changed_files: z.array(z.string()),
  next_action: z.string(),
  created_at: z.string().datetime(),
});

export interface SessionState {
  session_id: string;
  version: string;
  goal: string;
  current_task: string | null;
  completed_tasks: string[];
  key_decisions: string[];
  active_files: string[];
  tasks: Task[];
  summaries: {
    rolling: string;
    latest_checkpoint: string | null;
  };
  artifacts: {
    task_results: Record<string, unknown>;
    errors: string[];
  };
  metadata: Record<string, unknown>;
  updated_at: string;
}

export const SessionStateSchema = z.object({
  session_id: z.string().min(1),
  version: z.string(),
  goal: z.string(),
  current_task: z.string().nullable(),
  completed_tasks: z.array(z.string()),
  key_decisions: z.array(z.string()),
  active_files: z.array(z.string()),
  tasks: z.array(TaskSchema),
  summaries: z.object({
    rolling: z.string(),
    latest_checkpoint: z.string().nullable(),
  }),
  artifacts: z.object({
    task_results: z.record(z.string(), z.unknown()),
    errors: z.array(z.string()),
  }),
  metadata: z.record(z.string(), z.unknown()).default({}),
  updated_at: z.string().datetime(),
});
