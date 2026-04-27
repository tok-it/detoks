import {
	complete_chat,
	type LlmCompletionResponse,
} from "../llm-client/client.js";
import { ensureLocalLlmRuntime } from "../llm-client/local-runtime.js";
import type { Role1Policies, Role1RuntimeConfig } from "../prompt/config.js";
import {
	mask_protected_segments,
	restore_placeholders,
	type PlaceholderEntry,
} from "./masking.js";
import {
	extract_translatable_spans,
	reassemble_spans,
	type TranslatableSpan,
} from "./spans.js";
import { clean_translation } from "./clean.js";
import { repair_translation } from "../guardrails/repair.js";
import {
	isHighConfidenceInferredLiteral,
	validate_translation,
} from "../guardrails/validator.js";

export interface TranslateToEnglishOptions {
	config: Role1RuntimeConfig;
	policies: Role1Policies;
	fetchImplementation?: typeof fetch;
}

export interface TranslateToEnglishResult {
	text: string;
	masked_text: string;
	placeholders: PlaceholderEntry[];
	spans: TranslatableSpan[];
	raw_responses: Record<string, unknown>[];
	inference_time_sec: number;
	fallback_span_count: number;
	span_results: TranslationSpanResult[];
	validation_errors: string[];
	repair_actions: string[];
	debug?: {
		masked_text: string;
		placeholders: PlaceholderEntry[];
		spans: TranslatableSpan[];
		fallback_span_count: number;
	};
}

export interface TranslationSpanResult {
	source_text: string;
	output_text: string;
	status: "skipped" | "translated" | "fallback_succeeded" | "failed";
	attempts: number;
	validation_errors: string[];
	repair_actions: string[];
}

const TRANSLATION_SYSTEM_PROMPT = `You are a translator that translates Korean into English.

🚨 CRITICAL RULES (MUST FOLLOW STRICTLY):
- ONLY output translated English results.
- DO NOT add any explanation, summary, commentary, or extra text.
- DO NOT omit, shorten, or partially translate the input.
- TRANSLATE EVERYTHING completely.

🚫 STRICTLY FORBIDDEN:
- descriptions, summaries, omissions, reconstructions
- commentary, preface, tailings
- labels, quotes, code blocks
- ANY content not present in the original text

📌 FORMAT PRESERVATION:
- Preserve ALL sentences, information, numbers, proper nouns, lists, line breaks, and markdown structures.
- DO NOT modify or remove markdown symbols or punctuation.

✅ REQUIREMENT:
- The output must be a FULL, COMPLETE, and FAITHFUL translation of the input text.

### Few-shot Example 1

Input:
기존 REST API의 응답 속도가 점점 느려지고 있습니다.
특히 사용자 인증 이후 대시보드 데이터를 불러오는 구간에서 병목이 발생합니다.
가장 먼저 점검해야 할 포인트를 우선순위대로 정리해 주세요.

Output:
The response speed of the existing REST API is gradually getting slower.
In particular, a bottleneck occurs in the section that loads dashboard data after user authentication.
Please organize the points that should be checked first in order of priority.


### Few-shot Example 2

Input:
## 오늘의 목표
- 번역 모델 확정
- 프롬프트 압축 로직 구체화

## 실제 수행한 일
- 번역 정확도 향상을 위해 placeholder 기반 보호 로직을 적용했다.
- 검증 실패 시 fallback 레이어를 추가했다.

Output:
## Today's Goals
- Finalize the translation model
- Specify the prompt compression logic

## Work Actually Performed
- Applied placeholder-based protection logic to improve translation accuracy.
- Added a fallback layer when validation fails.


### Few-shot Example 3
Input:
기존 PostgreSQL 기반 인증 시스템을 MongoDB 중심 구조로 점진적으로 마이그레이션하려고 합니다.

다음 작업을 모두 수행해 주세요.

1. 현재 시스템에서 가장 먼저 점검해야 할 데이터 무결성 리스크를 정리해 주세요.
2. 무중단 배포를 전제로 한 단계별 마이그레이션 로드맵을 작성해 주세요.
3. 사용자 세션, JWT, OAuth 2.0 연동 과정에서 발생할 수 있는 주요 장애 포인트를 설명해 주세요.
4. 각 단계별로 필요한 테스트 전략(단위 테스트, 통합 테스트, 회귀 테스트)을 구분해서 제안해 주세요.
5. 최종적으로 운영 비용, 유지보수성, 확장성 측면에서 MongoDB 전환이 실제로 유리한지 평가해 주세요.

Output:
We are planning to gradually migrate the existing PostgreSQL-based authentication system to a MongoDB-centered structure.

Please perform all of the following tasks.

1. Summarize the data integrity risks that should be checked first in the current system.
2. Create a step-by-step migration roadmap based on zero-downtime deployment.
3. Explain the major failure points that may occur during user session, JWT, and OAuth 2.0 integration.
4. Propose the necessary testing strategies for each phase, separating unit tests, integration tests, and regression tests.
5. Finally, evaluate whether switching to MongoDB is actually beneficial in terms of operating costs, maintainability, and scalability.`;

const TRANSLATION_USER_PROMPT_PREFIX =
	"Translate the following text data into English.\n\n";

type TranslationPassPromptType = "primary" | "fallback" | "final_retry";

function containsKorean(text: string): boolean {
	return /[가-힣]/.test(text);
}

function collectRequiredTerms(
	sourceText: string,
	preferredTranslations: Role1Policies["preferredTranslations"],
): string[] {
	return Object.keys(preferredTranslations)
		.filter((term) => sourceText.includes(term))
		.map((term) => preferredTranslations[term]!)
		.filter(Boolean);
}

function shouldRetryWholeItem(
	sourceText: string,
	validationErrors: readonly string[],
): boolean {
	if (!containsKorean(sourceText) || validationErrors.length === 0) {
		return false;
	}

	return validationErrors.some(
		(error) =>
			error.startsWith("required_literal_missing:") ||
			error.startsWith("required_term_missing:") ||
			error === "korean_text_remaining" ||
			error === "source_korean_copied",
	);
}

function isBetterValidationResult(
	currentErrors: readonly string[],
	nextErrors: readonly string[],
): boolean {
	return nextErrors.length < currentErrors.length;
}

function estimateTranslationMaxTokens(
	text: string,
	config: Role1RuntimeConfig,
): number {
	const configuredMax = config.localLlmMaxTokens ?? 512;
	return Math.min(configuredMax, Math.max(128, Math.ceil(text.length * 1.5)));
}

async function translate_span(
	span: TranslatableSpan,
	options: TranslateToEnglishOptions,
	promptType: TranslationPassPromptType = "primary",
	fallbackContext?: {
		previous_output: string;
		validation_errors: string[];
	},
): Promise<LlmCompletionResponse | null> {
	if (!span.translate || !containsKorean(span.text)) {
		return null;
	}

	return complete_chat(
		{
			messages: [
				{
					role: "system",
					content:
						promptType === "fallback" || promptType === "final_retry"
							? `${TRANSLATION_SYSTEM_PROMPT}

Return only the corrected English translation.

STRICTLY preserve:
- placeholder count and order
- technical literals
- API/class/function names
- framework names
- acronyms
- parenthetical explanations

If placeholders or technical literals were malformed, restore them exactly as in the source.

Never paraphrase technical expressions into natural language.

The previous attempt failed validation for:
${fallbackContext?.validation_errors.join(", ") ?? "unknown_error"}

Previous invalid output:
${fallbackContext?.previous_output ?? ""}

Pay special attention to:
- missing technical literals
- untranslated Korean text
- dropped acronyms
- omitted parenthetical meanings
- rewritten framework/class names`
							: TRANSLATION_SYSTEM_PROMPT,
				},
				{
					role: "user",
					content: `${TRANSLATION_USER_PROMPT_PREFIX}${span.text}`,
				},
			],
			temperature: options.config.temperature,
			max_tokens: estimateTranslationMaxTokens(span.text, options.config),
			timeout_ms: options.config.requestTimeout,
		},
		{
			...(options.config.localLlmApiBase
				? { apiBase: options.config.localLlmApiBase }
				: {}),
			...(options.config.localLlmApiKey
				? { apiKey: options.config.localLlmApiKey }
				: {}),
			...(options.config.localLlmModelName
				? { localLlmModelName: options.config.localLlmModelName }
				: {}),
			...(options.fetchImplementation
				? { fetchImplementation: options.fetchImplementation }
				: {}),
		},
	);
}

async function runTranslationPass(
	source_text: string,
	options: TranslateToEnglishOptions,
	initialPromptType: Exclude<TranslationPassPromptType, "fallback"> = "primary",
	finalRetryContext?: {
		previous_output: string;
		validation_errors: string[];
	},
): Promise<TranslateToEnglishResult> {
	const masked = mask_protected_segments(source_text, {
		protected_terms: options.policies.protectedTerms,
		preferred_translations: options.policies.preferredTranslations,
		model_names: options.config.localLlmModelName
			? [options.config.localLlmModelName]
			: [],
	});
	const spans = extract_translatable_spans(
		masked.masked_text,
		masked.placeholders,
	);
	const translatedSpans: TranslatableSpan[] = [];
	const rawResponses: Record<string, unknown>[] = [];
	let inferenceTimeSec = 0;
	let fallbackSpanCount = 0;
	const spanResults: TranslationSpanResult[] = [];

	for (const span of spans) {
		const llmResponse = await translate_span(
			span,
			options,
			initialPromptType,
			finalRetryContext,
		);
		if (!llmResponse) {
			translatedSpans.push(span);
			spanResults.push({
				source_text: span.text,
				output_text: span.text,
				status: "skipped",
				attempts: 0,
				validation_errors: [],
				repair_actions: [],
			});
			continue;
		}

		const cleaned = clean_translation(span.text, llmResponse.content);
		if (llmResponse.raw_response) {
			rawResponses.push(llmResponse.raw_response);
		}
		inferenceTimeSec += llmResponse.inference_time_sec ?? 0;

		const placeholderTokens = masked.placeholders
			.filter((entry) => span.text.includes(entry.placeholder))
			.map((entry) => entry.placeholder);
		const requiredTerms = collectRequiredTerms(
			span.text,
			options.policies.preferredTranslations,
		);
		const initialValidation = validate_translation({
			source_text: span.text,
			compressed_prompt: cleaned,
			placeholders: placeholderTokens,
			protected_terms: options.policies.protectedTerms,
			required_terms: requiredTerms,
			model_names: options.config.localLlmModelName
				? [options.config.localLlmModelName]
				: [],
			forbidden_patterns: options.policies.forbiddenPatterns,
		});
		const repaired = repair_translation({
			source_text: span.text,
			compressed_prompt: initialValidation.output,
			placeholders: placeholderTokens,
			protected_terms: options.policies.protectedTerms,
			required_terms: requiredTerms,
			forbidden_patterns: options.policies.forbiddenPatterns,
		});
		const repairedValidation = validate_translation({
			source_text: span.text,
			compressed_prompt: repaired.output,
			placeholders: placeholderTokens,
			protected_terms: options.policies.protectedTerms,
			required_terms: requiredTerms,
			model_names: options.config.localLlmModelName
				? [options.config.localLlmModelName]
				: [],
			forbidden_patterns: options.policies.forbiddenPatterns,
		});

		let finalText = repaired.output;
		let status: TranslationSpanResult["status"] = "translated";
		let attempts = 1;
		let validationErrors = repairedValidation.validation_errors;
		const repairActions = repaired.repair_actions;

		if (
			validationErrors.length > 0 &&
			attempts < options.config.translationMaxAttempts
		) {
			const fallbackResponse = await translate_span(span, options, "fallback", {
				previous_output: repaired.output,
				validation_errors: validationErrors,
			});
			attempts += 1;

			if (fallbackResponse) {
				fallbackSpanCount += 1;
				const fallbackCleaned = clean_translation(
					span.text,
					fallbackResponse.content,
				);
				if (fallbackResponse.raw_response) {
					rawResponses.push(fallbackResponse.raw_response);
				}
				inferenceTimeSec += fallbackResponse.inference_time_sec ?? 0;

				const fallbackRepaired = repair_translation({
					source_text: span.text,
					compressed_prompt: fallbackCleaned,
					placeholders: placeholderTokens,
					protected_terms: options.policies.protectedTerms,
					required_terms: requiredTerms,
					forbidden_patterns: options.policies.forbiddenPatterns,
				});
				const fallbackRepairedValidation = validate_translation({
					source_text: span.text,
					compressed_prompt: fallbackRepaired.output,
					placeholders: placeholderTokens,
					protected_terms: options.policies.protectedTerms,
					required_terms: requiredTerms,
					model_names: options.config.localLlmModelName
						? [options.config.localLlmModelName]
						: [],
					forbidden_patterns: options.policies.forbiddenPatterns,
				});
				repairActions.push(...fallbackRepaired.repair_actions);

				if (fallbackRepairedValidation.validation_errors.length === 0) {
					finalText = fallbackRepaired.output;
					validationErrors = [];
					status = "fallback_succeeded";
				} else {
					status = "failed";
					validationErrors = fallbackRepairedValidation.validation_errors;
					finalText = fallbackRepaired.output;
				}
			} else {
				status = "failed";
			}
		} else if (validationErrors.length > 0) {
			status = "failed";
		}

		translatedSpans.push({
			...span,
			text: finalText,
		});
		spanResults.push({
			source_text: span.text,
			output_text: finalText,
			status,
			attempts,
			validation_errors: validationErrors,
			repair_actions: repairActions,
		});
	}

	const restoredText = restore_placeholders(
		reassemble_spans(translatedSpans),
		masked.placeholders,
	);
	const finalValidation = validate_translation({
		source_text,
		compressed_prompt: restoredText,
		protected_terms: options.policies.protectedTerms,
		required_terms: collectRequiredTerms(
			source_text,
			options.policies.preferredTranslations,
		),
		required_literals: masked.placeholders
			.map((entry) => entry.original)
			.filter(isHighConfidenceInferredLiteral),
		model_names: options.config.localLlmModelName
			? [options.config.localLlmModelName]
			: [],
		forbidden_patterns: options.policies.forbiddenPatterns,
	});
	const finalValidationErrors = finalValidation.validation_errors;
	const finalRepairActions = [
		...new Set(spanResults.flatMap((result) => result.repair_actions)),
	];

	return {
		text: restoredText,
		masked_text: masked.masked_text,
		placeholders: masked.placeholders,
		spans: translatedSpans,
		raw_responses: rawResponses,
		inference_time_sec: inferenceTimeSec,
		fallback_span_count: fallbackSpanCount,
		span_results: spanResults,
		validation_errors: finalValidationErrors,
		repair_actions: finalRepairActions,
		...(options.config.pipelineMode === "debug"
			? {
					debug: {
						masked_text: masked.masked_text,
						placeholders: masked.placeholders,
						spans: translatedSpans,
						fallback_span_count: fallbackSpanCount,
					},
				}
			: {}),
	};
}

export async function translate_to_english(
	source_text: string,
	options: TranslateToEnglishOptions,
): Promise<TranslateToEnglishResult> {
	if (!options.fetchImplementation) {
		await ensureLocalLlmRuntime(options.config);
	}

	const initialPass = await runTranslationPass(source_text, options);

	if (!shouldRetryWholeItem(source_text, initialPass.validation_errors)) {
		return initialPass;
	}

	const retriedPass = await runTranslationPass(
		source_text,
		options,
		"final_retry",
		{
			previous_output: initialPass.text,
			validation_errors: initialPass.validation_errors,
		},
	);

	const preferredPass = isBetterValidationResult(
		initialPass.validation_errors,
		retriedPass.validation_errors,
	)
		? retriedPass
		: initialPass;

	return {
		...preferredPass,
		raw_responses: [...initialPass.raw_responses, ...retriedPass.raw_responses],
		inference_time_sec:
			initialPass.inference_time_sec + retriedPass.inference_time_sec,
		fallback_span_count:
			initialPass.fallback_span_count + retriedPass.fallback_span_count,
		repair_actions: [
			...new Set([
				...initialPass.repair_actions,
				...retriedPass.repair_actions,
			]),
		],
	};
}
