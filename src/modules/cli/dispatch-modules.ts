import type { MemoryStore, Session } from "forge614-engram";
import type { Capabilities } from "../engines-client/capabilities";
import type { FinalReport } from "../memory/finalize-run";
import { resolveModuleFiles } from "./module-files";
import { resolveTaskConfig } from "./task-config";
import { buildAnalysisPrompt } from "./analysis-prompt";
import { runWorkersBatch, type WorkersTask, type WorkersEvent } from "../workers-client/run-batch";
import { recordModuleReport } from "../memory/module-report";
import { recordPause } from "../memory/pause-count";

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

  const onEvent = (event: WorkersEvent) => {
    if (event.event === "task_completed") {
      recordModuleReport(store, directory, session, event.taskId, event.stdout);
      analyzedModuleNames.push(event.taskId);
    } else if (event.event === "task_failed") {
      skippedModuleNames.push(event.taskId);
    } else if (event.event === "quota_exhausted") {
      quotaExhausted = true;
    } else if (event.event === "fatal_error") {
      fatalErrorMessage = `${event.reason}: ${event.message}`;
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

  return {
    status: "completed",
    report: {
      repoName: directory,
      tierBreakdown,
      engineByTier,
      totalWorkersByTier,
      tokensConsumed: 0,
      totalTimeMs: 0,
      pauseCount: 0,
      analyzedModuleNames,
      skippedModuleNames,
    },
  };
}
