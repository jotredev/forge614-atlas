import { describe, expect, test } from "bun:test";
import { ForgeHomeError, resolveForgeHome } from "./forge-home";

/** Captura el error que lanza `resolveForgeHome` para comprobar su código y su mensaje exactos. */
function captureError(env: Record<string, string | undefined>): ForgeHomeError {
  try {
    resolveForgeHome(env, "/Users/jane");
  } catch (error) {
    expect(error).toBeInstanceOf(ForgeHomeError);
    return error as ForgeHomeError;
  }
  throw new Error("resolveForgeHome did not throw");
}

/** Reglas de `FORGE614_HOME`: las mismas que aplica la librería de Engram que Atlas lleva dentro. */
describe("resolveForgeHome", () => {
  test("falls back to <home>/.forge614 when the variable is not set", () => {
    expect(resolveForgeHome({}, "/Users/jane")).toBe("/Users/jane/.forge614");
  });

  test("uses the variable when it is an absolute path", () => {
    expect(resolveForgeHome({ FORGE614_HOME: "/opt/forge614" }, "/Users/jane")).toBe("/opt/forge614");
  });

  test("rejects a variable that is present but empty", () => {
    const error = captureError({ FORGE614_HOME: "" });
    expect(error.code).toBe("INVALID_FORGE614_HOME");
    expect(error.message).toBe("FORGE614_HOME must be a non-empty absolute path.");
  });

  test("rejects a relative path", () => {
    const error = captureError({ FORGE614_HOME: "relative/forge614" });
    expect(error.code).toBe("INVALID_FORGE614_HOME");
  });

  test("rejects a path that contains a NUL character", () => {
    const error = captureError({ FORGE614_HOME: "/opt/forge\u0000614" });
    expect(error.code).toBe("INVALID_FORGE614_HOME");
  });
});
