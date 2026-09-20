import { startProjectSession, type MemoryStore } from "forge614-engram";
import { detectAgents, type AgentDetection } from "../engines-client/detect";
import { getCapabilities, type Capabilities } from "../engines-client/capabilities";
import { resolveEngine } from "./resolve-engine";
import { deriveForcedSessionId } from "../memory/session-id";
import { startOrResumeSession } from "../memory/run-state";
import { buildRunPlan } from "./build-run-plan";

export interface RunInitOptions {
  directory: string;
  enginesBinaryPath: string;
  requestedEngineId?: string;
  force: boolean;
}

export type InitOutcome =
  | {
      schemaVersion: 1;
      status: "ready";
      engine: { id: string; executable: string };
      session: { sessionId: string; resumed: boolean };
      modules: { name: string; tier: "ligero" | "estandar" | "profundo" }[];
    }
  | { schemaVersion: 1; status: "already-complete" }
  | { schemaVersion: 1; status: "engine-ambiguous"; candidates: { id: string; executable: string }[] }
  | { schemaVersion: 1; status: "engine-unavailable" }
  | { schemaVersion: 1; status: "engine-invalid"; requestedId: string; candidates: { id: string; executable: string }[] }
  | { schemaVersion: 1; status: "error"; error: { code: "ENGINES_UNREACHABLE" | "ANALYSIS_FAILED"; message: string } };

function failure(code: "ENGINES_UNREACHABLE" | "ANALYSIS_FAILED", error: unknown): InitOutcome {
  return {
    schemaVersion: 1,
    status: "error",
    error: { code, message: error instanceof Error ? error.message : String(error) },
  };
}

export function runInitCommand(store: MemoryStore, options: RunInitOptions): InitOutcome {
  let agents: AgentDetection[];
  try {
    agents = detectAgents(options.enginesBinaryPath);
  } catch (error) {
    return failure("ENGINES_UNREACHABLE", error);
  }

  const capabilitiesById = new Map<string, Capabilities>();
  try {
    for (const agent of agents) {
      if (!agent.installed) continue;
      capabilitiesById.set(agent.id, getCapabilities(options.enginesBinaryPath, agent.id));
    }
  } catch (error) {
    return failure("ENGINES_UNREACHABLE", error);
  }

  const resolution = resolveEngine(agents, capabilitiesById, options.requestedEngineId);
  if (resolution.status !== "resolved") {
    return { schemaVersion: 1, ...resolution };
  }
  const engine = { id: resolution.id, executable: resolution.executable };

  if (options.force) {
    const sessionId = deriveForcedSessionId(options.directory);
    const session = startProjectSession(store, options.directory, sessionId);
    let plan;
    try {
      plan = buildRunPlan(store, session.projectId, options.directory, { skipCompleted: false });
    } catch (error) {
      return failure("ANALYSIS_FAILED", error);
    }
    return {
      schemaVersion: 1,
      status: "ready",
      engine,
      session: { sessionId: session.sessionId, resumed: false },
      modules: plan.modules,
    };
  }

  const runState = startOrResumeSession(store, options.directory);
  if (runState.status === "already-complete") {
    return { schemaVersion: 1, status: "already-complete" };
  }

  let plan;
  try {
    plan = buildRunPlan(store, runState.session.projectId, options.directory, { skipCompleted: true });
  } catch (error) {
    return failure("ANALYSIS_FAILED", error);
  }
  return {
    schemaVersion: 1,
    status: "ready",
    engine,
    session: { sessionId: runState.session.sessionId, resumed: plan.resumed },
    modules: plan.modules,
  };
}
