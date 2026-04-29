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

const TRANSLATION_SYSTEM_PROMPT = [
	"You are Role 1 of detoks: a Korean-to-English technical translator.",
	"",
	"Your job is to convert Korean user input into clear, faithful English for downstream execution.",
	"Do not analyze, plan, summarize, or compress beyond translation fidelity.",
	"",
	"CRITICAL RULES:",
	"- Output English only.",
	"- Return only the translated text.",
	"- Do not add explanations, commentary, prefaces, labels, quotes, or code fences.",
	"- Do not omit, shorten, simplify, or partially translate the input.",
	"",
	"PRESERVATION:",
	"- Preserve all technical literals exactly as written, including file names, paths, commands, flags, placeholders, JSON keys, API names, class names, function names, model names, version numbers, and error messages.",
	"- Do not modify or remove Markdown symbols.",
].join("\n");

const FALLBACK_CORRECTION_PROMPT = [
	"## Fallback Correction Mode",
	"",
	"The previous translation failed validation.",
	"Produce a corrected English translation of the original source input.",
	"",
	"## Non-Negotiable Placeholder Rules",
	"",
	"Placeholders are protected machine tokens, not natural language.",
	"Every placeholder from the source input must appear in the output exactly as written.",
	"Do not delete, translate, split, merge, reorder, or paraphrase placeholders.",
	"Do not add new placeholders.",
].join("\n");
const TRANSLATION_USER_PROMPT_PREFIX =
	"Translate the following text data into English.\n\n";

type TranslationPassPromptType = "primary" | "fallback" | "final_retry";

function containsKorean(text: string): boolean {
	return /[가-힣]/.test(text);
}

function formatPlaceholderGuidance(placeholders: readonly string[]): string {
	if (placeholders.length === 0) {
		return "";
	}

	return `\n\nExact placeholders that must be preserved verbatim:\n${placeholders.map((placeholder) => `- ${placeholder}`).join("\n")}\n\nNever delete, translate, split, or paraphrase these tokens.`;
}

function extractPlaceholdersInOrder(text: string): string[] {
	return text.match(/__PH_\d{4}__/g) ?? [];
}

function hasExactPlaceholderIntegrity(
	sourceText: string,
	outputText: string,
): boolean {
	const sourcePlaceholders = extractPlaceholdersInOrder(sourceText);
	const outputPlaceholders = extractPlaceholdersInOrder(outputText);

	if (sourcePlaceholders.length !== outputPlaceholders.length) {
		return false;
	}

	return sourcePlaceholders.every(
		(placeholder, index) => placeholder === outputPlaceholders[index],
	);
}

function hasPlaceholderValidationError(errors: readonly string[]): boolean {
	return errors.some(
		(error) =>
			error === "placeholder_count_mismatch" ||
			error === "placeholder_order_mismatch" ||
			error.startsWith("placeholder_"),
	);
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
			error === "placeholder_count_mismatch" ||
			error === "placeholder_order_mismatch" ||
			error === "korean_text_remaining" ||
			error === "source_korean_copied",
	);
}

function isBetterValidationResult(
	currentErrors: readonly string[],
	nextErrors: readonly string[],
): boolean {
	const currentHasPlaceholderError = hasPlaceholderValidationError(
		currentErrors,
	);
	const nextHasPlaceholderError = hasPlaceholderValidationError(nextErrors);

	if (currentHasPlaceholderError !== nextHasPlaceholderError) {
		return currentHasPlaceholderError && !nextHasPlaceholderError;
	}

	return nextErrors.length < currentErrors.length;
}

function hasPlaceholderIntegrityIssue(
	spanResults: readonly TranslationSpanResult[],
): boolean {
	return spanResults.some((result) =>
		hasPlaceholderValidationError(result.validation_errors),
	);
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
	placeholderTokens: readonly string[] = [],
): Promise<LlmCompletionResponse | null> {
	if (!span.translate || !containsKorean(span.text)) {
		return null;
	}

	const placeholderGuidance = formatPlaceholderGuidance(placeholderTokens);
	const systemPromptSections = [TRANSLATION_SYSTEM_PROMPT, placeholderGuidance];

	if (promptType === "fallback" || promptType === "final_retry") {
		systemPromptSections.push(
			FALLBACK_CORRECTION_PROMPT,
			"## Validation Failure Context",
			`The previous attempt failed validation for: ${fallbackContext?.validation_errors.join(", ") ?? "unknown_error"}`,
			"Previous invalid output:",
			fallbackContext?.previous_output ?? "",
			"## Pay Special Attention To",
			"- missing placeholders",
			"- malformed placeholders",
			"- changed placeholder order",
			"- missing technical literals",
			"- untranslated Korean text",
			"- dropped acronyms",
			"- omitted parenthetical meanings",
			"- rewritten framework/class names",
			"- rewritten function names",
		);
	}

	return complete_chat(
		{
			messages: [
				{
					role: "system",
					content: systemPromptSections.filter(Boolean).join("\n\n"),
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
		const placeholderTokens = masked.placeholders
			.filter((entry) => span.text.includes(entry.placeholder))
			.map((entry) => entry.placeholder);
		const llmResponse = await translate_span(
			span,
			options,
			initialPromptType,
			finalRetryContext,
			placeholderTokens,
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
			const fallbackResponse = await translate_span(
				span,
				options,
				"fallback",
				{
					previous_output: repaired.output,
					validation_errors: validationErrors,
				},
				placeholderTokens,
			);
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

				const fallbackPlaceholderOk = hasExactPlaceholderIntegrity(
					span.text,
					fallbackRepaired.output,
				);

				if (
					fallbackRepairedValidation.validation_errors.length === 0 &&
					fallbackPlaceholderOk
				) {
					finalText = fallbackRepaired.output;
					validationErrors = [];
					status = "fallback_succeeded";
				} else {
					status = "failed";
					validationErrors = repairedValidation.validation_errors;
					finalText = repaired.output;
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

	const initialHasPlaceholderIssue = hasPlaceholderIntegrityIssue(
		initialPass.span_results,
	);
	const retriedHasPlaceholderIssue = hasPlaceholderIntegrityIssue(
		retriedPass.span_results,
	);

	const preferredPass = isBetterValidationResult(
		initialPass.validation_errors,
		retriedPass.validation_errors,
	)
		? retriedPass
		: initialPass;

	const selectedPass =
		initialHasPlaceholderIssue !== retriedHasPlaceholderIssue
			? retriedHasPlaceholderIssue
				? initialPass
				: retriedPass
			: preferredPass;

	return {
		...selectedPass,
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
