import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { getCapabilities } from "./capabilities";
import { resolveEnginesBinaryPath } from "./binary-path";

const binaryPath = resolveEnginesBinaryPath(process.platform, homedir());

describe("getCapabilities", () => {
  test("reports supportsHeadlessExec for claude-code from the real binary", () => {
    const capabilities = getCapabilities(binaryPath, "claude-code");

    expect(capabilities.id).toBe("claude-code");
    expect(typeof capabilities.supportsMcp).toBe("boolean");
    expect(typeof capabilities.supportsHooks).toBe("boolean");
    expect(typeof capabilities.supportsHeadlessExec).toBe("boolean");
  });

  test("throws a clear error for an unknown agent id", () => {
    expect(() => getCapabilities(binaryPath, "not-a-real-agent")).toThrow();
  });
});
