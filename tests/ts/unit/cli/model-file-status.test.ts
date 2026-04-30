import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectLocalModelFile,
  shouldDownloadModelFile,
} from "../../../../src/cli/model-setup/file-status.js";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "detoks-model-file-status-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("inspectLocalModelFile", () => {
  it("returns missing when the gguf file does not exist", () => {
    const cwd = createTempDir();

    expect(inspectLocalModelFile(join(cwd, "missing.gguf"))).toEqual({
      kind: "missing",
    });
  });

  it("returns invalid for a 0-byte gguf file", () => {
    const cwd = createTempDir();
    const filePath = join(cwd, "empty.gguf");
    writeFileSync(filePath, "");

    expect(inspectLocalModelFile(filePath)).toEqual({
      kind: "invalid",
      reason: "0B",
    });
  });

  it("treats invalid and missing gguf files as re-download targets", () => {
    expect(shouldDownloadModelFile({ kind: "missing" })).toBe(true);
    expect(shouldDownloadModelFile({ kind: "invalid", reason: "0B" })).toBe(true);
    expect(shouldDownloadModelFile({ kind: "ready" })).toBe(false);
  });

  it("returns ready for a valid gguf header", () => {
    const cwd = createTempDir();
    const filePath = join(cwd, "model.gguf");
    writeFileSync(filePath, "GGUF");

    expect(inspectLocalModelFile(filePath)).toEqual({
      kind: "ready",
    });
  });
});
