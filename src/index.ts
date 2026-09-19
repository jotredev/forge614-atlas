export { discoverModules, isTestFile } from "./modules/scoring/discovery";
export type { ModuleDescriptor } from "./modules/scoring/discovery";

export { fileCyclomaticComplexity, computeCyclomaticComplexity } from "./modules/scoring/cyclomatic";

export { computeFanIn } from "./modules/scoring/fan-in";

export { computeChurn } from "./modules/scoring/churn";

export { computeTestCoverageGap } from "./modules/scoring/test-coverage-gap";

export { computeCompositeScores } from "./modules/scoring/composite-score";
export type { ModuleSignals, ModuleScore } from "./modules/scoring/composite-score";

export { assignTiers } from "./modules/scoring/tiers";
export type { Tier, TieredModule } from "./modules/scoring/tiers";
