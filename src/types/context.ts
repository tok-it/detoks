import { z } from 'zod';

export interface SharedContext {
  project_info: string;
  conventions: string[];
  active_rules: string[];
  key_decisions: string[];
}

export const SharedContextSchema = z.object({
  project_info: z.string(),
  conventions: z.array(z.string()),
  active_rules: z.array(z.string()),
  key_decisions: z.array(z.string()),
});

export interface TaskContext {
  current_task_id: string;
  relevant_state: string;
  history: string[];
  dependencies: Record<string, unknown>;
}

export const TaskContextSchema = z.object({
  current_task_id: z.string(),
  relevant_state: z.string(),
  history: z.array(z.string()),
  dependencies: z.record(z.string(), z.unknown()),
});

export interface OptimizedContext {
  shared: SharedContext;
  task: TaskContext;
  token_usage_estimate: number;
}

export const OptimizedContextSchema = z.object({
  shared: SharedContextSchema,
  task: TaskContextSchema,
  token_usage_estimate: z.number().positive(),
});

export interface CompressedState {
  shared_context: SharedContext;
  task_context: TaskContext;
  task_results: Record<string, unknown>;
  token_estimate: number;
}

export const CompressedStateSchema = z.object({
  shared_context: SharedContextSchema,
  task_context: TaskContextSchema,
  task_results: z.record(z.string(), z.unknown()),
  token_estimate: z.number().positive(),
});
