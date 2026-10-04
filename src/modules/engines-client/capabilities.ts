import { spawnSync } from "node:child_process";

/** Lo que Forge614 Engines declara que sabe hacer un agente. */
export interface Capabilities {
  id: string;
  label: string;
  supportsMcp: boolean;
  supportsHooks: boolean;
  supportsHeadlessExec: boolean;
  supportsReasoningLevel: boolean;
  /**
   * `true` solo si Engines garantiza ayudantes de solo lectura para este agente (Engines 1.17.0 o
   * posterior). Si Engines no trae el campo, se lee como `false`.
   */
  supportsReadOnly: boolean;
}

/**
 * Pregunta a Forge614 Engines qué sabe hacer un agente.
 * @param binaryPath Ruta del binario de Engines.
 * @param agentId Identificador del agente (por ejemplo `claude-code`).
 * @returns Las capacidades del agente; `supportsReadOnly` es `false` si Engines no lo informa.
 * @throws Error si Engines no arranca, sale con error o no conoce el agente.
 */
export function getCapabilities(binaryPath: string, agentId: string): Capabilities {
  const result = spawnSync(binaryPath, ["capabilities", "--agent", agentId], { encoding: "utf8" });

  if (result.error || result.status !== 0) {
    const detail = result.stderr?.trim() || result.error?.message || `exit code ${result.status}`;
    throw new Error(`forge614-engines capabilities failed for ${agentId}: ${detail}`);
  }

  const parsed = JSON.parse(result.stdout) as Omit<Capabilities, "supportsReadOnly"> & { supportsReadOnly?: boolean };
  return { ...parsed, supportsReadOnly: parsed.supportsReadOnly === true };
}
