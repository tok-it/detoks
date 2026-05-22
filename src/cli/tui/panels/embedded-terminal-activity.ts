export type EmbeddedActivityKind = "file" | "read" | "edit" | "search" | "tool" | "test" | "git" | "command";

export interface EmbeddedActivitySnapshot {
  kind: EmbeddedActivityKind;
  label: string;
  detail: string;
  status: "running" | "completed" | "failed";
}

const extractShellPayload = (commandLine: string): string => {
  const trimmed = commandLine.trim();
  const shellMatch = trimmed.match(/\s-lc\s+(?:"((?:\\.|[^"\\])*)"|'([^']*)'|(\S.*?))(?:\s+in\s+\/.*)?$/);
  if (shellMatch) {
    return (shellMatch[1] ?? shellMatch[2] ?? shellMatch[3] ?? trimmed)
      .replace(/\\"/g, "\"")
      .replace(/\\'/g, "'")
      .trim();
  }

  return trimmed.replace(/\s+in\s+\/.*$/, "").trim();
};

export const extractCommandName = (commandLine: string): string => {
  const target = extractShellPayload(commandLine);
  const firstToken = target.split(/\s+/)[0] ?? target;
  const basename = firstToken.split("/").pop() ?? firstToken;
  return basename.length > 0 ? basename : "command";
};

const extractPathCandidate = (commandLine: string): string | null => {
  const payload = extractShellPayload(commandLine);
  const pathMatches = payload.match(/(?:~\/|\/|\.\.?\/)[^\s"'`]+/g);
  const likelyPath = [...payload.split(/\s+/).filter(Boolean)].reverse().find((token) =>
    /[./]/.test(token) && /\.(?:[cm]?[jt]sx?|json|md|yml|yaml|toml|lock|txt|css|html|py|rs|go|java|swift)$/i.test(token),
  );
  if (pathMatches !== null && pathMatches.length > 0) {
    const lastPathMatch = (pathMatches[pathMatches.length - 1] ?? "").replace(/[;:,]+$/, "");
    if (likelyPath !== undefined && likelyPath.length > lastPathMatch.length) {
      return likelyPath;
    }
    return lastPathMatch.length > 0 ? lastPathMatch : likelyPath ?? null;
  }

  return likelyPath?.replace(/[;:,]+$/, "") ?? null;
};

const extractSearchQuery = (commandLine: string): string | null => {
  const payload = extractShellPayload(commandLine);
  const quoted = payload.match(/\b(?:rg|grep)\b(?:\s+-\S+)*\s+(?:"([^"]+)"|'([^']+)')/i);
  if (quoted) {
    return quoted[1] ?? quoted[2] ?? null;
  }

  const tokens = payload.split(/\s+/).filter(Boolean);
  const commandIndex = tokens.findIndex((token) => /^(rg|grep)$/i.test(token.split("/").pop() ?? token));
  if (commandIndex >= 0) {
    return tokens.slice(commandIndex + 1).find((token) => !token.startsWith("-"))?.replace(/[;:,]+$/, "") ?? null;
  }

  return null;
};

export const describeCommandActivity = (commandLine: string): Omit<EmbeddedActivitySnapshot, "status"> => {
  const payload = extractShellPayload(commandLine);
  const commandName = extractCommandName(commandLine);
  const path = extractPathCandidate(commandLine);

  if (/\b(sed|cat|less|head|tail)\b/i.test(payload) && path !== null) {
    return { kind: "file", label: "파일 읽기", detail: path };
  }

  if (/\b(rg|grep|find)\b/i.test(payload)) {
    const query = extractSearchQuery(commandLine);
    return { kind: "search", label: "검색", detail: query ?? payload };
  }

  if (/\b(git)\b/i.test(payload)) {
    return { kind: "git", label: "Git", detail: payload };
  }

  if (/\b(npm|npx|pnpm|yarn|node)\b/i.test(payload) && /\b(test|vitest|tsc|build)\b/i.test(payload)) {
    return { kind: "test", label: "검증", detail: payload };
  }

  return { kind: "command", label: "명령 실행", detail: commandName };
};

export const statusFromCommandStatusLine = (statusLine: string | null): EmbeddedActivitySnapshot["status"] => {
  if (statusLine === null) {
    return "running";
  }

  if (/^succeeded in/i.test(statusLine)) {
    return "completed";
  }

  return "failed";
};
