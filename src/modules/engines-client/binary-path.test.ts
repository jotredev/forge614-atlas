import { describe, expect, test } from "bun:test";
import { resolveEnginesBinaryPath } from "./binary-path";

describe("resolveEnginesBinaryPath", () => {
  test("resolves the stable launcher path on macOS/Linux (posix separators)", () => {
    expect(resolveEnginesBinaryPath("darwin", "/Users/jane")).toBe(
      "/Users/jane/.forge614/engines/bin/forge614-engines",
    );
    expect(resolveEnginesBinaryPath("linux", "/home/jane")).toBe(
      "/home/jane/.forge614/engines/bin/forge614-engines",
    );
  });

  test("adds the .exe suffix and uses backslash separators on Windows", () => {
    expect(resolveEnginesBinaryPath("win32", "C:\\Users\\jane")).toBe(
      "C:\\Users\\jane\\.forge614\\engines\\bin\\forge614-engines.exe",
    );
  });
});
