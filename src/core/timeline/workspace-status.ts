export type WorkspaceChangeKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "unmerged"
  | "type_changed"
  | "changed";

export interface WorkspaceStatusEntry {
  statusCode: string;
  kind: WorkspaceChangeKind;
  path: string;
  path2?: string;
  summary: string;
}

const KIND_LABELS: Record<WorkspaceChangeKind, string> = {
  modified: "수정",
  added: "추가",
  deleted: "삭제",
  renamed: "이름변경",
  copied: "복사",
  untracked: "미추적",
  unmerged: "충돌",
  type_changed: "형식변경",
  changed: "변경",
};

const LABEL_TO_KIND: Record<string, WorkspaceChangeKind> = {
  수정: "modified",
  추가: "added",
  삭제: "deleted",
  이름변경: "renamed",
  복사: "copied",
  미추적: "untracked",
  충돌: "unmerged",
  형식변경: "type_changed",
  변경: "changed",
};

const normalizeLine = (value: string): string =>
  value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trimEnd();

const classifyStatusCode = (statusCode: string): WorkspaceChangeKind => {
  if (statusCode.startsWith("??")) {
    return "untracked";
  }

  if (statusCode.includes("R")) {
    return "renamed";
  }

  if (statusCode.includes("C")) {
    return "copied";
  }

  if (statusCode.includes("U")) {
    return "unmerged";
  }

  if (statusCode.includes("D")) {
    return "deleted";
  }

  if (statusCode.includes("A")) {
    return "added";
  }

  if (statusCode.includes("T")) {
    return "type_changed";
  }

  if (statusCode.includes("M")) {
    return "modified";
  }

  return "changed";
};

export const parseWorkspaceStatusLine = (line: string): WorkspaceStatusEntry | null => {
  const normalized = normalizeLine(line);
  if (normalized.length === 0) {
    return null;
  }

  const summaryMatch = /^(수정|추가|삭제|이름변경|복사|미추적|충돌|형식변경|변경)\s+(.+)$/.exec(normalized);
  if (summaryMatch) {
    const label = summaryMatch[1] ?? "";
    const body = (summaryMatch[2] ?? "").trim();
    const kind = LABEL_TO_KIND[label] ?? "changed";

    if (kind === "renamed" || kind === "copied") {
      const [from, to] = body.split(/\s*->\s*/, 2);
      if (from && to) {
        return {
          statusCode: "??",
          kind,
          path: from,
          path2: to,
          summary: `${label} ${from} -> ${to}`,
        };
      }
    }

    return {
      statusCode: "??",
      kind,
      path: body,
      summary: `${label} ${body}`,
    };
  }

  if (normalized.startsWith("?? ")) {
    const path = normalized.slice(3).trim();
    if (!path) {
      return null;
    }

    return {
      statusCode: "??",
      kind: "untracked",
      path,
      summary: `${KIND_LABELS.untracked} ${path}`,
    };
  }

  const match = /^(.{2})\s+(.*)$/.exec(normalized);
  if (!match) {
    return null;
  }

  const statusCode = match[1] ?? "";
  const rawPath = (match[2] ?? "").trim();
  if (!rawPath) {
    return null;
  }

  const kind = classifyStatusCode(statusCode);
  if (kind === "renamed" || kind === "copied") {
    const [from, to] = rawPath.split(/\s*->\s*/, 2);
    if (from && to) {
      return {
        statusCode,
        kind,
        path: from,
        path2: to,
        summary: `${KIND_LABELS[kind]} ${from} -> ${to}`,
      };
    }
  }

  return {
    statusCode,
    kind,
    path: rawPath,
    summary: `${KIND_LABELS[kind]} ${rawPath}`,
  };
};

export const formatWorkspaceStatusEntry = (entry: WorkspaceStatusEntry): string => entry.summary;
