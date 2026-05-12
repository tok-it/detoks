const PHRASE_REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
  [/\bin order to\b/gi, "to"],
  [/\bso as to\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bat this point in time\b/gi, "now"],
  [/\bin the event that\b/gi, "if"],
  [/\bfor the purpose of\b/gi, "to"],
  [/\bwith regard to\b/gi, "regarding"],
  [/\bprior to\b/gi, "before"],
  [/\bsubsequent to\b/gi, "after"],
  [/\bat the present time\b/gi, "now"],
  [/\bin the near future\b/gi, "soon"],
  [/\ba large number of\b/gi, "many"],
  [/\ba number of\b/gi, "several"],
  [/\bin the process of\b/gi, "while"],
];

const LEADING_FILLER: readonly RegExp[] = [
  /^(?:please|kindly)\s+/i,
  /^(?:can|could|would)\s+you\s+(?:please\s+)?/i,
  /^(?:i\s+(?:want|need)\s+(?:you\s+)?to)\s+/i,
  /^(?:help\s+me\s+(?:to\s+)?)\s*/i,
];

const INLINE_FILLER: ReadonlyArray<[RegExp, string]> = [
  [/\bplease\b/gi, ""],
  [/\bkindly\b/gi, ""],
  [/\s{2,}/g, " "],
];

export interface NodeCompressorResult {
  compressed: string;
  compression_ratio: number;
  tokens_saved: number;
}

export function compressTextNode(text: string): NodeCompressorResult {
  let compressed = text;

  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
    compressed = compressed.replace(pattern, replacement);
  }

  for (const pattern of LEADING_FILLER) {
    compressed = compressed.replace(pattern, "");
  }

  for (const [pattern, replacement] of INLINE_FILLER) {
    compressed = compressed.replace(pattern, replacement);
  }

  compressed = compressed
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();

  if (!compressed) {
    return { compressed: text, compression_ratio: 1, tokens_saved: 0 };
  }

  const originalWords = text.split(/\s+/).filter(Boolean).length;
  const compressedWords = compressed.split(/\s+/).filter(Boolean).length;
  const tokensSaved = Math.max(0, originalWords - compressedWords);
  const compressionRatio = originalWords > 0 ? compressedWords / originalWords : 1;

  return { compressed, compression_ratio: compressionRatio, tokens_saved: tokensSaved };
}
