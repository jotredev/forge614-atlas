import { startProjectSession, type MemoryStore, type Session } from "forge614-engram";
import { accessSync, constants } from "node:fs";
import { detectAgents, type AgentDetection } from "../engines-client/detect";
import { getCapabilities, type Capabilities } from "../engines-client/capabilities";
import { resolveEngine } from "./resolve-engine";
import { deriveForcedSessionId } from "../memory/session-id";
import { startOrResumeSession } from "../memory/run-state";
import { buildRunPlan } from "./build-run-plan";
import { dispatchModules } from "./dispatch-modules";
import type { FinalReport } from "../memory/finalize-run";

export interface RunInitOptions {
  directory: string;
  enginesBinaryPath: string;
  workersBinaryPath: string;
  requestedEngineId?: string;
  force: boolean;
}

export type InitOutcome =
  | {
      schemaVersion: 1;
      status: "completed";
      engine: { id: string; executable: string };
      session: { sessionId: string; resumed: boolean };
      report: FinalReport;
    }
  | {
      schemaVersion: 1;
      status: "paused";
      engine: { id: string; executable: string };
      session: { sessionId: string; resumed: boolean };
      analyzedCount: number;
      pendingCount: number;
    }
  | { schemaVersion: 1; status: "already-complete" }
  | { schemaVersion: 1; status: "engine-ambiguous"; candidates: { id: string; executable: string }[] }
  | { schemaVersion: 1; status: "engine-unavailable" }
  | { schemaVersion: 1; status: "engine-invalid"; requestedId: string; candidates: { id: string; executable: string }[] }
  | {
      schemaVersion: 1;
      status: "error";
      error: { code: "ENGINES_UNREACHABLE" | "ANALYSIS_FAILED" | "WORKERS_UNREACHABLE" | "WORKERS_FATAL_ERROR"; message: string };
    };

function failure(
  code: "ENGINES_UNREACHABLE" | "ANALYSIS_FAILED" | "WORKERS_UNREACHABLE" | "WORKERS_FATAL_ERROR",
  error: unknown,
): InitOutcome {
  return {
    schemaVersion: 1,
    status: "error",
    error: { code, message: error instanceof Error ? error.message : String(error) },
  };
}

function assertWorkersReachable(workersBinaryPath: string): void {
  accessSync(workersBinaryPath, constants.X_OK);
}

async function runDispatch(
  store: MemoryStore,
  options: RunInitOptions,
  engine: { id: string; executable: string },
  capabilities: Capabilities,
  sessionId: string,
  resumed: boolean,
  session: Session,
  modules: { name: string; tier: "ligero" | "estandar" | "profundo" }[],
): Promise<InitOutcome> {
  try {
    assertWorkersReachable(options.workersBinaryPath);
  } catch (error) {
    return failure("WORKERS_UNREACHABLE", error);
  }

  let result: Awaited<ReturnType<typeof dispatchModules>>;
  try {
    result = await dispatchModules(
      store,
      options.directory,
      session,
      options.workersBinaryPath,
      options.enginesBinaryPath,
      engine,
      capabilities,
      modules,
    );
  } catch (error) {
    return failure("WORKERS_FATAL_ERROR", error);
  }

  if (result.status === "fatal_error") {
    return {
      schemaVersion: 1,
      status: "error",
      error: { code: "WORKERS_FATAL_ERROR", message: result.message },
    };
  }

  if (result.status === "paused") {
    return {
      schemaVersion: 1,
      status: "paused",
      engine,
      session: { sessionId, resumed },
      analyzedCount: result.analyzedCount,
      pendingCount: result.pendingCount,
    };
  }

  return {
    schemaVersion: 1,
    status: "completed",
    engine,
    session: { sessionId, resumed },
    report: result.report,
  };
}

export async function runInitCommand(store: MemoryStore, options: RunInitOptions): Promise<InitOutcome> {
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
  const capabilities = capabilitiesById.get(resolution.id)!;

  if (options.force) {
    const sessionId = deriveForcedSessionId(options.directory);
    const session = startProjectSession(store, options.directory, sessionId);
    let plan;
    try {
      plan = buildRunPlan(store, session.projectId, options.directory, { skipCompleted: false });
    } catch (error) {
      return failure("ANALYSIS_FAILED", error);
    }
    return runDispatch(store, options, engine, capabilities, session.sessionId, false, session, plan.modules);
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
  return runDispatch(
    store,
    options,
    engine,
    capabilities,
    runState.session.sessionId,
    plan.resumed,
    runState.session,
    plan.modules,
  );
}
