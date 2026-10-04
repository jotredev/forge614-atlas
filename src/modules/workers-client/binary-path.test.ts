/** Comprueba las rutas del lanzador de Workers en macOS, Linux y Windows, sin ejecutarlo. */
import { describe, expect, test } from "bun:test";
import { resolveWorkersBinaryPath } from "./binary-path";

/** Comprueba que `resolveWorkersBinaryPath` elija el nombre y separador de cada plataforma. */
describe("resolveWorkersBinaryPath", () => {
  /** Comprueba que macOS y Linux conserven barras `/` y omitan el sufijo `.exe`. */
  test("builds the stable launcher path on top of the given Forge614 folder (posix separators)", () => {
    expect(resolveWorkersBinaryPath("darwin", "/Users/jane/.forge614")).toBe(
      "/Users/jane/.forge614/workers/bin/forge614-workers",
    );
    expect(resolveWorkersBinaryPath("linux", "/opt/forge614")).toBe("/opt/forge614/workers/bin/forge614-workers");
  });

  /** Comprueba que Windows use barras invertidas y añada el sufijo `.exe`. */
  test("adds the .exe suffix and uses backslash separators on Windows", () => {
    expect(resolveWorkersBinaryPath("win32", "C:\\Users\\jane\\.forge614")).toBe(
      "C:\\Users\\jane\\.forge614\\workers\\bin\\forge614-workers.exe",
    );
  });
});
