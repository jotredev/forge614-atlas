/**
 * Reduce la detección de Engines a un único motor apto para ejecutar tareas sin pantalla, o a la razón por la que no puede elegirlo.
 * La selección parte siempre de los datos actuales de Engines, incluso si quien invoca `init` pidió un identificador concreto.
 */
import type { AgentDetection } from "../engines-client/detect";
import type { Capabilities } from "../engines-client/capabilities";

/** Resultado de resolver el motor: elegido, inexistente, ambiguo o distinto del identificador solicitado. */
export type EngineResolution =
  | { status: "resolved"; id: string; executable: string }
  | { status: "engine-ambiguous"; candidates: { id: string; executable: string }[] }
  | { status: "engine-unavailable" }
  | { status: "engine-invalid"; requestedId: string; candidates: { id: string; executable: string }[] };

/**
 * Elige el motor solicitado o el único candidato instalado que Engines declara capaz de ejecución sin pantalla (headless).
 * @param agents Detecciones de Engines; solo pasan los agentes instalados que además exponen una ruta ejecutable.
 * @param capabilitiesById Capacidades obtenidas de Engines por identificador; `supportsHeadlessExec` filtra los candidatos.
 * @param requestedId Identificador recibido con `--engine`; si no coincide con un candidato se devuelve `engine-invalid`.
 * @returns El motor resuelto; `engine-invalid` (con la lista de candidatos, que puede estar vacía) si se pidió un identificador
 * que no es candidato; `engine-ambiguous` (con la lista) si no se pidió ninguno y hay dos o más candidatos; o
 * `engine-unavailable` si no se pidió ninguno y no hay candidatos.
 */
export function resolveEngine(
  agents: AgentDetection[],
  capabilitiesById: Map<string, Capabilities>,
  requestedId?: string,
): EngineResolution {
  const candidates = agents
    .filter(agent => agent.installed && agent.executable !== undefined)
    .filter(agent => capabilitiesById.get(agent.id)?.supportsHeadlessExec === true)
    .map(agent => ({ id: agent.id, executable: agent.executable! }));

  if (requestedId !== undefined) {
    const match = candidates.find(candidate => candidate.id === requestedId);
    if (match) return { status: "resolved", id: match.id, executable: match.executable };
    return { status: "engine-invalid", requestedId, candidates };
  }

  if (candidates.length === 1) {
    return { status: "resolved", id: candidates[0]!.id, executable: candidates[0]!.executable };
  }
  if (candidates.length === 0) {
    return { status: "engine-unavailable" };
  }
  return { status: "engine-ambiguous", candidates };
}
