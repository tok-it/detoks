import { z } from 'zod';

export interface SharedContext {
  projectInfo: string;
  conventions: string[];
  activeRules: string[];
  keyDecisions: string[];
}

export const SharedContextSchema = z.object({
  projectInfo: z.string(),
  conventions: z.array(z.string()),
  activeRules: z.array(z.string()),
  keyDecisions: z.array(z.string()),
});

export interface TaskContext {
  currentTaskId: string;
  relevantState: string;
  history: string[];
  dependencies: Record<string, unknown>;
}

export const TaskContextSchema = z.object({
  currentTaskId: z.string(),
  relevantState: z.string(),
  history: z.array(z.string()),
  dependencies: z.record(z.string(), z.unknown()),
});

export interface OptimizedContext {
  shared: SharedContext;
  task: TaskContext;
  tokenUsageEstimate: number;
}

export const OptimizedContextSchema = z.object({
  shared: SharedContextSchema,
  task: TaskContextSchema,
  tokenUsageEstimate: z.number().positive(),
});

export interface CompressedState {
  sharedContext: SharedContext;
  taskContext: TaskContext;
  taskResults: Record<string, unknown>;
  tokenEstimate: number;
}

export const CompressedStateSchema = z.object({
  sharedContext: SharedContextSchema,
  taskContext: TaskContextSchema,
  taskResults: z.record(z.string(), z.unknown()),
  tokenEstimate: z.number().positive(),
});
