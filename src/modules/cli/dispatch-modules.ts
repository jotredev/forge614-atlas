import type { MemoryStore, Session } from "forge614-engram";
import type { Capabilities } from "../engines-client/capabilities";
import type { FinalReport } from "../memory/finalize-run";
import { resolveModuleFiles } from "./module-files";
import { resolveTaskConfig } from "./task-config";
import { buildAnalysisPrompt } from "./analysis-prompt";
import { runWorkersBatch, type WorkersTask, type WorkersEvent } from "../workers-client/run-batch";
import { recordModuleReport } from "../memory/module-report";
import { readPauseCount, recordPause } from "../memory/pause-count";
import { finalizeRun } from "../memory/finalize-run";

type Tier = "ligero" | "estandar" | "profundo";
type ReportTier = "deep" | "standard" | "light";

const TIER_TO_REPORT_TIER: Record<Tier, ReportTier> = {
  profundo: "deep",
  estandar: "standard",
  ligero: "light",
};

const TIER_DISPATCH_ORDER: Tier[] = ["profundo", "estandar", "ligero"];

export type DispatchResult =
  | { status: "completed"; report: FinalReport }
  | { status: "paused"; analyzedCount: number; pendingCount: number }
  | { status: "fatal_error"; message: string };

export async function dispatchModules(
  store: MemoryStore,
  directory: string,
  session: Session,
  workersBinaryPath: string,
  enginesBinaryPath: string,
  engine: { id: string; executable: string },
  capabilities: Capabilities,
  modules: { name: string; tier: Tier }[],
): Promise<DispatchResult> {
  const orderedModules = [...modules].sort(
    (a, b) => TIER_DISPATCH_ORDER.indexOf(a.tier) - TIER_DISPATCH_ORDER.indexOf(b.tier),
  );
  const filesByModule = resolveModuleFiles(directory, orderedModules.map(m => m.name));

  const tasks: WorkersTask[] = orderedModules.map(module => {
    const config = resolveTaskConfig(module.tier, engine.id, capabilities);
    return {
      id: module.name,
      agentId: engine.id,
      executable: engine.executable,
      prompt: buildAnalysisPrompt(module.name, filesByModule.get(module.name) ?? []),
      readableDir: directory,
      model: config.model,
      ...(config.reasoningLevel ? { reasoningLevel: config.reasoningLevel } : {}),
    };
  });

  const tierByModuleName = new Map(orderedModules.map(m => [m.name, m.tier]));
  const analyzedModuleNames: string[] = [];
  const skippedModuleNames: string[] = [];
  let quotaExhausted = false;
  let fatalErrorMessage: string | undefined;
  let runCompletedEvent: Extract<WorkersEvent, { event: "run_completed" }> | undefined;

  const onEvent = (event: WorkersEvent) => {
    if (event.event === "task_completed") {
      if (event.stdoutTruncated) {
        skippedModuleNames.push(event.taskId);
      } else {
        recordModuleReport(store, directory, session, event.taskId, event.stdout);
        analyzedModuleNames.push(event.taskId);
      }
    } else if (event.event === "task_failed") {
      skippedModuleNames.push(event.taskId);
    } else if (event.event === "quota_exhausted") {
      quotaExhausted = true;
    } else if (event.event === "fatal_error") {
      fatalErrorMessage = `${event.reason}: ${event.message}`;
    } else if (event.event === "run_completed") {
      runCompletedEvent = event;
    }
  };

  await runWorkersBatch(workersBinaryPath, enginesBinaryPath, tasks, onEvent);

  if (fatalErrorMessage) {
    return { status: "fatal_error", message: fatalErrorMessage };
  }

  if (quotaExhausted) {
    recordPause(store, directory, session);
    return {
      status: "paused",
      analyzedCount: analyzedModuleNames.length,
      pendingCount: orderedModules.length - analyzedModuleNames.length,
    };
  }

  const tierBreakdown: Record<ReportTier, number> = { deep: 0, standard: 0, light: 0 };
  const engineByTier: Record<ReportTier, string> = { deep: engine.id, standard: engine.id, light: engine.id };
  const totalWorkersByTier: Record<ReportTier, number> = { deep: 0, standard: 0, light: 0 };
  for (const name of analyzedModuleNames) {
    const tier = tierByModuleName.get(name);
    if (!tier) continue;
    const reportTier = TIER_TO_REPORT_TIER[tier];
    tierBreakdown[reportTier] += 1;
    totalWorkersByTier[reportTier] += 1;
  }

  const report: FinalReport = {
    repoName: directory,
    tierBreakdown,
    engineByTier,
    totalWorkersByTier,
    // Deliberado: Workers nunca interpreta el contenido de la respuesta de la IA (por diseño,
    // documentado en la spec de Workers), así que Atlas no tiene de dónde sacar un conteo real de tokens hoy.
    tokensConsumed: 0,
    totalTimeMs: runCompletedEvent?.totalDurationMs ?? 0,
    pauseCount: readPauseCount(store, session.projectId),
    analyzedModuleNames,
    skippedModuleNames,
  };
  finalizeRun(store, session, report);
  return { status: "completed", report };
}
