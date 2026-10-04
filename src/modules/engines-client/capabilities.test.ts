import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { homedir } from "node:os";
import { getCapabilities } from "./capabilities";
import { resolveEnginesBinaryPath } from "./binary-path";
import { resolveForgeHome } from "../forge-home/forge-home";
import { makeFakeDir, writeFakeEngines } from "../cli/fake-binaries.testkit";

const binaryPath = resolveEnginesBinaryPath(process.platform, resolveForgeHome(process.env, homedir()));

describe("getCapabilities", () => {
  const fakeDirs: string[] = [];
  afterEach(() => {
    for (const dir of fakeDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  test("reports supportsHeadlessExec for claude-code from the real binary", () => {
    const capabilities = getCapabilities(binaryPath, "claude-code");

    expect(capabilities.id).toBe("claude-code");
    expect(typeof capabilities.supportsMcp).toBe("boolean");
    expect(typeof capabilities.supportsHooks).toBe("boolean");
    expect(typeof capabilities.supportsHeadlessExec).toBe("boolean");
  });

  test("the real Engines (1.17.0+) guarantees read-only helpers and reasoning levels for claude-code", () => {
    const capabilities = getCapabilities(binaryPath, "claude-code");

    expect(capabilities.supportsReadOnly).toBe(true);
    expect(capabilities.supportsReasoningLevel).toBe(true);
  });

  test("reads a missing supportsReadOnly (Engines older than 1.17.0) as false", () => {
    const dir = makeFakeDir("atlas-capabilities-");
    fakeDirs.push(dir);
    const fakeEngines = writeFakeEngines(dir, { supportsReadOnly: "absent" });

    expect(getCapabilities(fakeEngines, "claude-code").supportsReadOnly).toBe(false);
  });

  test("keeps a reported supportsReadOnly: true and: false as they are", () => {
    const dir = makeFakeDir("atlas-capabilities-");
    fakeDirs.push(dir);
    const trueEngines = writeFakeEngines(dir, { supportsReadOnly: true });
    expect(getCapabilities(trueEngines, "claude-code").supportsReadOnly).toBe(true);

    const otherDir = makeFakeDir("atlas-capabilities-");
    fakeDirs.push(otherDir);
    const falseEngines = writeFakeEngines(otherDir, { supportsReadOnly: false });
    expect(getCapabilities(falseEngines, "claude-code").supportsReadOnly).toBe(false);
  });

  test("throws a clear error for an unknown agent id", () => {
    expect(() => getCapabilities(binaryPath, "not-a-real-agent")).toThrow();
  });
});
