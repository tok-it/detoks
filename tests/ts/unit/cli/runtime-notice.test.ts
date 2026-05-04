import { afterEach, describe, expect, it, vi } from "vitest";
import { maybeShowRuntimeUpdateNotice } from "../../../../src/cli/runtime-notice.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("maybeShowRuntimeUpdateNotice", () => {
  it("새 버전에서는 한 번만 업데이트 공지를 보여준다", () => {
    let seenVersion = "0.0.9";
    const logs: string[] = [];

    maybeShowRuntimeUpdateNotice({
      isInteractive: () => true,
      hasConfigFile: () => true,
      getPackageMetadata: () => ({ name: "detoks", version: "0.1.0" }),
      getLastSeenVersion: () => seenVersion,
      markLastSeenVersion: (version) => {
        seenVersion = version;
      },
      log: (message) => {
        logs.push(message);
      },
    });

    maybeShowRuntimeUpdateNotice({
      isInteractive: () => true,
      hasConfigFile: () => true,
      getPackageMetadata: () => ({ name: "detoks", version: "0.1.0" }),
      getLastSeenVersion: () => seenVersion,
      markLastSeenVersion: (version) => {
        seenVersion = version;
      },
      log: (message) => {
        logs.push(message);
      },
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("Claude adapter가 포함된 새 버전");
    expect(logs[0]).toContain("npm install -g detoks@latest");
    expect(seenVersion).toBe("0.1.0");
  });

  it("대화형이 아니면 공지를 생략한다", () => {
    const log = vi.fn();

    maybeShowRuntimeUpdateNotice({
      isInteractive: () => false,
      hasConfigFile: () => true,
      getPackageMetadata: () => ({ name: "detoks", version: "0.1.0" }),
      getLastSeenVersion: () => "0.0.9",
      markLastSeenVersion: vi.fn(),
      log,
    });

    expect(log).not.toHaveBeenCalled();
  });
});
