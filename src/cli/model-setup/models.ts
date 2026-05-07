export interface TranslationModel {
  id: string;
  displayName: string;
  description: string;
  modelName: string;
  hfRepo: string;
  hfFile: string;
  sizeMb: number;
}

export const TRANSLATION_MODELS: TranslationModel[] = [
  {
    id: "supergemma4",
    displayName: "SuperGemma4-E4B (권장, 4.3GB)",
    description: "한국어 번역에 특화된 고품질 모델. 대부분의 상황에서 최고의 번역 품질을 제공합니다.",
    modelName: "mradermacher/supergemma4-e4b-abliterated-GGUF",
    hfRepo: "mradermacher/supergemma4-e4b-abliterated-GGUF",
    hfFile: "supergemma4-e4b-abliterated.Q4_K_S.gguf",
    sizeMb: 4300,
  },
  {
    id: "gemma4-e2b",
    displayName: "Gemma4-E2B (균형형, 2.5GB)",
    description: "번역 품질과 속도의 좋은 균형. 중간 사양 환경에 추천합니다.",
    modelName: "mradermacher/gemma-4-E2B-it-heretic-ara-GGUF",
    hfRepo: "mradermacher/gemma-4-E2B-it-heretic-ara-GGUF",
    hfFile: "gemma-4-E2B-it-heretic-ara.Q4_K_S.gguf",
    sizeMb: 2500,
  },
  {
    id: "qwen35-2b",
    displayName: "Qwen3.5-2B (경량, 1.3GB)",
    description: "가벼운 Qwen 계열 2B 모델. 제한된 자원이나 CPU 환경에 적합합니다.",
    modelName: "Qwen3.5-2B-GGUF",
    hfRepo: "lmstudio-community/Qwen3.5-2B-GGUF",
    hfFile: "Qwen3.5-2B-Q4_K_M.gguf",
    sizeMb: 1270,
  },
];
