import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Role1RuntimeConfig } from "../prompt/config.js";

export function resolveConfiguredRole1ModelPath(
	config: Pick<
		Role1RuntimeConfig,
		"localLlmModelPath" | "localLlmModelDir" | "localLlmHfFile"
	>,
): string | undefined {
	if (config.localLlmModelPath) {
		return config.localLlmModelPath;
	}

	if (config.localLlmModelDir && config.localLlmHfFile) {
		return join(config.localLlmModelDir, config.localLlmHfFile);
	}

	return undefined;
}

export function assertValidGgufModelFile(modelPath: string): void {
	if (!existsSync(modelPath)) {
		throw new Error(
			`GGUF 모델 파일을 찾을 수 없습니다: ${modelPath}. .env의 LOCAL_LLM_MODEL_PATH 또는 LOCAL_LLM_MODEL_DIR / LOCAL_LLM_HF_FILE이 올바른지 확인하세요.`,
		);
	}

	const stats = statSync(modelPath);
	if (!stats.isFile()) {
		throw new Error(
			`로컬 GGUF 모델 파일이 유효하지 않습니다: ${modelPath} (일반 파일이 아닙니다). detoks는 이 파일을 자동 삭제/재다운로드하지 않습니다. .env의 LOCAL_LLM_MODEL_PATH / LOCAL_LLM_HF_FILE을 올바른 GGUF 파일로 맞추거나 파일을 수동으로 교체하세요.`,
		);
	}

	if (stats.size === 0) {
		throw new Error(
			`로컬 GGUF 모델 파일이 비어 있습니다: ${modelPath} (0바이트). detoks는 이 파일을 자동 삭제/재다운로드하지 않습니다. .env의 LOCAL_LLM_MODEL_PATH / LOCAL_LLM_HF_FILE을 올바른 GGUF 파일로 맞추거나 파일을 수동으로 교체하세요.`,
		);
	}

	if (stats.size < 4) {
		throw new Error(
			`로컬 GGUF 모델 파일이 너무 작습니다: ${modelPath} (${stats.size}바이트). detoks는 이 파일을 자동 삭제/재다운로드하지 않습니다. .env의 LOCAL_LLM_MODEL_PATH / LOCAL_LLM_HF_FILE을 올바른 GGUF 파일로 맞추거나 파일을 수동으로 교체하세요.`,
		);
	}

	const fd = openSync(modelPath, "r");
	try {
		const header = Buffer.alloc(4);
		const bytesRead = readSync(fd, header, 0, 4, 0);
		if (bytesRead < 4 || header.toString("utf8", 0, 4) !== "GGUF") {
			throw new Error(
				`로컬 GGUF 모델 파일 헤더가 올바르지 않습니다: ${modelPath}. detoks는 이 파일을 자동 삭제/재다운로드하지 않습니다. .env의 LOCAL_LLM_MODEL_PATH / LOCAL_LLM_HF_FILE을 올바른 GGUF 파일로 맞추거나 파일을 수동으로 교체하세요.`,
			);
		}
	} finally {
		closeSync(fd);
	}
}
