/**
 * Pruebas de `detectAgents` con el Forge614 Engines real instalado en la ruta fija del ecosistema, más un caso con una ruta
 * que no existe.
 * Comprueban la forma de la respuesta (lista no vacía de agentes con `id`, `installed`, `configDir` y `configFound`) y que un
 * binario inexistente haga lanzar un error.
 */
import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { detectAgents } from "./detect";
import { resolveEnginesBinaryPath } from "./binary-path";
import { resolveForgeHome } from "../forge-home/forge-home";

// Estos tests requieren forge614-engines instalado en la ruta fija del
// ecosistema (confirmado presente en esta máquina de desarrollo).
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
});
