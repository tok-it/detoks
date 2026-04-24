import { z } from "zod";

/**
 * detoks의 공용 파이프라인 스키마입니다.
 *
 * 문서 매핑:
 * - docs/SCHEMAS.md
 * - docs/SHARED_DATA_FLOW.md
 * - docs/API_SPEC.md
 *
 * 역할별 스키마 소유 범위:
 * - Role 1 (AI Prompt Engineer):
 *   UserRequestSchema, CompiledPromptSchema, Role2PromptInputSchema
 * - Role 2.1 (Task Graph Engineer):
 *   AnalyzedRequestSchema, TaskSchema, TaskGraphSchema
 * - Role 2.2 (State & Context Engineer):
 *   ExecutionContextSchema, SessionStateSchema
 * - Role 3 (CLI / System Engineer):
 *   ExecutionResultSchema
 *
 * 최상위 요청 / 작업 분류:
 * - explore: 파일, 구조, 참조, 문맥을 탐색하는 작업
 * - create: 새 파일, 기능, 스키마, 초안을 만드는 작업
 * - modify: 기존 산출물을 수정하거나 리팩터링하는 작업
 * - analyze: 원인, 구조, 트레이드오프, 동작을 분석하는 작업
 * - validate: 테스트, 타입체크, 검증, 리뷰를 수행하는 작업
 * - execute: 명령, 워크플로우, 도구 기반 동작을 실행하는 작업
 * - document: 설명, 요약, 문서화로 정리하는 작업
 * - plan: 작업을 분해하고 순서를 오케스트레이션하는 작업
 */

// Canonical semantic definitions live in docs/TYPE_DEFINITION.md.
// Keep enum meanings and dependency logic aligned with that document.
export const RequestCategoryValues = [
  "explore",
  "create",
  "modify",
  "analyze",
  "validate",
  "execute",
  "document",
  "plan",
] as const;

/**
 * 요청 분석과 작업 분해에서 공통으로 사용하는 최상위 의도 분류입니다.
 *
 * 한글 대응:
 * - explore  -> 탐색
 * - create   -> 생성
 * - modify   -> 수정
 * - analyze  -> 분석
 * - validate -> 검증
 * - execute  -> 실행
 * - document -> 정리/문서화
 * - plan     -> 계획/오케스트레이션
 */
// Shared top-level task categories used by request analysis and task graph building.
export const RequestCategorySchema = z.enum(RequestCategoryValues);

export const UserRequestSchema = z.object({
  raw_input: z.string().min(1),
  session_id: z.string().optional(),
  cwd: z.string().optional(),
  timestamp: z.string().optional(),
});

export const PromptCompressionProviderValues = [
  "nlp_adapter",
  "llm",
  "small_model",
] as const;

export const PromptCompressionProviderSchema = z.enum(
  PromptCompressionProviderValues,
);

const PromptCompileDebugSchema = z.object({
  masked_text: z.string(),
  placeholders: z.array(
    z.object({
      placeholder: z.string(),
      original: z.string(),
      kind: z.string(),
    }),
  ),
  spans: z.array(
    z.object({
      kind: z.string(),
      text: z.string(),
      translate: z.boolean(),
    }),
  ),
  fallback_span_count: z.number().int().min(0),
});

export const CompiledPromptSchema = z.object({
  raw_input: z.string(),
  normalized_input: z.string(),
  compressed_prompt: z.string(),
  language: z.enum(["ko", "en", "mixed"]),
  compression_provider: z.literal("nlp_adapter"),
  inference_time_sec: z.number().min(0).optional(),
  validation_errors: z.array(z.string()).optional(),
  repair_actions: z.array(z.string()).optional(),
  debug: PromptCompileDebugSchema.optional(),
});

export const Role2PromptInputSchema = z.object({
  compiled_prompt: z.string().min(1),
});

export const PromptCompileRequestSchema = z.object({
  raw_input: z.string().min(1),
  shared_context: z.record(z.string(), z.unknown()).optional(),
  compression_provider: PromptCompressionProviderSchema.optional(),
  max_translation_attempts: z.number().int().positive().optional(),
});

export const PromptCompileResponseSchema = z.object({
  raw_input: z.string(),
  normalized_input: z.string(),
  compressed_prompt: z.string(),
  language: z.enum(["ko", "en", "mixed"]),
  compression_provider: z.literal("nlp_adapter"),
  inference_time_sec: z.number().min(0).optional(),
  validation_errors: z.array(z.string()).optional(),
  repair_actions: z.array(z.string()).optional(),
  debug: PromptCompileDebugSchema.optional(),
});

export const BatchRunMetadataSchema = z.object({
  generated_at: z.string().datetime(),
  pipeline_mode: z.enum(["safe", "debug"]),
  input_count: z.number().int().nonnegative(),
});

export const BatchPipelineItemResultSchema = z.object({
  index: z.number().int().nonnegative(),
  raw_input: z.string(),
  normalized_input: z.string().optional(),
  compiled_prompt: z.string().optional(),
  role2_handoff: z.string().optional(),
  language: z.enum(["ko", "en", "mixed"]).optional(),
  inference_time_sec: z.number().min(0).optional(),
  status: z.enum(["completed", "failed"]),
  validation_errors: z.array(z.string()).default([]),
  repair_actions: z.array(z.string()).default([]),
  error: z.string().optional(),
  debug: PromptCompileDebugSchema.optional(),
});

export const BatchPipelineResultSchema = z.object({
  run_metadata: BatchRunMetadataSchema,
  results: z.array(BatchPipelineItemResultSchema),
});

export const TaskStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);

export const TaskSchema = z.object({
  id: z.string().min(1),
  type: RequestCategorySchema,
  status: TaskStatusSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  input_hash: z.string(),
  output_summary: z.string().optional(),
  depends_on: z.array(z.string()).default([]),
  priority: z.number().int().optional(),
  owner_role: z.enum(["role1", "role2.1", "role2.2", "role3"]).optional(),
});

export const AnalyzedRequestSchema = z.object({
  category: RequestCategorySchema,
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
  summary: z.string().optional(),
  structured_output: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  next_action: z.string().optional(),
});

export const CheckpointSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  task_id: z.string(),
  summary: z.string(),
  changed_files: z.array(z.string()),
  next_action: z.string(),
  created_at: z.string().datetime(),
});

export const SessionStateSchema = z.object({
  shared_context: z.record(z.string(), z.unknown()).default({}),
  task_results: z.record(z.string(), z.unknown()).default({}),
  current_task_id: z.string().optional().nullable(),
  completed_task_ids: z.array(z.string()).default([]),
  last_summary: z.string().optional(),
  next_action: z.string().optional(),
  updated_at: z.string().datetime().optional(),
});

// Legacy internal helper for Role 2.1 sentence splitting.
// 공식 Role 1 → Role 2.1 handoff는 Role2PromptInputSchema를 사용한다.
export const CompiledSentencesSchema = z.object({
  sentences: z.array(z.string().min(1)),
});

export type CompiledSentences = z.infer<typeof CompiledSentencesSchema>;

export type UserRequest = z.infer<typeof UserRequestSchema>;
export type RequestCategory = z.infer<typeof RequestCategorySchema>;
export type PromptCompressionProvider = z.infer<
  typeof PromptCompressionProviderSchema
>;
export type CompiledPrompt = z.infer<typeof CompiledPromptSchema>;
export type Role2PromptInput = z.infer<typeof Role2PromptInputSchema>;
export type PromptCompileRequest = z.infer<typeof PromptCompileRequestSchema>;
export type PromptCompileResponse = z.infer<typeof PromptCompileResponseSchema>;
export type BatchRunMetadata = z.infer<typeof BatchRunMetadataSchema>;
export type BatchPipelineItemResult = z.infer<
  typeof BatchPipelineItemResultSchema
>;
export type BatchPipelineResult = z.infer<typeof BatchPipelineResultSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type AnalyzedRequest = z.infer<typeof AnalyzedRequestSchema>;
export type TaskGraph = z.infer<typeof TaskGraphSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
export type SessionState = z.infer<typeof SessionStateSchema>;
