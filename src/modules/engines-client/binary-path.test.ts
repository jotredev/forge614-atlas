import { describe, expect, test } from "bun:test";
import { resolveEnginesBinaryPath } from "./binary-path";

describe("resolveEnginesBinaryPath", () => {
  test("builds the stable launcher path on top of the given Forge614 folder (posix separators)", () => {
    expect(resolveEnginesBinaryPath("darwin", "/Users/jane/.forge614")).toBe(
      "/Users/jane/.forge614/engines/bin/forge614-engines",
    );
    expect(resolveEnginesBinaryPath("linux", "/opt/forge614")).toBe("/opt/forge614/engines/bin/forge614-engines");
  });

  test("adds the .exe suffix and uses backslash separators on Windows", () => {
    expect(resolveEnginesBinaryPath("win32", "C:\\Users\\jane\\.forge614")).toBe(
      "C:\\Users\\jane\\.forge614\\engines\\bin\\forge614-engines.exe",
    );
  });
});
