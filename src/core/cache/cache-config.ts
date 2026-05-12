export const CACHE_TTL_DAYS = Number(process.env.DETOKS_CACHE_TTL_DAYS ?? 7);
export const CACHE_DISABLED = process.env.DETOKS_CACHE_DISABLED === "1";
export const CACHE_MAX_ENTRIES = 10_000;
export const CACHE_DIR = ".detoks/cache";
export const INPUT_HASH_INDEX_FILE = `${CACHE_DIR}/input-hash-index.jsonl`;
