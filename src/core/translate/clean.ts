export function clean_translation(
  source_text: string,
  translated_text: string,
): string {
  let cleaned = translated_text.trim();

  const codeFenceMatch = cleaned.match(/^```[A-Za-z0-9_-]*\n([\s\S]*?)\n```$/);
  if (codeFenceMatch) {
    cleaned = codeFenceMatch[1]!.trim();
  }

  cleaned = cleaned.replace(
    /^(?:translation|translated text|english translation|english)\s*:\s*/i,
    "",
  );

  if (
    !/^["'].*["']$/s.test(source_text.trim()) &&
    ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'")))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  if (!/^\s*\d+[.)]\s+/.test(source_text)) {
    cleaned = cleaned.replace(/^\s*\d+[.)]\s+/, "");
  }

  return cleaned.trim();
}
