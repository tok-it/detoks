import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { hasConfigFile, getLastSeenReleaseVersion, updateLastSeenReleaseVersion } from "./config/config-manager.js";

interface PackageMetadata {
  name: string;
  version: string;
}

export interface RuntimeNoticeDependencies {
  isInteractive?: () => boolean;
  hasConfigFile?: () => boolean;
  getPackageMetadata?: () => PackageMetadata | null;
  getLastSeenVersion?: () => string | undefined;
  markLastSeenVersion?: (version: string) => void;
  log?: (message: string) => void;
}

const RELEASE_NOTICE_LINES = [
  "주요 변경점:",
  "- 로컬 LLM 실행이 node-llama-cpp Node.js 네이티브 바인딩 기반으로 변경되었습니다.",
  "- 별도 llama-server 실행이나 Python 런타임 없이 GGUF 모델을 in-process로 로드합니다.",
  "- RAG 의미 검색, Cross-Session Cache, TUI/embedded PTY 흐름이 강화되었습니다.",
];

const PACKAGE_JSON_CANDIDATES = [
  join(dirname(fileURLToPath(import.meta.url)), "../../package.json"),
  join(dirname(fileURLToPath(import.meta.url)), "../../../package.json"),
];

const readPackageMetadata = (): PackageMetadata | null => {
  for (const packageJsonPath of PACKAGE_JSON_CANDIDATES) {
    if (!existsSync(packageJsonPath)) {
      continue;
    }

    try {
      const content = readFileSync(packageJsonPath, "utf-8");
      const parsed = JSON.parse(content) as Partial<PackageMetadata>;
      if (typeof parsed.name === "string" && typeof parsed.version === "string") {
        return { name: parsed.name, version: parsed.version };
      }
    } catch {
      // ignore malformed package metadata and keep trying fallbacks
    }
  }

  return null;
};

export const maybeShowRuntimeUpdateNotice = (
  dependencies: RuntimeNoticeDependencies = {},
): void => {
  const isInteractive = dependencies.isInteractive ?? (() => process.stdin.isTTY && process.stdout.isTTY);
  if (!isInteractive()) {
    return;
  }

  const configFileExists = dependencies.hasConfigFile ?? hasConfigFile;
  if (!configFileExists()) {
    return;
  }

  const packageMetadata = dependencies.getPackageMetadata?.() ?? readPackageMetadata();
  if (!packageMetadata) {
    return;
  }

  const getLastSeenVersion = dependencies.getLastSeenVersion ?? getLastSeenReleaseVersion;
  if (getLastSeenVersion() === packageMetadata.version) {
    return;
  }

  const log = dependencies.log ?? ((message: string) => console.error(message));
  log(
    [
      "",
      `detoks ${packageMetadata.version} 업데이트 안내`,
      ...RELEASE_NOTICE_LINES,
      `업데이트: npm install -g ${packageMetadata.name}@latest`,
    ].join("\n"),
  );

  try {
    const markLastSeenVersion = dependencies.markLastSeenVersion ?? updateLastSeenReleaseVersion;
    markLastSeenVersion(packageMetadata.version);
  } catch {
    // 공지 기록 실패는 실행을 막지 않는다.
  }
};
