import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const DETOKS_DIRNAME = ".detoks";
const PROJECTS_DIRNAME = "projects";
const SHARED_DIRNAME = "shared";
const LEGACY_STATE_DIRNAME = ".state";

const sanitizeSegment = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export const getDetoksHomeDir = (): string =>
  process.env.DETOKS_HOME?.trim() || join(process.env.HOME ?? homedir(), DETOKS_DIRNAME);

export const resolveWorkspaceScopeId = (cwd: string = process.cwd()): string => {
  const absoluteCwd = resolve(cwd);
  const slug = sanitizeSegment(basename(absoluteCwd)) || "workspace";
  const hash = createHash("sha256").update(absoluteCwd).digest("hex").slice(0, 12);
  return `${slug}-${hash}`;
};

export const resolveProjectDataDir = (cwd: string = process.cwd()): string =>
  join(getDetoksHomeDir(), PROJECTS_DIRNAME, resolveWorkspaceScopeId(cwd));

export const resolveSessionsDir = (cwd: string = process.cwd()): string =>
  join(resolveProjectDataDir(cwd), "sessions");

export const resolveCheckpointsDir = (cwd: string = process.cwd()): string =>
  join(resolveProjectDataDir(cwd), "checkpoints");

export const resolveProjectRagDir = (cwd: string = process.cwd()): string =>
  join(resolveProjectDataDir(cwd), "rag");

export const resolveProjectNoticeFlagPath = (cwd: string = process.cwd()): string =>
  join(resolveProjectDataDir(cwd), ".notice-shown");

export const resolveLegacyStateDir = (cwd: string = process.cwd()): string =>
  join(resolve(cwd), LEGACY_STATE_DIRNAME);

export const resolveLegacySessionsDir = (cwd: string = process.cwd()): string =>
  join(resolveLegacyStateDir(cwd), "sessions");

export const resolveLegacyCheckpointsDir = (cwd: string = process.cwd()): string =>
  join(resolveLegacyStateDir(cwd), "checkpoints");

export const resolveLegacyRagDir = (cwd: string = process.cwd()): string =>
  join(resolveLegacyStateDir(cwd), "rag");

export const resolveSharedDataDir = (): string =>
  join(getDetoksHomeDir(), SHARED_DIRNAME);

export const resolveSharedCrossProjectDir = (): string =>
  join(resolveSharedDataDir(), "cross-project");

export const resolveSharedRagDir = (): string =>
  join(resolveSharedDataDir(), "rag");
