import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDir, "..");

export function requirePackages(packages) {
  if (packages.length === 0) {
    console.error("Usage: pass at least one package name.");
    process.exit(1);
  }
}

export function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

export function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function uvCommand() {
  return process.platform === "win32" ? "uv.exe" : "uv";
}
