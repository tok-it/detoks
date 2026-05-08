import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadModel } from "../../../../src/cli/model-setup/download.js";

const tempDirs: string[] = [];

function createWorkspace(): { root: string; home: string } {
  const root = mkdtempSync(join(tmpdir(), "detoks-model-download-"));
  tempDirs.push(root);
  const home = join(root, "home");
  return { root, home };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("downloadModel", () => {
  it("downloads a GGUF file into ~/.detoks/models", async () => {
    const { home } = createWorkspace();
    vi.stubEnv("HOME", home);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Blob([Buffer.from("GGUF_test_payload")]), {
          status: 200,
          headers: {
            "content-type": "application/octet-stream",
          },
        }),
      ),
    );
    const stdoutWriteSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    try {
      await downloadModel({
        id: "test-model",
        displayName: "Test Model",
        description: "download smoke test",
        modelName: "test/model",
        hfRepo: "test/repo",
        hfFile: "test-model.gguf",
        sizeMb: 1,
      });
    } finally {
      stdoutWriteSpy.mockRestore();
    }

    const downloadedPath = join(home, ".detoks", "models", "test-model.gguf");
    expect(existsSync(downloadedPath)).toBe(true);
    expect(readFileSync(downloadedPath, "utf8")).toBe("GGUF_test_payload");
  });
});
