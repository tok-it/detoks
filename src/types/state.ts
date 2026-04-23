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
  inputHash: string;
  outputSummary?: string | undefined;
  dependsOn: string[];
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
  inputHash: z.string(),
  outputSummary: z.string().optional(),
  dependsOn: z.array(z.string()).default([]),
});

export interface Checkpoint {
  id: string;
  title: string;
  taskId: string;
  summary: string;
  changedFiles: string[];
  nextAction: string;
  createdAt: string;
}

export const CheckpointSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  taskId: z.string(),
  summary: z.string(),
  changedFiles: z.array(z.string()),
  nextAction: z.string(),
  createdAt: z.string().datetime(),
});

export interface SessionState {
  sessionId: string;
  version: string;
  goal: string;
  currentTask: string | null;
  completedTasks: string[];
  keyDecisions: string[];
  activeFiles: string[];
  tasks: Task[];
  summaries: {
    rolling: string;
    latestCheckpoint: string | null;
  };
  artifacts: {
    taskResults: Record<string, unknown>;
    errors: string[];
  };
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export const SessionStateSchema = z.object({
  sessionId: z.string().min(1),
  version: z.string(),
  goal: z.string(),
  currentTask: z.string().nullable(),
  completedTasks: z.array(z.string()),
  keyDecisions: z.array(z.string()),
  activeFiles: z.array(z.string()),
  tasks: z.array(TaskSchema),
  summaries: z.object({
    rolling: z.string(),
    latestCheckpoint: z.string().nullable(),
  }),
  artifacts: z.object({
    taskResults: z.record(z.string(), z.unknown()),
    errors: z.array(z.string()),
  }),
  metadata: z.record(z.string(), z.unknown()).default({}),
  updatedAt: z.string().datetime(),
});
