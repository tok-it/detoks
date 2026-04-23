import { z } from 'zod';

export interface UserRequest {
  raw_input: string;
  session_id?: string;
}

export const UserRequestSchema = z.object({
  raw_input: z.string().min(1),
  session_id: z.string().optional(),
});

export interface CompiledPrompt {
  raw_input: string;
  normalized_input: string;
  compressed_prompt: string;
  language: 'ko' | 'en' | 'mixed';
}

export const CompiledPromptSchema = z.object({
  raw_input: z.string(),
  normalized_input: z.string(),
  compressed_prompt: z.string(),
  language: z.enum(['ko', 'en', 'mixed']),
});

export interface AnalyzedRequest {
  category: string;
  keywords: string[];
  tasks: Array<{
    id: string;
    type: string;
  }>;
}

export const AnalyzedRequestSchema = z.object({
  category: z.string(),
  keywords: z.array(z.string()),
  tasks: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
    })
  ),
});
