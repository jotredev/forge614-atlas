/**
 * Pregunta a Forge614 Engines qué sabe hacer un agente (por ejemplo, si puede correr sin pantalla o con ayudantes de solo
 * lectura) ejecutando `<binario de Engines> capabilities --agent <id>` y leyendo el JSON (texto con datos ordenados) que responde.
 * Existe para que Atlas no suponga lo que puede hacer cada agente: lo decide Engines.
 * Lo llama `init.ts` (en `src/modules/cli/`) para cada agente instalado, y `src/index.ts` reexporta `getCapabilities` y
 * `Capabilities`; el tipo `Capabilities` lo usan también `resolve-engine.ts`, `requirements.ts` y `dispatch-modules.ts`.
 * Piezas: `Capabilities` y `getCapabilities`.
 */
import { spawnSync } from "node:child_process";

/** Lo que Forge614 Engines declara que sabe hacer un agente. */
export interface Capabilities {
  /** Identificador del agente (por ejemplo `claude-code`) que Engines devuelve en su respuesta; `init` indexa por el `id` de la detección, no por este. */
  id: string;
  /** Nombre para mostrar del agente (por ejemplo `Claude Code`); Atlas no lo consulta hoy. */
  label: string;
  /** `true` si Engines declara que el agente admite MCP (el protocolo para darle herramientas externas); Atlas no lo consulta hoy. */
  supportsMcp: boolean;
  /** `true` si Engines declara que el agente admite hooks (comandos que se ejecutan en momentos fijos de su trabajo); Atlas no lo consulta hoy. */
  supportsHooks: boolean;
  /** `true` si el agente puede ejecutarse sin pantalla (headless: sin ventana ni persona delante); `resolveEngine` solo propone agentes con `true`. */
  supportsHeadlessExec: boolean;
  /** `true` si el agente acepta un nivel de razonamiento; `resolveTaskConfig` solo manda `reasoningLevel` a Workers cuando es `true`. */
  supportsReasoningLevel: boolean;
  /**
   * `true` solo si Engines garantiza ayudantes de solo lectura para este agente (Engines 1.17.0 o
   * posterior). Si Engines no trae el campo, se lee como `false`.
   * `checkDispatchRequirements` rechaza el inicio de `init` cuando no es `true`.
   */
  supportsReadOnly: boolean;
}

/**
 * Pregunta a Forge614 Engines qué sabe hacer un agente.
 * @param binaryPath Ruta del binario de Engines.
 * @param agentId Identificador del agente (por ejemplo `claude-code`).
 * @returns Las capacidades del agente; `supportsReadOnly` es `false` si Engines no lo informa.
 * @throws Error con el mensaje `forge614-engines capabilities failed for <agentId>: <detalle>` si Engines no arranca o sale con
 * código distinto de 0 (por ejemplo, si no conoce el agente); el detalle es su salida de error, o el mensaje de arranque, o
 * `exit code <n>`. También lanza el `SyntaxError` de `JSON.parse` si la respuesta no es un JSON válido.
 */
export function getCapabilities(binaryPath: string, agentId: string): Capabilities {
  // Corre `<binario> capabilities --agent <id>`, espera a que termine y lee su salida como texto.
  const result = spawnSync(binaryPath, ["capabilities", "--agent", agentId], { encoding: "utf8" });

  // Falla si el programa no pudo arrancar (`result.error`) o terminó con un código distinto de 0.
  if (result.error || result.status !== 0) {
    // Detalle, en este orden: lo que Engines escribió en su salida de error, el mensaje de arranque o el código de salida.
    const detail = result.stderr?.trim() || result.error?.message || `exit code ${result.status}`;
    throw new Error(`forge614-engines capabilities failed for ${agentId}: ${detail}`);
  }

  // La respuesta es un JSON; `supportsReadOnly` puede faltar si Engines es anterior a 1.17.0.
  const parsed = JSON.parse(result.stdout) as Omit<Capabilities, "supportsReadOnly"> & { supportsReadOnly?: boolean };
  // Solo un `true` explícito cuenta como garantía de solo lectura; un campo ausente se vuelve `false`.
  return { ...parsed, supportsReadOnly: parsed.supportsReadOnly === true };
}
