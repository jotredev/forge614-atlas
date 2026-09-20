import type { AgentDetection } from "../engines-client/detect";
import type { Capabilities } from "../engines-client/capabilities";

export type EngineResolution =
  | { status: "resolved"; id: string; executable: string }
  | { status: "engine-ambiguous"; candidates: { id: string; executable: string }[] }
  | { status: "engine-unavailable" }
  | { status: "engine-invalid"; requestedId: string; candidates: { id: string; executable: string }[] };

/**
 * Engines es siempre la fuente de verdad: incluso con requestedId, se
 * valida contra la lista real de candidatos (instalados + soporte
 * headless), nunca se confía el flag a ciegas.
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
