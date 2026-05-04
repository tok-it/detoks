import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getCodexReasoningEffortOverride,
  getLastSeenReleaseVersion,
  hasConfigFile,
  updateCodexReasoningEffort,
  updateLastSeenReleaseVersion,
} from "../../../../src/cli/config/config-manager.js";

const tempDirs: string[] = [];

function createTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "detoks-config-manager-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }

  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("codex reasoning effort config", () => {
  it("saves, loads, and clears the codex reasoning effort override", () => {
    const home = createTempHome();
    vi.stubEnv("HOME", home);

    expect(getCodexReasoningEffortOverride()).toBeUndefined();

    updateCodexReasoningEffort("high");
    expect(getCodexReasoningEffortOverride()).toBe("high");

    const configPath = join(home, ".detoks", "settings.json");
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toMatchObject({
      adapter: {
        codexReasoningEffort: "high",
      },
    });

    updateCodexReasoningEffort(undefined);
    expect(getCodexReasoningEffortOverride()).toBeUndefined();
    expect(JSON.parse(readFileSync(configPath, "utf8"))).not.toHaveProperty(
      "adapter.codexReasoningEffort",
    );
  });
});

describe("release notice config", () => {
  it("saves and loads the last seen release version", () => {
    const home = createTempHome();
    vi.stubEnv("HOME", home);

    expect(hasConfigFile()).toBe(false);
    expect(getLastSeenReleaseVersion()).toBeUndefined();

    updateLastSeenReleaseVersion("0.1.0");
    expect(hasConfigFile()).toBe(true);
    expect(getLastSeenReleaseVersion()).toBe("0.1.0");

    const configPath = join(home, ".detoks", "settings.json");
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toMatchObject({
      runtime: {
        lastSeenReleaseVersion: "0.1.0",
      },
    });
  });
});
