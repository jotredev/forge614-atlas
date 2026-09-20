import type { MemoryStore } from "forge614-engram";
import { discoverModules } from "../scoring/discovery";
import { computeCyclomaticComplexity } from "../scoring/cyclomatic";
import { computeFanIn } from "../scoring/fan-in";
import { computeChurn } from "../scoring/churn";
import { computeTestCoverageGap } from "../scoring/test-coverage-gap";
import { computeCompositeScores, type ModuleSignals } from "../scoring/composite-score";
import { assignTiers, type Tier } from "../scoring/tiers";
import { isModuleReportSaved } from "../memory/run-state";

export interface RunPlanModule {
  name: string;
  tier: Tier;
}

export interface RunPlanResult {
  modules: RunPlanModule[];
  resumed: boolean;
}

export function buildRunPlan(
  store: MemoryStore,
  projectId: string,
  directory: string,
  options: { skipCompleted: boolean },
): RunPlanResult {
  const modules = discoverModules(directory);
  if (modules.length === 0) {
    return { modules: [], resumed: false };
  }

  const cyclomatic = computeCyclomaticComplexity(modules);
  const fanIn = computeFanIn(modules);
  const churn = computeChurn(directory, modules);
  const testGap = computeTestCoverageGap(modules);

  const signals: ModuleSignals[] = modules.map(module => ({
    name: module.name,
    cyclomatic: cyclomatic.get(module.name) ?? 0,
    fanIn: fanIn.get(module.name) ?? 0,
    churn: churn.get(module.name) ?? 0,
    testGap: testGap.get(module.name) ?? 0,
  }));

  const tiered = assignTiers(computeCompositeScores(signals));

  const pending = options.skipCompleted
    ? tiered.filter(module => !isModuleReportSaved(store, projectId, module.name))
    : tiered;

  return {
    modules: pending.map(module => ({ name: module.name, tier: module.tier })),
    resumed: options.skipCompleted && pending.length < tiered.length,
  };
}
