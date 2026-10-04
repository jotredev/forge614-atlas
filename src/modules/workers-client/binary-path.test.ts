import { describe, expect, test } from "bun:test";
import { resolveWorkersBinaryPath } from "./binary-path";

describe("resolveWorkersBinaryPath", () => {
  test("builds the stable launcher path on top of the given Forge614 folder (posix separators)", () => {
    expect(resolveWorkersBinaryPath("darwin", "/Users/jane/.forge614")).toBe(
      "/Users/jane/.forge614/workers/bin/forge614-workers",
    );
    expect(resolveWorkersBinaryPath("linux", "/opt/forge614")).toBe("/opt/forge614/workers/bin/forge614-workers");
  });

  test("adds the .exe suffix and uses backslash separators on Windows", () => {
    expect(resolveWorkersBinaryPath("win32", "C:\\Users\\jane\\.forge614")).toBe(
      "C:\\Users\\jane\\.forge614\\workers\\bin\\forge614-workers.exe",
    );
  });
});
