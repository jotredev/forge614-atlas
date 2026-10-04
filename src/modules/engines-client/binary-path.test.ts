/**
 * Pruebas de `resolveEnginesBinaryPath`: comprueban la ruta que arma para macOS (`darwin`) y Linux, con `/`, y para Windows
 * (`win32`), con `\` y el sufijo `.exe`. No tocan el disco ni ejecutan Engines.
 */
import { describe, expect, test } from "bun:test";
import { resolveEnginesBinaryPath } from "./binary-path";

/**
 * Comprueba `resolveEnginesBinaryPath` en dos casos: plataformas tipo Unix y Windows.
 * Importa porque `runInit` arma esta ruta y `init` ejecuta Engines con ella; si sale mal, `init` no puede hablar con Engines.
 */
describe("resolveEnginesBinaryPath", () => {
  /**
   * Comprueba que `darwin` con `/Users/jane/.forge614` y `linux` con `/opt/forge614` den `<carpeta>/engines/bin/forge614-engines`,
   * con barras `/`.
   * Importa porque es la ruta fija donde se instala Engines.
   */
  test("builds the stable launcher path on top of the given Forge614 folder (posix separators)", () => {
    expect(resolveEnginesBinaryPath("darwin", "/Users/jane/.forge614")).toBe(
      "/Users/jane/.forge614/engines/bin/forge614-engines",
    );
    expect(resolveEnginesBinaryPath("linux", "/opt/forge614")).toBe("/opt/forge614/engines/bin/forge614-engines");
  });

  /**
   * Comprueba que `win32` con `C:\Users\jane\.forge614` dé `C:\Users\jane\.forge614\engines\bin\forge614-engines.exe`, con barras
   * invertidas y el sufijo `.exe`.
   * Importa porque Windows usa otro separador y su lanzador lleva `.exe`.
   */
  test("adds the .exe suffix and uses backslash separators on Windows", () => {
    expect(resolveEnginesBinaryPath("win32", "C:\\Users\\jane\\.forge614")).toBe(
      "C:\\Users\\jane\\.forge614\\engines\\bin\\forge614-engines.exe",
    );
  });
});
