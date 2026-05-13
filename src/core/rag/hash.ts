import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

// raw_input → SHA256 hash (16자 hex). RAG F1 (cross-session 캐시) 조회 키.
// 같은 prompt가 동일 hash를 가지도록 공백·줄바꿈을 정규화한다.
export const hashRawInput = (rawInput: string): string => {
  const normalized = rawInput.trim().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
};

// (raw_input, project_id) 복합 hash. 다른 프로젝트의 캐시가 충돌하지 않도록 분리.
export const hashRawInputScopedToProject = (
  rawInput: string,
  projectId: string | undefined,
): string => {
  const normalized = rawInput.trim().replace(/\s+/g, " ");
  const composite = projectId ? `${projectId}::${normalized}` : normalized;
  return createHash("sha256").update(composite).digest("hex").slice(0, 16);
};

// 프로젝트 식별자 계산.
// 우선순위:
//   1. git remote URL (가장 안정적, 다른 worktree에서도 동일)
//   2. 절대 경로 hash (git이 없는 프로젝트)
//   3. fallback "anon"
export const computeProjectId = (cwd: string): string => {
  const absoluteCwd = resolve(cwd);

  try {
    const remote = execSync("git config --get remote.origin.url", {
      cwd: absoluteCwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    if (remote.length > 0) {
      return `git-${createHash("sha256").update(remote).digest("hex").slice(0, 12)}`;
    }
  } catch {
    // git remote 없거나 git 자체가 없는 환경 — path-based로 fallback
  }

  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", {
      cwd: absoluteCwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    if (gitRoot.length > 0) {
      return `git-local-${createHash("sha256").update(gitRoot).digest("hex").slice(0, 12)}`;
    }
  } catch {
    // git 저장소도 아님
  }

  return `path-${createHash("sha256").update(absoluteCwd).digest("hex").slice(0, 12)}`;
};

// task cache 키 v2 — task.id(실행 순서 식별자 t1/t2/…)를 제외하고
// 작업 의미(type, normalizedIntent, adapter, 버전)만으로 hash를 생성한다.
// v1은 id 포함으로 인해 앞 task가 하나만 바뀌어도 이후 모든 hash가 깨지는 구조적 문제가 있었다.
// normalizedIntent는 공백·문장 부호만 정규화하고 파일 경로·심볼명 등 식별자는 그대로 보존해야 한다.
export const hashTaskInputV2 = (params: {
  projectId: string;
  type: string;
  normalizedIntent: string;
  adapter: string;
  adapterModel: string;
  detoksMajorVersion: number;
}): string => {
  const content = JSON.stringify(params);
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
};
