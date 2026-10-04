import { startProjectSession, type MemoryStore, type Session } from "forge614-engram";
import { detectAgents, type AgentDetection } from "../engines-client/detect";
import { getCapabilities, type Capabilities } from "../engines-client/capabilities";
import { resolveEngine } from "./resolve-engine";
import { deriveForcedSessionId } from "../memory/session-id";
import { startOrResumeSession } from "../memory/run-state";
import { buildRunPlan } from "./build-run-plan";
import { dispatchModules } from "./dispatch-modules";
import type { FinalReport } from "../memory/finalize-run";
import { checkDispatchRequirements, readOnlyUnsupportedMessage } from "./requirements";

/** Opciones de `init`. */
export interface RunInitOptions {
  directory: string;
  enginesBinaryPath: string;
  workersBinaryPath: string;
  requestedEngineId?: string;
  force: boolean;
  /** Tope, en milisegundos, para `forge614-workers --version` al iniciar (por defecto 10 s); se baja en las pruebas. */
  workersVersionTimeoutMs?: number;
}

/** Códigos de error que `init` puede devolver en su sobre de error. */
export type InitErrorCode =
  | "ENGINES_UNREACHABLE"
  | "ANALYSIS_FAILED"
  | "WORKERS_UNREACHABLE"
  | "WORKERS_FATAL_ERROR"
  | "READ_ONLY_UNSUPPORTED"
  | "WORKERS_OUTDATED";

/** Todo lo que `init` puede responder; cada variante lleva `schemaVersion: 1`. */
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
      error: { code: InitErrorCode; message: string };
    };

function failure(code: InitErrorCode, error: unknown): InitOutcome {
  return {
    schemaVersion: 1,
    status: "error",
    error: { code, message: error instanceof Error ? error.message : String(error) },
  };
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

  // Segunda defensa: la comprobación al iniciar ya pasó, pero Workers se negó a correr las tareas
  // por falta de candado de solo lectura. Es un error, no módulos omitidos.
  if (result.status === "read_only_unsupported") {
    return failure("READ_ONLY_UNSUPPORTED", readOnlyUnsupportedMessage(engine.id));
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

/**
 * Ejecuta `init`: detecta y elige el motor, comprueba los requisitos de solo lectura (antes de abrir
 * ninguna sesión de Engram), arma el plan de módulos y lo despacha a Workers.
 * @param store Memoria de Engram.
 * @param options Carpeta del proyecto, rutas de los binarios y opciones del comando.
 * @returns El resultado de `init` en la forma JSON con `schemaVersion: 1` que imprime el CLI.
 */
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

  // Antes de tocar Engram: sin candado de solo lectura garantizado no se manda ningún ayudante.
  const unmet = checkDispatchRequirements({
    engineId: engine.id,
    capabilities,
    workersBinaryPath: options.workersBinaryPath,
    workersVersionTimeoutMs: options.workersVersionTimeoutMs,
  });
  if (unmet) return failure(unmet.code, unmet.message);

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
