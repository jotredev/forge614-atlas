/**
 * Pruebas de `getCapabilities`: tres usan el Forge614 Engines real instalado en la ruta fija del ecosistema (las dos de
 * `claude-code` y la del agente inexistente) y dos usan un Engines falso (`writeFakeEngines`) para controlar si
 * `supportsReadOnly` viene como `true`, como `false` o ausente.
 * Comprueban los campos que declara Engines para `claude-code`, la lectura de `supportsReadOnly` y el error con un agente desconocido.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { homedir } from "node:os";
import { getCapabilities } from "./capabilities";
import { resolveEnginesBinaryPath } from "./binary-path";
import { resolveForgeHome } from "../forge-home/forge-home";
import { makeFakeDir, writeFakeEngines } from "../cli/fake-binaries.testkit";

const binaryPath = resolveEnginesBinaryPath(process.platform, resolveForgeHome(process.env, homedir()));

/**
 * Comprueba `getCapabilities` con el Engines real y con uno falso.
 * Importa porque de estos campos depende qué agente se elige y si `init` deja correr ayudantes de solo lectura.
 */
describe("getCapabilities", () => {
  const fakeDirs: string[] = [];
  // Borra las carpetas temporales que crearon las pruebas con Engines falso.
  afterEach(() => {
    for (const dir of fakeDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Comprueba que el Engines real conteste para `claude-code` con `id` igual a `claude-code` y con `supportsMcp`, `supportsHooks`
   * y `supportsHeadlessExec` como booleanos (no revisa sus valores).
   * Importa porque confirma que la respuesta real tiene la forma que `getCapabilities` espera.
   */
  test("reports supportsHeadlessExec for claude-code from the real binary", () => {
    const capabilities = getCapabilities(binaryPath, "claude-code");

    expect(capabilities.id).toBe("claude-code");
    expect(typeof capabilities.supportsMcp).toBe("boolean");
    expect(typeof capabilities.supportsHooks).toBe("boolean");
    expect(typeof capabilities.supportsHeadlessExec).toBe("boolean");
  });

  /**
   * Comprueba que el Engines real (1.17.0 o posterior) dé `true` en `supportsReadOnly` y en `supportsReasoningLevel` para `claude-code`.
   * Importa porque `init` rechaza el inicio si `supportsReadOnly` no es `true`, y `resolveTaskConfig` solo manda el nivel de
   * razonamiento si el agente lo acepta.
   */
  test("the real Engines (1.17.0+) guarantees read-only helpers and reasoning levels for claude-code", () => {
    const capabilities = getCapabilities(binaryPath, "claude-code");

    expect(capabilities.supportsReadOnly).toBe(true);
    expect(capabilities.supportsReasoningLevel).toBe(true);
  });

  /**
   * Comprueba que, si la respuesta no trae `supportsReadOnly` (como un Engines anterior a 1.17.0), `getCapabilities` lo lea como `false`.
   * Importa porque ese `false` es lo que hace que `init` pida actualizar Engines en lugar de correr sin candado de solo lectura.
   */
  test("reads a missing supportsReadOnly (Engines older than 1.17.0) as false", () => {
    const dir = makeFakeDir("atlas-capabilities-");
    fakeDirs.push(dir);
    const fakeEngines = writeFakeEngines(dir, { supportsReadOnly: "absent" });

    expect(getCapabilities(fakeEngines, "claude-code").supportsReadOnly).toBe(false);
  });

  /**
   * Comprueba que un Engines falso que informa `supportsReadOnly: true` dé `true` y otro que informa `false` dé `false`.
   * Importa porque la lectura debe respetar lo que Engines declara y no volver todo `false`.
   */
  test("keeps a reported supportsReadOnly: true and: false as they are", () => {
    const dir = makeFakeDir("atlas-capabilities-");
    fakeDirs.push(dir);
    const trueEngines = writeFakeEngines(dir, { supportsReadOnly: true });
    expect(getCapabilities(trueEngines, "claude-code").supportsReadOnly).toBe(true);

    const otherDir = makeFakeDir("atlas-capabilities-");
    fakeDirs.push(otherDir);
    const falseEngines = writeFakeEngines(otherDir, { supportsReadOnly: false });
    expect(getCapabilities(falseEngines, "claude-code").supportsReadOnly).toBe(false);
  });

  /**
   * Comprueba que pedir un agente inexistente (`not-a-real-agent`) al Engines real haga que `getCapabilities` lance; el expect solo
   * verifica que lanza, no el mensaje ni el tipo de error.
   * Importa para que un identificador mal escrito sea un error y no unas capacidades vacías.
   */
  test("throws a clear error for an unknown agent id", () => {
    expect(() => getCapabilities(binaryPath, "not-a-real-agent")).toThrow();
  });
});
