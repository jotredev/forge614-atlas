/**
 * Prueba cómo Atlas filtra las detecciones y capacidades de Engines para decidir si puede usar un motor sin pantalla.
 * Los agentes son datos locales de prueba: ningún binario de Engines se ejecuta en estos casos.
 */
import { describe, expect, test } from "bun:test";
import { resolveEngine } from "./resolve-engine";
import type { AgentDetection } from "../engines-client/detect";
import type { Capabilities } from "../engines-client/capabilities";

/**
 * Crea una detección mínima de Engines. @param id Identificador del agente. @param installed Si está instalado. @param executable Ruta opcional.
 * @returns La detección que consume `resolveEngine`.
 */
function agent(id: string, installed: boolean, executable?: string): AgentDetection {
  return { id, label: id, installed, executable, configDir: `/home/.${id}`, configFound: installed };
}

/**
 * Crea las capacidades mínimas de un motor. @param id Identificador del agente. @param supportsHeadlessExec Si puede ejecutarse sin pantalla.
 * @returns El objeto de capacidades que filtra candidatos.
 */
function capabilities(id: string, supportsHeadlessExec: boolean): Capabilities {
  // Engines 1.16.0+ acepta nivel de razonamiento en claude-code y en codex.
  const supportsReasoningLevel = id === "claude-code" || id === "codex";
  return { id, label: id, supportsMcp: true, supportsHooks: true, supportsHeadlessExec, supportsReasoningLevel, supportsReadOnly: true };
}

/** Agrupa la resolución automática, solicitada y fallida de un motor apto para Workers. */
describe("resolveEngine", () => {
  /** Comprueba que un único candidato instalado, ejecutable y headless se resuelve automáticamente aunque otro no sea headless. */
  test("auto-resolves when exactly one installed agent supports headless exec", () => {
    const agents = [agent("claude-code", true, "/bin/claude"), agent("example-agent", true, "/bin/example-agent")];
    const capsById = new Map([
      ["claude-code", capabilities("claude-code", true)],
      ["example-agent", capabilities("example-agent", false)],
    ]);

    const result = resolveEngine(agents, capsById);

    expect(result).toEqual({ status: "resolved", id: "claude-code", executable: "/bin/claude" });
  });

  /** Comprueba que un agente instalado sin capacidad headless no se propone y produce `engine-unavailable`. */
  test("reports engine-unavailable when no installed agent supports headless exec", () => {
    const agents = [agent("example-agent", true, "/bin/example-agent")];
    const capsById = new Map([["example-agent", capabilities("example-agent", false)]]);

    expect(resolveEngine(agents, capsById)).toEqual({ status: "engine-unavailable" });
  });

  /** Comprueba que dos candidatos válidos no se eligen arbitrariamente y se devuelven ambos en su orden de entrada. */
  test("reports engine-ambiguous when two or more candidates support headless exec", () => {
    const agents = [agent("claude-code", true, "/bin/claude"), agent("codex", true, "/bin/codex")];
    const capsById = new Map([
      ["claude-code", capabilities("claude-code", true)],
      ["codex", capabilities("codex", true)],
    ]);

    const result = resolveEngine(agents, capsById);

    expect(result.status).toBe("engine-ambiguous");
    if (result.status === "engine-ambiguous") {
      expect(result.candidates).toEqual([
        { id: "claude-code", executable: "/bin/claude" },
        { id: "codex", executable: "/bin/codex" },
      ]);
    }
  });

  /** Comprueba que `codex` se resuelve cuando se pide explícitamente y aparece entre dos candidatos válidos. */
  test("resolves to the explicitly requested engine when it is a valid candidate", () => {
    const agents = [agent("claude-code", true, "/bin/claude"), agent("codex", true, "/bin/codex")];
    const capsById = new Map([
      ["claude-code", capabilities("claude-code", true)],
      ["codex", capabilities("codex", true)],
    ]);

    const result = resolveEngine(agents, capsById, "codex");

    expect(result).toEqual({ status: "resolved", id: "codex", executable: "/bin/codex" });
  });

  /** Comprueba que un identificador pedido inexistente da `engine-invalid` y conserva el único candidato real como ayuda. */
  test("reports engine-invalid when the requested engine is not a real candidate, even with only one real candidate", () => {
    const agents = [agent("claude-code", true, "/bin/claude")];
    const capsById = new Map([["claude-code", capabilities("claude-code", true)]]);

    const result = resolveEngine(agents, capsById, "not-a-real-engine");

    expect(result.status).toBe("engine-invalid");
    if (result.status === "engine-invalid") {
      expect(result.requestedId).toBe("not-a-real-engine");
      expect(result.candidates).toEqual([{ id: "claude-code", executable: "/bin/claude" }]);
    }
  });

  /** Comprueba que un agente no instalado queda fuera aunque sus capacidades indiquen ejecución headless. */
  test("never proposes an agent that is not installed or lacks an executable path", () => {
    const agents = [agent("claude-code", false)];
    const capsById = new Map([["claude-code", capabilities("claude-code", true)]]);

    expect(resolveEngine(agents, capsById)).toEqual({ status: "engine-unavailable" });
  });

  /** Comprueba que un agente instalado sin ruta ejecutable queda fuera aunque reporte soporte headless. */
  test("excludes an installed agent with no executable, even when capabilities report headless support", () => {
    const agents = [agent("claude-code", true)];
    const capsById = new Map([["claude-code", capabilities("claude-code", true)]]);

    expect(resolveEngine(agents, capsById)).toEqual({ status: "engine-unavailable" });
  });

  /** Comprueba que una detección sin entrada de capacidades no se trata como soporte headless implícito. */
  test("excludes an installed agent with an executable whose id is missing from capabilitiesById", () => {
    const agents = [agent("claude-code", true, "/bin/claude")];
    const capsById = new Map<string, ReturnType<typeof capabilities>>();

    expect(resolveEngine(agents, capsById)).toEqual({ status: "engine-unavailable" });
  });
});
