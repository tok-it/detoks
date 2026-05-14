import type { ModelRole } from "../../core/model-store.js";

export interface TranslationModel {
  id: string;
  displayName: string;
  description: string;
  modelName: string;
  role: ModelRole;
  hfRepo: string;
  hfFile: string;
  sizeMb: number;
  quantization: string;
}

export interface EmbeddingModel {
  id: string;
  displayName: string;
  role: ModelRole;
  hfRepo: string;
  hfFile: string;
  sizeMb: number;
}

export const TRANSLATION_MODELS: TranslationModel[] = [
  {
    id: "deepseek-r1-8b",
    displayName: "DeepSeek-R1-0528-Qwen3-8B (권장, 5.2GB)",
    description: "한국어 번역에 특화된 고품질 8B 추론 모델. 대부분의 상황에서 최고의 번역 품질을 제공합니다.",
    modelName: "unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF",
    role: "llm",
    hfRepo: "unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF",
    hfFile: "DeepSeek-R1-0528-Qwen3-8B-Q4_K_M.gguf",
    sizeMb: 5200,
    quantization: "Q4_K_M",
  },
  {
    id: "qwen35-4b",
    displayName: "Qwen3.5-4B (균형형, 2.6GB)",
    description: "번역 품질과 속도의 좋은 균형. 중간 사양 환경에 추천합니다.",
    modelName: "unsloth/Qwen3.5-4B-GGUF",
    role: "llm",
    hfRepo: "unsloth/Qwen3.5-4B-GGUF",
    hfFile: "Qwen3.5-4B-Q4_K_M.gguf",
    sizeMb: 2600,
    quantization: "Q4_K_M",
  },
  {
    id: "qwen35-2b",
    displayName: "Qwen3.5-2B (경량, 1.3GB)",
    description: "가벼운 Qwen 계열 2B 모델. 제한된 자원이나 CPU 환경에 적합합니다.",
    modelName: "Qwen3.5-2B-GGUF",
    role: "llm",
    hfRepo: "lmstudio-community/Qwen3.5-2B-GGUF",
    hfFile: "Qwen3.5-2B-Q4_K_M.gguf",
    sizeMb: 1270,
    quantization: "Q4_K_M",
  },
];

export const KURE_EMBEDDING_MODEL: EmbeddingModel = {
  id: "kure-v1",
  displayName: "KURE-v1 (한국어 임베딩, nlpai-lab)",
  role: "embedding",
  hfRepo: "nlpai-lab/KURE-v1",
  hfFile: "KURE-v1-Q4_K_M.gguf",
  sizeMb: 500,
};
