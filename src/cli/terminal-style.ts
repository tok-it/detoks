const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
} as const;

export interface TerminalStyleOptions {
  isTTY: boolean;
  env: NodeJS.ProcessEnv;
}

export const shouldUseTerminalColor = ({ isTTY, env }: TerminalStyleOptions): boolean => {
  if (!isTTY) {
    return false;
  }

  if (env.NO_COLOR !== undefined || env.FORCE_COLOR === "0") {
    return false;
  }

  if (env.FORCE_COLOR && env.FORCE_COLOR !== "0") {
    return true;
  }

  if (env.CI) {
    return false;
  }

  return true;
};

const wrap = (enabled: boolean, text: string, ...codes: string[]): string =>
  enabled && codes.length > 0 ? `${codes.join("")}${text}${ANSI.reset}` : text;

export const createTerminalStyle = (options: TerminalStyleOptions) => {
  const enabled = shouldUseTerminalColor(options);

  return {
    enabled,
    emphasis: (text: string) => wrap(enabled, text, ANSI.bold),
    muted: (text: string) => wrap(enabled, text, ANSI.dim),
    prompt: (text: string) => wrap(enabled, text, ANSI.bold, ANSI.cyan),
    title: (text: string) => wrap(enabled, text, ANSI.bold),
    selected: (text: string) => wrap(enabled, text, ANSI.bold, ANSI.cyan),
    success: (text: string) => wrap(enabled, text, ANSI.green),
    warning: (text: string) => wrap(enabled, text, ANSI.yellow),
    error: (text: string) => wrap(enabled, text, ANSI.red),
  };
};

const withIndent = (line: string, formatter: (text: string) => string): string => {
  const match = line.match(/^(\s*)(.*)$/);
  const indent = match?.[1] ?? "";
  const content = match?.[2] ?? "";
  return content ? `${indent}${formatter(content)}` : line;
};

export const formatTerminalHelp = (
  text: string,
  options: TerminalStyleOptions,
): string => {
  const style = createTerminalStyle(options);
  if (!style.enabled) {
    return text;
  }

  return text
    .split("\n")
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }

      if (index === 0 || trimmed.endsWith(":")) {
        return withIndent(line, style.title);
      }

      const optionLine = line.match(/^(\s*)(--?[^\s].*?)(\s{2,}.*)$/);
      if (optionLine) {
        return `${optionLine[1] ?? ""}${style.emphasis(optionLine[2] ?? "")}${optionLine[3] ?? ""}`;
      }

      if (trimmed.startsWith("detoks ")) {
        return withIndent(line, style.emphasis);
      }

      return line;
    })
    .join("\n");
};
