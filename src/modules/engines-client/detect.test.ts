/**
 * Pruebas de `detectAgents` con el Forge614 Engines real instalado en la ruta fija del ecosistema, más un caso con una ruta
 * que no existe.
 * Comprueban la forma de la respuesta (lista no vacía de agentes con `id`, `installed`, `configDir` y `configFound`) y que un
 * binario inexistente haga lanzar un error.
 */
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { detectAgents } from "./detect";
import { resolveEnginesBinaryPath } from "./binary-path";
import { resolveForgeHome } from "../forge-home/forge-home";

// El primer test necesita forge614-engines instalado en la ruta fija del ecosistema; el segundo usa una ruta que no existe.
const binaryPath = resolveEnginesBinaryPath(process.platform, resolveForgeHome(process.env, homedir()));

/**
 * Comprueba `detectAgents` con el Engines real y con una ruta inválida.
 * Importa porque `init` depende de esta lista para elegir motor.
 */
describe("detectAgents", () => {
  /**
   * Comprueba que el Engines real devuelva una lista no vacía de agentes y que cada uno traiga `id` y `configDir` como texto e
   * `installed` y `configFound` como booleanos (no revisa `label` ni `executable`).
   * Importa porque confirma la forma de la respuesta que el resto de Atlas espera.
   */
  test("reports installed agents from the real forge614-engines binary", () => {
    const agents = detectAgents(binaryPath);

    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      expect(typeof agent.id).toBe("string");
      expect(typeof agent.installed).toBe("boolean");
      expect(typeof agent.configDir).toBe("string");
      expect(typeof agent.configFound).toBe("boolean");
    }
  });

  /**
   * Comprueba que una ruta de binario inexistente (`/nonexistent/forge614-engines`) haga que `detectAgents` lance; el expect solo
   * verifica que lanza, no el mensaje ni el tipo de error.
   * Importa para que `init` pueda convertir ese fallo en `ENGINES_UNREACHABLE`.
   */
  test("throws a clear error when the binary path does not exist", () => {
    expect(() => detectAgents("/nonexistent/forge614-engines")).toThrow();
  });

  /**
   * Comprueba que detectAgents valide que la respuesta contenga un arreglo 'agents'.
   */
  test("throws when the binary outputs JSON without an agents array", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-detect-fake-"));
    const script = join(dir, "fake-engines.sh");
    writeFileSync(script, '#!/bin/sh\necho "{\\"schemaVersion\\":1}"\n');
    chmodSync(script, 0o755);

    try {
      expect(() => detectAgents(script)).toThrow("forge614-engines detect failed: output did not contain an 'agents' array");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Comprueba que detectAgents valide que cada elemento en 'agents' contenga los campos obligatorios.
   */
  test("throws when an agent in agents array is missing required fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-detect-fake-"));
    const script = join(dir, "fake-engines.sh");
    writeFileSync(script, '#!/bin/sh\necho "{\\"agents\\":[{\\"id\\":\\"bad\\"}]}"\n');
    chmodSync(script, 0o755);

    try {
      expect(() => detectAgents(script)).toThrow("forge614-engines detect failed: invalid agent entry in 'agents'");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
