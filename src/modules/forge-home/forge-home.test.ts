/** Prueba la carpeta predeterminada y el rechazo de valores vacíos, relativos o con carácter nulo en `FORGE614_HOME`. */
import { describe, expect, test } from "bun:test";
import { ForgeHomeError, resolveForgeHome } from "./forge-home";

/**
 * Captura el error de una configuración inválida para comprobar su código; también comprueba que sea `ForgeHomeError`.
 * @param env Variables que contienen el valor inválido de `FORGE614_HOME`.
 * @returns El error de configuración lanzado por `resolveForgeHome`.
 * @throws Error con el mensaje `resolveForgeHome did not throw` si la configuración no produce ningún error.
 */
function captureError(env: Record<string, string | undefined>): ForgeHomeError {
  try {
    resolveForgeHome(env, "/Users/jane");
  } catch (error) {
    expect(error).toBeInstanceOf(ForgeHomeError);
    return error as ForgeHomeError;
  }
  throw new Error("resolveForgeHome did not throw");
}

/** Comprueba las cinco salidas de `resolveForgeHome` que determinan la carpeta usada por Atlas. */
describe("resolveForgeHome", () => {
  /** Comprueba que la ausencia de la variable añada `.forge614` a la carpeta personal indicada. */
  test("falls back to <home>/.forge614 when the variable is not set", () => {
    expect(resolveForgeHome({}, "/Users/jane")).toBe("/Users/jane/.forge614");
  });

  /** Comprueba que una ruta absoluta definida se use como carpeta Forge614. */
  test("uses the variable when it is an absolute path", () => {
    expect(resolveForgeHome({ FORGE614_HOME: "/opt/forge614" }, "/Users/jane")).toBe("/opt/forge614");
  });

  /** Comprueba que una variable presente y vacía produzca el código y mensaje de configuración inválida. */
  test("rejects a variable that is present but empty", () => {
    const error = captureError({ FORGE614_HOME: "" });
    expect(error.code).toBe("INVALID_FORGE614_HOME");
    expect(error.message).toBe("FORGE614_HOME must be a non-empty absolute path.");
  });

  /** Comprueba que una ruta relativa produzca el código `INVALID_FORGE614_HOME`. */
  test("rejects a relative path", () => {
    const error = captureError({ FORGE614_HOME: "relative/forge614" });
    expect(error.code).toBe("INVALID_FORGE614_HOME");
  });

  /** Comprueba que una ruta con carácter nulo produzca el código `INVALID_FORGE614_HOME`. */
  test("rejects a path that contains a NUL character", () => {
    const error = captureError({ FORGE614_HOME: "/opt/forge\u0000614" });
    expect(error.code).toBe("INVALID_FORGE614_HOME");
  });
});
