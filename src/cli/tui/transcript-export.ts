import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PtyEvent, PtyTranscript } from "../../integrations/subprocess/types.js";
import { resolveProjectDataDir } from "../../core/state/storage-paths.js";

// ANSI CSI sequences (color codes etc.): ESC [ ... letter
const ANSI_CSI = new RegExp("\\u001b\\[[0-?]*[ -/]*[@-~]", "g");
// ANSI OSC sequences (window title etc.): ESC ] ... BEL or ESC \
const ANSI_OSC = new RegExp("\\u001b\\][^\\u0007]*(?:\\u0007|\\u001b\\\\)", "g");
// Bare control bytes except whitespace (TAB, LF, CR retained).
const CONTROL_CHARS = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]", "g");

const stripAnsi = (value: string): string =>
  value.replace(ANSI_CSI, "").replace(ANSI_OSC, "").replace(CONTROL_CHARS, "");

const formatRelative = (timestampMs: number, baseMs: number): string => {
  const deltaMs = Math.max(0, timestampMs - baseMs);
  const totalSec = Math.floor(deltaMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const ms = deltaMs % 1000;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
};

const formatDuration = (totalMs: number): string => {
  const totalSec = Math.floor(totalMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
};

const formatEvent = (event: PtyEvent, baseMs: number): string | null => {
  const ts = formatRelative(event.timestamp, baseMs);
  switch (event.type) {
    case "chunk": {
      if (!event.data) return null;
      const stream = event.stream ?? "stdout";
      const text = stripAnsi(event.data).replace(/\r\n/g, "\n");
      return text
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => `[${ts}] ${stream}: ${line}`)
        .join("\n");
    }
    case "prompt":
      return event.data ? `[${ts}] PROMPT: ${stripAnsi(event.data)}` : null;
    case "reply":
      return event.data ? `[${ts}] REPLY: ${stripAnsi(event.data)}` : null;
    case "resize":
      return `[${ts}] RESIZE: ${event.columns ?? "?"}x${event.rows ?? "?"}`;
    case "exit":
      return `[${ts}] EXIT: ${event.data ?? ""}`;
    case "timeout":
      return `[${ts}] TIMEOUT`;
    case "error":
      return `[${ts}] ERROR: ${event.data ?? ""}`;
    default:
      return null;
  }
};

export interface FormatTranscriptOptions {
  sessionId?: string;
  adapter?: string;
  prompt?: string;
}

export const formatTranscript = (
  transcript: PtyTranscript,
  options: FormatTranscriptOptions = {},
): string => {
  const lines: string[] = [];
  lines.push("# detoks adapter transcript");
  if (options.sessionId) lines.push(`# session: ${options.sessionId}`);
  if (options.adapter) lines.push(`# adapter: ${options.adapter}`);
  if (options.prompt) {
    const oneLine = options.prompt.replace(/\s+/g, " ").trim();
    lines.push(`# prompt: ${oneLine}`);
  }
  lines.push(`# started: ${new Date(transcript.startTime).toISOString()}`);
  lines.push(`# ended: ${new Date(transcript.endTime).toISOString()}`);
  lines.push(`# duration: ${formatDuration(transcript.totalDuration)}`);
  if (transcript.exitCode !== undefined) {
    lines.push(`# exit: ${transcript.exitCode}`);
  }
  if (transcript.timedOut) {
    lines.push(`# timed_out: true`);
  }
  lines.push(`# events: ${transcript.events.length}`);
  lines.push("# ---");

  for (const event of transcript.events) {
    const formatted = formatEvent(event, transcript.startTime);
    if (formatted) lines.push(formatted);
  }

  return lines.join("\n") + "\n";
};

const sanitizeForFilename = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

export interface ResolveTranscriptPathOptions {
  cwd?: string;
  sessionId?: string;
  runIndex?: number;
  /** Override timestamp for deterministic tests. */
  now?: () => Date;
}

export const resolveTranscriptPath = (
  options: ResolveTranscriptPathOptions = {},
): string => {
  const cwd = options.cwd ?? process.cwd();
  const baseDir = join(resolveProjectDataDir(cwd), "transcripts");
  const ts = (options.now ?? (() => new Date()))();
  const stamp = [
    ts.getUTCFullYear(),
    String(ts.getUTCMonth() + 1).padStart(2, "0"),
    String(ts.getUTCDate()).padStart(2, "0"),
    "-",
    String(ts.getUTCHours()).padStart(2, "0"),
    String(ts.getUTCMinutes()).padStart(2, "0"),
    String(ts.getUTCSeconds()).padStart(2, "0"),
    "-",
    String(ts.getUTCMilliseconds()).padStart(3, "0"),
  ].join("");
  const sessionPart = options.sessionId
    ? `-${sanitizeForFilename(options.sessionId).slice(0, 12)}`
    : "";
  const runPart = options.runIndex !== undefined ? `-r${options.runIndex}` : "";
  return join(baseDir, `${stamp}${sessionPart}${runPart}.txt`);
};

export const saveTranscript = async (
  filePath: string,
  contents: string,
): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf-8");
};

export const isAutoSaveEnabled = (): boolean =>
  process.env.DETOKS_SAVE_TRANSCRIPTS === "1";
