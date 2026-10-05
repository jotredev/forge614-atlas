# 06 (EN). TypeScript Public API Reference

> **Official Technical Reference Document — Forge614 Ecosystem**  
> **Project:** Forge614 Atlas (Deep Contextualization Orchestrator)  
> **Package Entrypoint:** `src/index.ts` (`"exports": "./src/index.ts"` in `package.json`)  
> **Compatibility:** Bun >= 1.3.9 | TypeScript 5.9.3 under strict mode\
> **Sister translation:** [06. Referencia de API Pública en TypeScript](../es/06-referencia-api-typescript.md)

---

## 1. Type Definitions and Interfaces

All exported types are immutable, strongly typed, and zero-overhead:

### `ModuleDescriptor`
Represents an identified codebase module with its source file paths:

```typescript
export interface ModuleDescriptor {
  /** Directory name of the module (e.g., "auth", "scoring") */
  name: string;
  /** Absolute filesystem path to the module directory */
  path: string;
  /** Sorted list of absolute paths to source files (.ts, .tsx, .js, .jsx) */
  files: string[];
}
```

### `ModuleSignals`
Aggregates the raw measurements of a module prior to normalization:

```typescript
export interface ModuleSignals {
  /** Name of the target module */
  name: string;
  /** Sum of cyclomatic complexity across production source files */
  cyclomatic: number;
  /** Number of distinct external modules importing this module */
  fanIn: number;
  /** Total number of file modifications in Git commit history */
  churn: number;
  /** Fraction between 0.0 and 1.0 of source files lacking sibling tests */
  testGap: number;
}
```

### `ModuleScore`
Represents the composite score after Min-Max normalization and weighting:

```typescript
export interface ModuleScore {
  /** Module name */
  name: string;
  /** Continuous weighted composite score */
  score: number;
}
```

### `Tier` and `TieredModule`
Operational tier assigned according to percentile ranking:

```typescript
export type Tier = "ligero" | "estandar" | "profundo";

export interface TieredModule extends ModuleScore {
  /** Final operational tier */
  tier: Tier;
}
```

---

## 2. Public Function Catalog

### 2.1 Module Discovery

#### `discoverModules(root: string): ModuleDescriptor[]`
Scans `root` and returns an array of top-level modules containing source code, excluding build outputs and dot directories (`node_modules`, `.git`, `dist`, `build`, etc.).

```typescript
import { discoverModules } from "forge614-atlas";

const modules = discoverModules("/Users/jorgeetrejoo/Desktop/my-project");
console.log(`Discovered modules: ${modules.length}`);
```

#### `isTestFile(filePath: string): boolean`
Returns `true` if the path matches `/\.(test|spec)\.[tj]sx?$/`.

---

### 2.2 Complexity Metrics

#### `fileCyclomaticComplexity(sourceText: string, fileName?: string): number`
Parses TypeScript source via the compiler AST and calculates McCabe cyclomatic complexity (baseline 1 + decision branches).

#### `computeCyclomaticComplexity(modules: ModuleDescriptor[]): Map<string, number>`
Sums cyclomatic complexity across production source files for each module, automatically skipping test files.

---

### 2.3 Centrality & Dependencies

#### `computeFanIn(modules: ModuleDescriptor[]): Map<string, number>`
Parses relative imports/exports across the codebase and counts how many distinct external modules import each module.

---

### 2.4 Historical Volatility

#### `computeChurn(repoRoot: string, modules: ModuleDescriptor[]): Map<string, number>`
Executes `git -c core.quotepath=false log` and quantifies file change frequency per module across repository commit history.

> [!CAUTION]
> Throws if `repoRoot` is not a Git repository or if `git log` fails (e.g. repositories with zero commits). `runInitCommand` turns this into the structured JSON result `ANALYSIS_FAILED`; `computeChurn` itself does not fall back to zero.

---

### 2.5 Test Coverage Gap

#### `computeTestCoverageGap(modules: ModuleDescriptor[]): Map<string, number>`
Inspects filesystem for sibling `.test.*` or `.spec.*` files and returns the uncovered ratio in `[0.0, 1.0]`.

---

### 2.6 Scoring & Classification

#### `computeCompositeScores(signals: ModuleSignals[]): ModuleScore[]`
Normalizes cyclomatic, fan-in, and churn via Min-Max, applies $0.35 / 0.35 / 0.30$ weights, and applies $(1 + 0.20 \cdot testGap)$.

#### `assignTiers(scores: ModuleScore[]): TieredModule[]`
Sorts modules descending by composite score with alphabetical tie-breaking and assigns `profundo` (~15%), `estandar` (~35%), and `ligero` (~50%).

---

## 3. Production-Ready End-to-End Integration Example

## 2.7 Sessions, engines, and dispatch

Besides the scoring engine, `src/index.ts` exports these pieces. The CLI and its tests use them; an external application can use them when it already has Engram's `MemoryStore` and `Session`.

| Symbol | Signature | What it does / returns |
|---|---|---|
| `moduleTopicKey` | `(moduleName: string): string` | Returns `atlas:module:<name>`. |
| `deriveSessionId` | `(directory: string): string` | Derives stable repository identity; can throw when the path does not exist. |
| `deriveForcedSessionId` | `(directory: string): string` | Adds the current time for `--force`. |
| `startOrResumeSession` | `(store, directory): RunState` | Opens/resumes a session or returns `already-complete`; propagates Engram errors. |
| `isModuleReportSaved` | `(store, projectId, moduleName): boolean` | Checks for a saved report. |
| `recordModuleReport` | `(store, directory, session, moduleName, report): SessionSaveResult` | Saves or updates a report; can throw Engram errors. |
| `finalizeRun` | `(store, session, report): void` | Saves the final report and closes the session. |
| `readPauseCount` / `recordPause` | `(store, projectId): number` / `(store, directory, session): number` | Reads or increments the pause count. |
| `detectAgents` / `getCapabilities` | `(binaryPath): AgentDetection[]` / `(binaryPath, agentId): Capabilities` | Runs Engines; throws when its binary fails. |
| `resolveEnginesBinaryPath` / `resolveWorkersBinaryPath` | `(platform, forgeHome): string` | Builds the platform binary path. |
| `resolveEngine` | `(agents, capabilitiesById, requestedId?): EngineResolution` | Chooses an engine or returns its resolution status. |
| `buildRunPlan` | `(store, projectId, directory, options): RunPlanResult` | Discovers, scores, and excludes saved modules; can throw while reading the project. |
| `runInitCommand` | `(store, options): Promise<InitOutcome>` | Runs the `init` flow and returns its typed JSON envelope. |
| `resolveModuleFiles` | `(directory, moduleNames): Map<string, string[]>` | Groups files by module; only internal dispatch and tests use it. |
| `resolveTaskConfig` | `(tier, engineId, capabilities): TaskModelConfig` | Returns model/reasoning; throws for an engine outside its table. |
| `buildAnalysisPrompt` | `(moduleName, filePaths): string` | Creates a module prompt; internal dispatch uses it. |
| `runWorkersBatch` | `(workersBinaryPath, enginesBinaryPath, tasks, onEvent): Promise<void>` | Runs Workers and delivers events; rejects for process or invalid NDJSON errors. |
| `dispatchModules` | `(store, directory, session, workersBinaryPath, enginesBinaryPath, engine, capabilities, modules): Promise<DispatchResult>` | Dispatches, persists reports, and returns completion, pause, or error. |

Associated types are `RunState`, `FinalReport`, `AgentDetection`, `Capabilities`, `EngineResolution`, `RunPlanModule`, `RunPlanResult`, `RunInitOptions`, `InitOutcome`, `WorkersTask`, `WorkersEvent`, `TaskModelConfig`, and `DispatchResult`; their fields are defined in the source modules reexported by `src/index.ts`.

The following script demonstrates end-to-end usage of the scoring pipeline:

```typescript
import {
  discoverModules,
  computeCyclomaticComplexity,
  computeFanIn,
  computeChurn,
  computeTestCoverageGap,
  computeCompositeScores,
  assignTiers,
  type ModuleSignals,
} from "forge614-atlas";

function analyzeRepository(repoPath: string) {
  console.log(`[1/5] Discovering modules in: ${repoPath}`);
  const modules = discoverModules(repoPath);

  if (modules.length === 0) {
    console.warn("No source code modules found.");
    return [];
  }

  console.log(`[2/5] Extracting static code signals...`);
  const cyclomaticMap = computeCyclomaticComplexity(modules);
  const fanInMap = computeFanIn(modules);
  const churnMap = computeChurn(repoPath, modules);
  const testGapMap = computeTestCoverageGap(modules);

  console.log(`[3/5] Aggregating signals per module...`);
  const signals: ModuleSignals[] = modules.map(m => ({
    name: m.name,
    cyclomatic: cyclomaticMap.get(m.name) ?? 0,
    fanIn: fanInMap.get(m.name) ?? 0,
    churn: churnMap.get(m.name) ?? 0,
    testGap: testGapMap.get(m.name) ?? 0,
  }));

  console.log(`[4/5] Computing weighted composite scores...`);
  const scores = computeCompositeScores(signals);

  console.log(`[5/5] Assigning percentile tiers...`);
  const tieredModules = assignTiers(scores);

  console.table(
    tieredModules.map(m => ({
      Module: m.name,
      Score: m.score.toFixed(4),
      Tier: m.tier.toUpperCase(),
    }))
  );

  return tieredModules;
}
```
