/**
 * Pregunta a Forge614 Engines qué agentes de programación hay (por ejemplo Claude Code o Codex) ejecutando
 * `<binario de Engines> detect` y leyendo el JSON (texto con datos ordenados) que responde.
 * Existe para que Atlas sepa cuáles están instalados y dónde está su ejecutable, en vez de adivinarlo.
 * Lo llama `init.ts` (en `src/modules/cli/`); `resolve-engine.ts` usa el tipo `AgentDetection`, y `src/index.ts` reexporta
 * `detectAgents` y `AgentDetection`.
 * Piezas: `AgentDetection` y `detectAgents`.
 */
import { spawnSync } from "node:child_process";

/** Un agente tal como lo informa Forge614 Engines: si está instalado, dónde está su programa y su carpeta de configuración. */
export interface AgentDetection {
  /** Identificador del agente (por ejemplo `claude-code`). */
  id: string;
  /** Nombre para mostrar (por ejemplo `Claude Code`); Atlas no lo consulta hoy. */
  label: string;
  /** `true` si Engines dio el agente por instalado; `init` solo pide capacidades de los instalados y `resolveEngine` solo propone esos. */
  installed: boolean;
  /** Ruta del programa del agente; puede faltar, y `resolveEngine` descarta al agente que no la trae. */
  executable?: string;
  /** Carpeta de configuración del agente que Engines informa; Atlas no la consulta hoy. */
  configDir: string;
  /** Lo que Engines informa sobre si esa carpeta de configuración existe; Atlas no lo consulta hoy. */
  configFound: boolean;
}

/**
 * Pregunta a Forge614 Engines qué agentes hay y cuáles están instalados.
 * @param binaryPath Ruta del binario de Engines (ver `resolveEnginesBinaryPath`).
 * @returns La lista `agents` que Engines responde, tal cual: no se valida su forma.
 * @throws Error con el mensaje `forge614-engines detect failed: <detalle>` si Engines no arranca o sale con código distinto
 * de 0; el detalle es su salida de error, o el mensaje de arranque, o `exit code <n>`. También lanza el `SyntaxError` de
 * `JSON.parse` si la respuesta no es un JSON válido.
 */
export function detectAgents(binaryPath: string): AgentDetection[] {
  // Corre `<binario> detect`, espera a que termine y lee su salida como texto.
  const result = spawnSync(binaryPath, ["detect"], { encoding: "utf8" });

  // Falla si el programa no pudo arrancar (`result.error`) o terminó con un código distinto de 0.
  if (result.error || result.status !== 0) {
    // Detalle, en este orden: lo que Engines escribió en su salida de error, el mensaje de arranque o el código de salida.
    const detail = result.stderr?.trim() || result.error?.message || `exit code ${result.status}`;
    throw new Error(`forge614-engines detect failed: ${detail}`);
  }

  // La respuesta es un JSON con la lista en `agents`; se devuelve sin revisar que cada agente traiga todos sus campos.
  const parsed = JSON.parse(result.stdout) as { agents: AgentDetection[] };
  return parsed.agents;
}
