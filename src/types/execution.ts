import { z } from 'zod';

export interface ExecutionContext {
  session_id: string;
  active_task_id: string;
  shared_context: Record<string, unknown>;
  selected_context: Record<string, unknown>;
  context_summary?: string;
}

export const ExecutionContextSchema = z.object({
  session_id: z.string().min(1),
  active_task_id: z.string().min(1),
  shared_context: z.record(z.string(), z.unknown()),
  selected_context: z.record(z.string(), z.unknown()),
  context_summary: z.string().optional(),
});

export interface ExecutionRequest {
  task_id: string;
  prompt: string;
  target: 'codex' | 'gemini';
  context: ExecutionContext;
  timeout_ms?: number;
}

export const ExecutionRequestSchema = z.object({
  task_id: z.string().min(1),
  prompt: z.string().min(1),
  target: z.enum(['codex', 'gemini']),
  context: ExecutionContextSchema,
  timeout_ms: z.number().positive().optional(),
});

export interface ExecutionError {
  code: string;
  message: string;
}

export const ExecutionErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export interface ExecutionResult {
  task_id: string;
  success: boolean;
  raw_output: string;
  structured_output?: Record<string, unknown>;
  error?: ExecutionError;
}

export const ExecutionResultSchema = z.object({
  task_id: z.string().min(1),
  success: z.boolean(),
  raw_output: z.string(),
  structured_output: z.record(z.string(), z.unknown()).optional(),
  error: ExecutionErrorSchema.optional(),
});
