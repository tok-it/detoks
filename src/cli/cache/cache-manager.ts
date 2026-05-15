import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CacheEntry<T> {
  version: 1;
  cachedAt: string;
  ttlMs: number;
  value: T;
}

const CACHE_VERSION = 1 as const;

const getHomeDir = (): string => process.env.HOME ?? homedir();

export const getDetoksCacheDir = (): string => join(getHomeDir(), ".detoks", "cache");

const getCacheFilePath = (namespace: string, key: string): string =>
  join(getDetoksCacheDir(), namespace, `${key}.json`);

const ensureCacheDir = (namespace: string): void => {
  mkdirSync(join(getDetoksCacheDir(), namespace), { recursive: true });
};

export const readCache = <T>(
  namespace: string,
  key: string,
  maxAgeMs: number,
): T | null => {
  const filePath = getCacheFilePath(namespace, key);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as CacheEntry<T>;

    if (parsed.version !== CACHE_VERSION) {
      return null;
    }

    if (typeof parsed.cachedAt !== "string" || typeof parsed.ttlMs !== "number") {
      return null;
    }

    const cachedAtMs = new Date(parsed.cachedAt).getTime();
    if (!Number.isFinite(cachedAtMs)) {
      return null;
    }

    if (maxAgeMs >= 0 && Date.now() - cachedAtMs > maxAgeMs) {
      return null;
    }

    return parsed.value;
  } catch {
    return null;
  }
};

export const writeCache = <T>(
  namespace: string,
  key: string,
  value: T,
  ttlMs: number,
): void => {
  ensureCacheDir(namespace);

  const filePath = getCacheFilePath(namespace, key);
  const payload: CacheEntry<T> = {
    version: CACHE_VERSION,
    cachedAt: new Date().toISOString(),
    ttlMs,
    value,
  };

  writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
};

export const invalidateCache = (namespace: string, key: string): void => {
  const filePath = getCacheFilePath(namespace, key);

  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch {
      // Best-effort invalidation only: cache removal should never break auth flows.
    }
  }
};
