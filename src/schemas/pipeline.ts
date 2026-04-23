import { z } from "zod";

/**
 * Shared pipeline schemas for detoks.
 *
 * Document mapping:
 * - docs/SCHEMAS.md
 * - docs/SHARED_DATA_FLOW.md
 * - docs/API_SPEC.md
 *
 * Role to schema ownership:
 * - Role 1 (AI Prompt Engineer):
 *   UserRequestSchema, CompiledPromptSchema, AnalyzedRequestSchema
 * - Role 2.1 (Task Graph Engineer):
 *   TaskSchema, TaskGraphSchema
 * - Role 2.2 (State & Context Engineer):
 *   ExecutionContextSchema, SessionStateSchema
 * - Role 3 (CLI / System Engineer):
 *   ExecutionResultSchema
 */

export const UserRequestSchema = z.object({
  raw_input: z.string().min(1),
  session_id: z.string().optional(),
  cwd: z.string().optional(),
  timestamp: z.string().optional(),
});

export const CompiledPromptSchema = z.object({
  raw_input: z.string(),
  normalized_input: z.string(),
  compressed_prompt: z.string(),
  language: z.enum(["ko", "en", "mixed"]),
  preserved_constraints: z.array(z.string()).default([]),
});

export const TaskSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  depends_on: z.array(z.string()).default([]),
  priority: z.number().int().optional(),
  owner_role: z.enum(["role1", "role2.1", "role2.2", "role3"]).optional(),
});

export const AnalyzedRequestSchema = z.object({
  category: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  tasks: z.array(TaskSchema).default([]),
});

export const TaskGraphSchema = z.object({
  tasks: z.array(TaskSchema),
});

export const ExecutionContextSchema = z.object({
  session_id: z.string(),
  active_task_id: z.string(),
  shared_context: z.record(z.string(), z.unknown()).default({}),
  selected_context: z.record(z.string(), z.unknown()).default({}),
  context_summary: z.string().optional(),
});

export const ExecutionResultSchema = z.object({
  task_id: z.string(),
  success: z.boolean(),
  raw_output: z.string(),
  structured_output: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  next_action: z.string().optional(),
});

export const SessionStateSchema = z.object({
  shared_context: z.record(z.string(), z.unknown()).default({}),
  task_results: z.record(z.string(), z.unknown()).default({}),
  current_task_id: z.string().optional(),
  completed_task_ids: z.array(z.string()).default([]),
  last_summary: z.string().optional(),
  next_action: z.string().optional(),
});

export type UserRequest = z.infer<typeof UserRequestSchema>;
export type CompiledPrompt = z.infer<typeof CompiledPromptSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type AnalyzedRequest = z.infer<typeof AnalyzedRequestSchema>;
export type TaskGraph = z.infer<typeof TaskGraphSchema>;
export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
export type SessionState = z.infer<typeof SessionStateSchema>;
