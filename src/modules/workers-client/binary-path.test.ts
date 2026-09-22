import { describe, expect, test } from "bun:test";
import { resolveWorkersBinaryPath } from "./binary-path";

describe("resolveWorkersBinaryPath", () => {
  test("resolves the stable launcher path on macOS/Linux (posix separators)", () => {
    expect(resolveWorkersBinaryPath("darwin", "/Users/jane")).toBe(
      "/Users/jane/.forge614/workers/bin/forge614-workers",
    );
    expect(resolveWorkersBinaryPath("linux", "/home/jane")).toBe(
      "/home/jane/.forge614/workers/bin/forge614-workers",
    );
  });

  test("adds the .exe suffix and uses backslash separators on Windows", () => {
    expect(resolveWorkersBinaryPath("win32", "C:\\Users\\jane")).toBe(
      "C:\\Users\\jane\\.forge614\\workers\\bin\\forge614-workers.exe",
    );
  });
});
