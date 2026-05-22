import { execSync } from "node:child_process";
import type { CacheHitInfo } from "../../core/pipeline/types.js";
import type { TokenReductionSnapshot } from "../../core/utils/tokenMetrics.js";
import { wrapTextToDisplayWidth } from "./renderer.js";

export const truncateToDisplayWidth = (text: string, width: number): string => {
  if (width <= 0) {
    return "";
  }

  const [firstLine = ""] = wrapTextToDisplayWidth(text, width);
  return firstLine;
};

export const formatTokenSavingsBadge = (reduction?: TokenReductionSnapshot | null): string | undefined => {
  if (!reduction) {
    return undefined;
  }

  const percent = Math.max(0, Math.round(reduction.savedPercent));
  return `tok -${percent}%`;
};

export const formatCacheHitBadge = (cacheHit: CacheHitInfo): string => {
  const ageDays = Math.round(cacheHit.cacheAge / (24 * 60 * 60 * 1000));
  const ageLabel = ageDays === 0 ? "오늘" : `${ageDays}일 전`;
  const kindLabel = cacheHit.kind === "session" ? "세션" : "task";
  return `cache hit(${kindLabel} · ${ageLabel})`;
};

export const resolveFooterBranchLabel = (cwd: string): string | undefined => {
  try {
    const branch = execSync("git symbolic-ref --short HEAD", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    return branch.length > 0 ? branch : undefined;
  } catch {}

  try {
    const detachedHead = execSync("git rev-parse --short HEAD", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    return detachedHead.length > 0 ? `detached@${detachedHead}` : undefined;
  } catch {
    return undefined;
  }
};
