export interface GgufFileInfo {
  filename: string;
  quantization: string;
  sizeMb: number;
}

export interface HfRepoRef {
  owner: string;
  repo: string;
  fullRepo: string;
}

const HF_URL_RE =
  /^https?:\/\/(?:www\.)?huggingface\.co\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)(?:\/.*)?$/;
const REPO_RE = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/;
const QUANT_RE = /-(Q\d[A-Z0-9_]*|IQ\d[A-Z0-9_]*|F16|BF16|F32)\.gguf$/i;

export const parseHfRepoInput = (raw: string): HfRepoRef | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const urlMatch = HF_URL_RE.exec(trimmed);
  if (urlMatch) {
    const owner = urlMatch[1] ?? "";
    const repo = urlMatch[2] ?? "";
    return { owner, repo, fullRepo: `${owner}/${repo}` };
  }

  const repoMatch = REPO_RE.exec(trimmed);
  if (repoMatch) {
    const owner = repoMatch[1] ?? "";
    const repo = repoMatch[2] ?? "";
    return { owner, repo, fullRepo: `${owner}/${repo}` };
  }

  return null;
};

const parseQuantization = (filename: string): string => {
  const match = QUANT_RE.exec(filename);
  return match?.[1]?.toUpperCase() ?? "unknown";
};

const fetchFileSizeMb = async (repo: string, filename: string): Promise<number> => {
  try {
    const url = `https://huggingface.co/${repo}/resolve/main/${filename}`;
    const res = await fetch(url, { method: "HEAD" });
    const contentLength = res.headers.get("content-length");
    if (contentLength) {
      return Math.round(parseInt(contentLength, 10) / (1024 * 1024));
    }
  } catch {
    // 크기 미상으로 처리
  }
  return 0;
};

export class HfRepoError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "private" | "no_gguf" | "network",
  ) {
    super(message);
    this.name = "HfRepoError";
  }
}

interface HfSibling {
  rfilename: string;
}

export const listGgufFiles = async (ref: HfRepoRef): Promise<GgufFileInfo[]> => {
  const apiUrl = `https://huggingface.co/api/models/${ref.fullRepo}`;

  let data: { siblings?: HfSibling[] };
  try {
    const res = await fetch(apiUrl);
    if (res.status === 404) {
      throw new HfRepoError(
        "레포를 찾을 수 없습니다. owner/repo가 맞는지 확인하세요.",
        "not_found",
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new HfRepoError(
        "비공개 레포는 아직 지원되지 않습니다.",
        "private",
      );
    }
    if (!res.ok) {
      throw new HfRepoError(
        `HuggingFace API 오류: ${res.status} ${res.statusText}`,
        "network",
      );
    }
    data = (await res.json()) as { siblings?: HfSibling[] };
  } catch (err) {
    if (err instanceof HfRepoError) throw err;
    throw new HfRepoError(
      `네트워크 오류: ${err instanceof Error ? err.message : String(err)}`,
      "network",
    );
  }

  const ggufFiles = (data.siblings ?? [])
    .map((s) => s.rfilename)
    .filter((name) => name.toLowerCase().endsWith(".gguf"));

  if (ggufFiles.length === 0) {
    throw new HfRepoError(
      "이 레포에는 GGUF 파일이 없습니다.",
      "no_gguf",
    );
  }

  const results = await Promise.all(
    ggufFiles.map(async (filename) => {
      const sizeMb = await fetchFileSizeMb(ref.fullRepo, filename);
      return {
        filename,
        quantization: parseQuantization(filename),
        sizeMb,
      };
    }),
  );

  return results;
};
