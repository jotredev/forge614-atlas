# 06 (EN). TypeScript Public API Reference

> **Official Technical Reference Document — Forge614 Ecosystem**  
> **Project:** Forge614 Atlas (Deep Contextualization Orchestrator)  
> **Package Entrypoint:** `src/index.ts` (`"exports": "./src/index.ts"` in `package.json`)  
> **Compatibility:** Bun >= 1.3.9 | TypeScript 5.9.3 under strict mode\
> **Sister translation:** [06. Referencia de API Pública en TypeScript](../es/06-referencia-api-typescript.md)

---

## 1. Type Definitions and Interfaces

`src/index.ts` exports 18 types. Each one is shown with its definition as it is in the code (the code's own comments are in Spanish and are translated here) and the file and line where it is defined. `MemoryStore`, `Session` and `SessionSaveResult`, which appear in the signatures, are Engram (`forge614-engram`) types, not Atlas types.

### `ModuleDescriptor`
A module discovered on disk with its code files. Defined at `src/modules/scoring/discovery.ts:33`.

```typescript
/**
 * Canonical descriptor of a module discovered on disk.
 */
export interface ModuleDescriptor {
  /** Module name: its path relative to the scanned root, with `/` (for example `auth` or `src/auth`) */
  name: string;
  /** Absolute filesystem path to the module's folder */
  path: string;
  /** Exhaustive list, sorted alphabetically, of TypeScript/JavaScript source files */
  files: string[];
}
```

### `ModuleSignals`
The four raw measurements of a module, before normalizing them. Defined at `src/modules/scoring/composite-score.ts:13`.

```typescript
/**
 * Raw quantitative signals collected for a given module.
 */
export interface ModuleSignals {
  /** Module identifier name */
  name: string;
  /** Accumulated cyclomatic complexity of production code */
  cyclomatic: number;
  /** Number of other modules that depend on this one (how many dependency arrows reach it) */
  fanIn: number;
  /** Total file changes of this module in the Git history */
  churn: number;
  /** Share of the module's source files that have no test file next to them, from 0.0 (all have one) to 1.0 (none) */
  testGap: number;
}
```

### `ModuleScore`
A module's composite score. Defined at `src/modules/scoring/composite-score.ts:29`.

```typescript
/**
 * Final composite complexity score computed for a module.
 */
export interface ModuleScore {
  /** Module name */
  name: string;
  /** Non-negative scalar score resulting from normalization and weighting */
  score: number;
}
```

### `Tier`
A module's analysis tier. Defined at `src/modules/scoring/tiers.ts:17`.

```typescript
/**
 * Analysis tier Atlas assigns to a module: `"profundo"` (the highest scores), `"estandar"` (the intermediate ones) and
 * `"ligero"` (the rest).
 * Each tier uses a different Workers model in `resolveTaskConfig`, sets the dispatch order (`profundo` first) and
 * is counted separately in the final report; it does not change the text of the analysis requested from the model.
 */
export type Tier = "ligero" | "estandar" | "profundo";
```

### `TieredModule`
A module with its score and its tier. Defined at `src/modules/scoring/tiers.ts:22`.

```typescript
/**
 * Module evaluated with its composite score and the analysis tier assigned.
 */
export interface TieredModule extends ModuleScore {
  /** Analysis tier assigned according to the module's place in the list ordered by score. */
  tier: Tier;
}
```

### `RunState`
Whether a repository's Atlas session is open or already finished. Defined at `src/modules/memory/run-state.ts:10`.

```typescript
/** Tells an open session, including its reference, apart from a run that had already finished. */
export type RunState =
  | { status: "active"; session: Session }
  | { status: "already-complete" };
```

### `FinalReport`
The counts and names that close a finished run; it is also the `report` field of `init`'s `completed` answer. Defined at `src/modules/memory/finalize-run.ts:8`.

```typescript
/** Data on modules, tiers, consumption and pauses needed for Atlas's final summary. */
export interface FinalReport {
  /** Project name or path (`dispatchModules` sends the folder path); it appears in the summary's goal (`goal`). */
  repoName: string;
  /** Number of modules analyzed successfully in this run at each analysis tier (skipped ones are not counted, nor those that already had a report from an earlier run). */
  tierBreakdown: { deep: number; standard: number; light: number };
  /** Name of the engine chosen for each tier. */
  engineByTier: Record<"deep" | "standard" | "light", string>;
  /** Number of workers (AI helpers, one per module) that finished their module in this run at each tier. */
  totalWorkersByTier: Record<"deep" | "standard" | "light", number>;
  /** Total tokens (the units of text the AI processes) consumed by the workers; today `dispatchModules` sends 0 because Workers does not count them. */
  tokensConsumed: number;
  /** Accumulated duration of the run in milliseconds. */
  totalTimeMs: number;
  /** Number of quota pauses recorded for the project. */
  pauseCount: number;
  /** Names of the modules whose report was saved in Engram in this run. */
  analyzedModuleNames: string[];
  /** Names of skipped or failed modules that remain for the next steps. */
  skippedModuleNames: string[];
  /**
   * Subset of `skippedModuleNames` whose report Engram rejected with `SECRET_REJECTED` because it looked like
   * a secret. Additive field: whoever reads the result and does not know it can ignore it.
   */
  rejectedReportModuleNames?: string[];
}
```

### `AgentDetection`
An AI assistant as Engines reports it. Defined at `src/modules/engines-client/detect.ts:12`.

```typescript
/** An agent as Forge614 Engines reports it: whether it is installed, where its program is and its configuration folder. */
export interface AgentDetection {
  /** Agent identifier (for example `claude-code`). */
  id: string;
  /** Display name (for example `Claude Code`); Atlas does not read it today. */
  label: string;
  /** `true` if Engines considers the agent installed; `init` only asks for the capabilities of installed ones and `resolveEngine` only proposes those. */
  installed: boolean;
  /** Path of the agent's program; it may be missing, and `resolveEngine` discards an agent that does not bring it. */
  executable?: string;
  /** Agent configuration folder that Engines reports; Atlas does not read it today. */
  configDir: string;
  /** What Engines reports about whether that configuration folder exists; Atlas does not read it today. */
  configFound: boolean;
}
```

### `Capabilities`
What Engines declares an assistant can do. Defined at `src/modules/engines-client/capabilities.ts:12`.

```typescript
/** What Forge614 Engines declares an agent can do. */
export interface Capabilities {
  /** Agent identifier (for example `claude-code`) that Engines returns in its answer; `init` indexes by the detection's `id`, not by this one. */
  id: string;
  /** Agent display name (for example `Claude Code`); Atlas does not read it today. */
  label: string;
  /** `true` if Engines declares the agent supports MCP (the protocol for giving it external tools); Atlas does not read it today. */
  supportsMcp: boolean;
  /** `true` if Engines declares the agent supports hooks (commands that run at fixed moments of its work); Atlas does not read it today. */
  supportsHooks: boolean;
  /** `true` if the agent can run without a screen (headless: no window and nobody in front of it); `resolveEngine` only proposes agents with `true`. */
  supportsHeadlessExec: boolean;
  /** `true` if the agent accepts a reasoning level; `resolveTaskConfig` only sends `reasoningLevel` to Workers when it is `true`. */
  supportsReasoningLevel: boolean;
  /**
   * `true` only if Engines guarantees read-only helpers for this agent (Engines 1.17.0 or
   * later). If Engines does not bring the field, it is read as `false`.
   * `checkDispatchRequirements` rejects the start of `init` when it is not `true`.
   */
  supportsReadOnly: boolean;
}
```

### `EngineResolution`
The result of choosing `init`'s engine. Defined at `src/modules/cli/resolve-engine.ts:9`.

```typescript
/** Result of resolving the engine: chosen, nonexistent, ambiguous or different from the requested identifier. */
export type EngineResolution =
  | { status: "resolved"; id: string; executable: string }
  | { status: "engine-ambiguous"; candidates: { id: string; executable: string }[] }
  | { status: "engine-unavailable" }
  | { status: "engine-invalid"; requestedId: string; candidates: { id: string; executable: string }[] };
```

### `RunPlanModule`
A module of the run plan. Defined at `src/modules/cli/build-run-plan.ts:20`.

```typescript
/**
 * A module included in the run plan: what to analyze and how deeply.
 */
export interface RunPlanModule {
  /** Module name as `discoverModules` delivers it: its path relative to the project root (e.g. `src/auth`). */
  name: string;
  /** Depth tier (`ligero`, `estandar` or `profundo`) that `assignTiers` gave it according to its score. */
  tier: Tier;
}
```

### `RunPlanResult`
The complete run plan. Defined at `src/modules/cli/build-run-plan.ts:30`.

```typescript
/**
 * Result of `buildRunPlan`: the modules to analyze and whether the run is a continuation.
 */
export interface RunPlanResult {
  /** Pending modules, ordered from highest to lowest score (the order in which `assignTiers` delivers them). */
  modules: RunPlanModule[];
  /** `true` only if skipping the saved ones was requested and at least one module was left out because its report was saved. */
  resumed: boolean;
}
```

### `RunInitOptions`
The options of `runInitCommand`. Defined at `src/modules/cli/init.ts:18`.

```typescript
/** Options of `init`. */
export interface RunInitOptions {
  /** Folder of the project to contextualize. */
  directory: string;
  /** Path of the Forge614 Engines binary. */
  enginesBinaryPath: string;
  /** Path of the Forge614 Workers binary. */
  workersBinaryPath: string;
  /** Engine requested with `--engine`; if missing and there are several, `init` answers `engine-ambiguous`. */
  requestedEngineId?: string;
  /** If `true`, redoes an analysis that was already complete (`--force`). */
  force: boolean;
  /** Limit, in milliseconds, for `forge614-workers --version` at start (10 s by default); lowered in the tests. */
  workersVersionTimeoutMs?: number;
}
```

### `InitOutcome`
Everything `init` can answer; the table of its statuses and fields is in [chapter 13](13-data-files.md) and the detail in [chapter 08](08-cli-core-and-run-plan.md). Defined at `src/modules/cli/init.ts:43`. `InitErrorCode` (`init.ts:34`) is not exported by `src/index.ts`; it is copied here because `InitOutcome` uses it.

```typescript
/** Error codes that `init` can return in its error envelope. */
export type InitErrorCode =
  | "ENGINES_UNREACHABLE"
  | "ANALYSIS_FAILED"
  | "WORKERS_UNREACHABLE"
  | "WORKERS_FATAL_ERROR"
  | "READ_ONLY_UNSUPPORTED"
  | "WORKERS_OUTDATED";

/** Everything `init` can answer; each variant carries `schemaVersion: 1`. */
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
```

### `TaskModelConfig`
The model (and reasoning level) sent to Workers for a task. Defined at `src/modules/cli/task-config.ts:13`.

```typescript
/** Configuration handed to Workers for a task already classified by tier and engine. */
export interface TaskModelConfig {
  /** Exact name of the model the engine must run. */
  model: string;
  /** Reasoning intensity, sent only when Engines declares that the engine accepts it. */
  reasoningLevel?: "low" | "medium";
}
```

### `DispatchResult`
How the dispatch of the batch ended. Defined at `src/modules/cli/dispatch-modules.ts:41`.

```typescript
/** Result of sending the batch of modules to Workers. */
export type DispatchResult =
  | { status: "completed"; report: FinalReport }
  | { status: "paused"; analyzedCount: number; pendingCount: number }
  | { status: "fatal_error"; message: string }
  // Second defense: Workers refused to run tasks for lack of the read-only lock. It is not a
  // skipped module: the analysis was not done and the session is left open.
  | { status: "read_only_unsupported" };
```

### `WorkersTask`
The data of a module that Atlas hands to Workers. Defined at `src/modules/workers-client/run-batch.ts:12`. `WorkersReasoningLevel` (`run-batch.ts:9`) is not exported by `src/index.ts`; it is copied here because `WorkersTask` uses it.

```typescript
/** Reasoning levels that Workers accepts; Engines (the program that knows what each agent supports) validates which ones the chosen agent supports. */
export type WorkersReasoningLevel = "low" | "medium" | "high" | "xhigh" | "max";

/** Data of a module that Atlas hands to Workers to run a worker. */
export interface WorkersTask {
  /** Task identifier; Atlas uses the module name to recognize its events. */
  id: string;
  /** Identifier of the agent selected for this task. */
  agentId: string;
  /** Path of the program that starts that agent. */
  executable: string;
  /** Analysis instruction the agent receives. */
  prompt: string;
  /** Extra folder the agent is given access to (Workers passes it to Engines as `--readable-dir`); by itself it does not limit the agent to read-only, that is what `readOnly` is for. */
  readableDir?: string;
  /**
   * If `true`, Workers asks Engines for the read-only lock and refuses to run the task
   * (`READ_ONLY_UNSUPPORTED`) if Engines does not guarantee it. Atlas always sends it as `true`.
   */
  readOnly?: boolean;
  /** Model chosen for the module's tier, when specified. */
  model?: string;
  /** Reasoning level, sent only when the configuration includes it. */
  reasoningLevel?: WorkersReasoningLevel;
  /** Time limit of the task in milliseconds; if omitted, Workers uses 10 minutes (600000). Atlas does not send it. */
  timeoutMs?: number;
}
```

### `WorkersEvent`
Each line Workers prints while the batch runs. Defined at `src/modules/workers-client/run-batch.ts:42`.

```typescript
/**
 * An event that Workers prints as one NDJSON line (one JSON object per line) while the batch runs. `task_failed`
 * with `reason: "engine_unsupported"` and a `stderr` (the task's error output) that starts with `READ_ONLY_UNSUPPORTED` is the refusal to
 * run a task without the read-only lock. `fatal_error` may appear before any task starts because of invalid input
 * or a missing Engines, or after task events if the batch control fails unexpectedly.
 */
export type WorkersEvent =
  | { event: "task_started"; taskId: string; agentId: string; startedAt: string }
  | {
      event: "task_completed";
      taskId: string;
      exitCode: number;
      durationMs: number;
      stdout: string;
      stdoutBytes: number;
      stdoutTruncated: boolean;
      stderr: string;
      stderrBytes: number;
      stderrTruncated: boolean;
    }
  | {
      event: "task_failed";
      taskId: string;
      reason: "timeout" | "engine_unsupported" | "spawn_error" | "generic_error";
      exitCode: number | null;
      stdout: string;
      stdoutBytes: number;
      stdoutTruncated: boolean;
      stderr: string;
      stderrBytes: number;
      stderrTruncated: boolean;
    }
  | {
      event: "quota_exhausted";
      taskId: string;
      agentId: string;
      matchedPattern: string;
      stdout: string;
      stdoutBytes: number;
      stdoutTruncated: boolean;
      stderr: string;
      stderrBytes: number;
      stderrTruncated: boolean;
    }
  | {
      event: "run_completed";
      totalTasks: number;
      completed: number;
      failed: number;
      notStarted: number;
      pausedByQuota: boolean;
      totalDurationMs: number;
    }
  | { event: "fatal_error"; reason: "invalid_input" | "engines_bin_not_found" | "unexpected_error"; message: string };
```

---

## 2. Public Function Catalog

`src/index.ts` exports 30 functions; this chapter has one entry for each, grouped by module (2.1 to 2.6 are the scoring engine's, `src/modules/scoring`; 2.7 to 2.10, those for sessions, engines, Workers and dispatch). Each entry gives the signature as it is in the code, what it does, what it returns, when it throws an error and who uses it inside Atlas (file and line). Every one of them is used by Atlas's code, not only by its tests.

### 2.1 Module Discovery

#### `discoverModules(root: string): ModuleDescriptor[]`
Walks the folders of `root` and decides which ones are modules: a folder that only has subfolders is not a module and the walk goes down into its subfolders; one with loose code files and subfolders (mixed) gives one module with its loose files plus one per subfolder; one without subfolders is a module if it has at least one code file. Each module's name is its path relative to `root` (`src/auth`). It skips `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `out`, `.forge614` and any folder whose name starts with a dot; files directly in `root` do not form a module. Defined at `src/modules/scoring/discovery.ts:79`.

```typescript
import { discoverModules } from "forge614-atlas";

const modules = discoverModules("/path/to/my-project");
console.log(`Discovered modules: ${modules.length}`);
```

- **Returns:** the list of `ModuleDescriptor` sorted alphabetically by name. In each one, `files` are the absolute paths of the `*.ts`, `*.tsx`, `*.js` and `*.jsx` that sit directly in its folder (test files included), sorted.
- **Throws:** the file-system error (for example `ENOENT`) if `root` does not exist or cannot be read; it does not catch it.
- **Used by:** `src/modules/cli/build-run-plan.ts:54` and `src/modules/cli/module-files.ts:16`.

#### `isTestFile(filePath: string): boolean`
Tells whether a path is a test file. Defined at `src/modules/scoring/discovery.ts:52`.

- **Returns:** `true` if the name ends in `.test` or `.spec` followed by `ts`, `tsx`, `js` or `jsx` (`/\.(test|spec)\.[tj]sx?$/`). It only looks at the path text: it does not check that the file exists.
- **Throws:** never.
- **Used by:** `src/modules/scoring/cyclomatic.ts:120`, `src/modules/scoring/fan-in.ts:154` and `src/modules/scoring/test-coverage-gap.ts:72`, to leave test files out of their counts.

---

### 2.2 Complexity Metrics

#### `fileCyclomaticComplexity(sourceText: string, fileName = "module.ts"): number`
Reads a TypeScript text with the compiler's parser (its AST) and computes the McCabe cyclomatic complexity of the whole file: it starts at 1 and adds one for each `if`, `? :` expression, loop (`while`, `do`, `for`, `for…in`, `for…of`), `catch`, `case` (not `default`), `&&`, `||` and `??`. It is a single count for the entire file, not one per function. `fileName` only decides how the text is read (for example, `.tsx` allows JSX). Defined at `src/modules/scoring/cyclomatic.ts:43`.

- **Returns:** an integer of 1 or more.
- **Throws:** nothing of its own: it receives the text, it does not read files.
- **Used by:** `src/modules/scoring/cyclomatic.ts:128`, from `computeCyclomaticComplexity`.

#### `computeCyclomaticComplexity(modules: ModuleDescriptor[]): Map<string, number>`
Adds up the cyclomatic complexity of each module's files, leaving test files out (`isTestFile`). Defined at `src/modules/scoring/cyclomatic.ts:110`.

- **Returns:** a map with one entry per module (name → sum); a module without production files gives 0.
- **Throws:** the file-system error (for example `ENOENT`) if it cannot read one of the module's files; it does not catch it.
- **Used by:** `src/modules/cli/build-run-plan.ts:61`.

---

### 2.3 Centrality & Dependencies

#### `computeFanIn(modules: ModuleDescriptor[]): Map<string, number>`
Reads the relative `import`, `export … from` and `require` (those starting with `.`) of each module's production files, follows them to the real file on disk (trying the path as is, with `.ts`, `.tsx`, `.js`, `.jsx` and as a folder with `index`) and counts, for each module, how many other distinct modules import it. A module counts only once however many imports it has toward the same target, and a module's dependencies on itself do not count. An import that does not point to an existing file is ignored. Defined at `src/modules/scoring/fan-in.ts:142`.

- **Returns:** a map with one entry per module (name → how many other modules use it); it starts at 0.
- **Throws:** the file-system error (for example `ENOENT`) if it cannot read one of the module's files; it does not catch it.
- **Used by:** `src/modules/cli/build-run-plan.ts:62`.

---

### 2.4 Historical Volatility

#### `computeChurn(repoRoot: string, modules: ModuleDescriptor[]): Map<string, number>`
Runs `git -c core.quotepath=false log --format= --name-only` in `repoRoot` and adds one unit to the module for each of its files that appears in each commit. It also counts files that no longer exist if their path ended up inside the module's folder; with a mixed folder (`src` and `src/auth`) a file of `src/auth` is counted in the first module of the list that contains it. Defined at `src/modules/scoring/churn.ts:44`.

> [!CAUTION]
> Throws if `repoRoot` is not a Git repository or if `git log` fails (e.g. repositories with zero commits). `runInitCommand` turns this into the structured JSON result `ANALYSIS_FAILED`; `computeChurn` itself does not fall back to zero.

- **Returns:** a map with one entry per module (name → total file changes); it starts at 0.
- **Throws:** `Error` with the message `git log failed in <repoRoot>: <git's error output>` if git ends with a non-zero code (no repository or no commits) or cannot be run.
- **Used by:** `src/modules/cli/build-run-plan.ts:63`.

---

### 2.5 Test Coverage Gap

#### `computeTestCoverageGap(modules: ModuleDescriptor[]): Map<string, number>`
For each production file of a module, it checks on disk whether its sibling test file exists (`x.test.ts` or `x.spec.ts` next to `x.ts`, with the same extension) and computes the share that does not have one. It only looks at whether the file exists; it does not measure how much code those tests run. Defined at `src/modules/scoring/test-coverage-gap.ts:67`.

- **Returns:** a map with one entry per module (name → a number from 0.0, all have a test, to 1.0, none does); a module without production files gives 0.
- **Throws:** nothing of its own.
- **Used by:** `src/modules/cli/build-run-plan.ts:64`.

---

### 2.6 Scoring & Classification

#### `computeCompositeScores(signals: ModuleSignals[]): ModuleScore[]`
Brings each module's cyclomatic complexity, fan-in and churn to the 0-to-1 scale (Min-Max normalization: if all the values are equal, it gives 0), weighs them with $0.35 / 0.35 / 0.30$ and multiplies the result by $(1 + 0.20 \cdot testGap)$. It does not sort. Defined at `src/modules/scoring/composite-score.ts:67`.

- **Returns:** one score per module, in the same order as `signals`; with an empty list it returns an empty list.
- **Throws:** never.
- **Used by:** `src/modules/cli/build-run-plan.ts:76`.

#### `assignTiers(scores: ModuleScore[]): TieredModule[]`
Sorts the modules from highest to lowest score (ties broken by name) and splits the tiers: `profundo` the first `max(1, round(total × 0.15))`, `estandar` the next `round(total × 0.35)` and `ligero` the rest. With 10 modules that is 2, 4 and 4; with 3, one of each tier. It does not change the list it receives. Defined at `src/modules/scoring/tiers.ts:53`.

- **Returns:** a sorted copy, each module with its `tier`; with an empty list, an empty list.
- **Throws:** never.
- **Used by:** `src/modules/cli/build-run-plan.ts:76`.

---

### 2.7 Sessions and reports in Engram (`src/modules/memory`)

These functions use an Engram `MemoryStore` and `Session`; `MemoryStore` and `Session` are Engram types, not Atlas ones.

#### `moduleTopicKey(moduleName: string): string`
Builds the topic key under which a module's report is saved. Defined at `src/modules/memory/module-topic.ts:10`.

- **Returns:** `atlas:module:<name>`, with the name unmodified (including its relative path if it is a nested module).
- **Throws:** never.
- **Used by:** `src/modules/memory/module-report.ts:28` and `src/modules/memory/run-state.ts:43`.

#### `deriveSessionId(directory: string): string`
Computes a repository's stable session identifier. It starts from its common Git folder (`git rev-parse --git-common-dir`, resolved to its real path) or, if Git does not give it, from the real path of `directory`; so the same repository gives the same identifier from the root, from a subfolder or from another `worktree` (another working folder of the same repository). Defined at `src/modules/memory/session-id.ts:53`.

- **Returns:** `atlas:` and the first 16 hexadecimal characters of the SHA-256 of that path.
- **Throws:** the file-system error (for example `ENOENT`, the path does not exist) if it cannot resolve the real path.
- **Used by:** `src/modules/memory/run-state.ts:23` and `src/modules/memory/session-id.ts:67`.

#### `deriveForcedSessionId(directory: string): string`
Computes the identifier of the forced run (`--force`): the stable one followed by the time. A closed session cannot be reopened with the same identifier, so a different one is generated each time. Defined at `src/modules/memory/session-id.ts:66`.

- **Returns:** `atlas:<16 hexadecimal>:<milliseconds since 1970>`.
- **Throws:** the same as `deriveSessionId`.
- **Used by:** `src/modules/cli/init.ts:199`.

#### `startOrResumeSession(store: MemoryStore, directory: string): RunState`
Opens the repository's Atlas session with its stable identifier or resumes the one that is already open; it is also where Engram writes `.forge614/project.json` (see [chapter 13](13-data-files.md)). Defined at `src/modules/memory/run-state.ts:22`.

- **Returns:** `{ status: "active", session }`, or `{ status: "already-complete" }` if Engram answers `SESSION_CONFLICT` (in practice, the identifier already belongs to a closed session).
- **Throws:** the other Engram errors unchanged (for example `MIGRATION_REQUIRED` if the database does not support sessions, or `PROJECT_FILE_INVALID`) and the `ENOENT` of `deriveSessionId`.
- **Used by:** `src/modules/cli/init.ts:210`.

#### `isModuleReportSaved(store: MemoryStore, projectId: string, moduleName: string): boolean`
Checks whether a saved report of that module already exists under its topic key. Defined at `src/modules/memory/run-state.ts:42`.

- **Returns:** `true` if Engram has a memory with that key in the project; `false` if not.
- **Throws:** it does not catch Engram errors.
- **Used by:** `src/modules/cli/build-run-plan.ts:80`, to leave out the modules already reported.

#### `recordModuleReport(store: MemoryStore, directory: string, session: Session, moduleName: string, reportText: string): SessionSaveResult`
Saves a module's report text as a memory of type `fact`, with the module's topic key and the title `Atlas: <module>`, tied to the session. If a memory with that key already existed, it passes its current version to update it instead of clashing (so a re-run with `--force` does not fail). Defined at `src/modules/memory/module-report.ts:21`.

- **Returns:** the result of Engram's save, with the memory created or updated.
- **Throws:** `SECRET_REJECTED` if Engram detects something that looks like a secret; `VERSION_CONFLICT` if another write changed the version between the read and the save.
- **Used by:** `src/modules/cli/dispatch-modules.ts:118`.

#### `finalizeRun(store: MemoryStore, session: Session, report: FinalReport): void`
Saves a finished run's final summary in Engram and closes the session. It must only be called when the run has completely finished: a paused run leaves the session open on purpose and never calls it, because a closed session cannot be reopened with the same identifier. Defined at `src/modules/memory/finalize-run.ts:52`.

- **Returns:** nothing (`void`).
- **Throws:** `SUMMARY_TOPIC_CONFLICT` if the summary's reserved topic is taken; `SESSION_NOT_FOUND` or `SESSION_KIND` if Engram cannot close the indicated session.
- **Used by:** `src/modules/cli/dispatch-modules.ts:198`.

#### `readPauseCount(store: MemoryStore, projectId: string | null): number`
Reads the project's quota-pause counter (the memory with the key `atlas:meta:pause-count`). Defined at `src/modules/memory/pause-count.ts:15`.

- **Returns:** the integer the saved content starts with (from `12abc` it takes 12); 0 if there is no memory or it does not start with an integer.
- **Throws:** it does not catch Engram errors.
- **Used by:** `src/modules/cli/dispatch-modules.ts:192`.

#### `recordPause(store: MemoryStore, directory: string, session: Session): number`
Adds one pause to the counter and saves it tied to the session. Defined at `src/modules/memory/pause-count.ts:30`.

- **Returns:** the new total after the save.
- **Throws:** `VERSION_CONFLICT` if another save changed the version read; it propagates the other Engram errors (for example `SESSION_CLOSED` if the session is already closed).
- **Used by:** `src/modules/cli/dispatch-modules.ts:161`.

---

### 2.8 Engines client (`src/modules/engines-client`)

#### `detectAgents(binaryPath: string): AgentDetection[]`
Runs `<Engines binary> detect` and reads the JSON it answers. Defined at `src/modules/engines-client/detect.ts:35`.

- **Returns:** the `agents` list of the answer, as it is (the shape of each agent is not validated).
- **Throws:** `Error` with the message `forge614-engines detect failed: <detail>` if Engines does not start or exits with a non-zero code (the detail is its error output, the start-up message or `exit code <n>`); and the `SyntaxError` of `JSON.parse` if the answer is not valid JSON. `init` answers it as `ENGINES_UNREACHABLE`.
- **Used by:** `src/modules/cli/init.ts:167`.

#### `getCapabilities(binaryPath: string, agentId: string): Capabilities`
Runs `<Engines binary> capabilities --agent <id>` and reads the JSON it answers. Defined at `src/modules/engines-client/capabilities.ts:42`.

- **Returns:** the agent's capabilities; `supportsReadOnly` is only `true` if Engines reports it as `true` (if it is missing, for example with an Engines older than 1.17.0, it is `false`).
- **Throws:** `Error` with the message `forge614-engines capabilities failed for <agentId>: <detail>` if Engines does not start or exits with a non-zero code; and the `SyntaxError` of `JSON.parse` if the answer is not valid JSON.
- **Used by:** `src/modules/cli/init.ts:176`, for each installed agent.

#### `resolveEnginesBinaryPath(platform: NodeJS.Platform, forgeHome: string): string`
Builds the path of the Engines program. Defined at `src/modules/engines-client/binary-path.ts:17`.

- **Returns:** `<forgeHome>/engines/bin/forge614-engines`, with `.exe` and Windows slashes when `platform` is `win32` (the separator is chosen by the requested platform, not by the system running the code).
- **Throws:** never.
- **Used by:** `src/interfaces/cli/commands.ts:57`.

---

### 2.9 Workers client (`src/modules/workers-client`)

#### `resolveWorkersBinaryPath(platform: NodeJS.Platform, forgeHome: string): string`
Builds the path of the Workers program. Defined at `src/modules/workers-client/binary-path.ts:13`.

- **Returns:** `<forgeHome>/workers/bin/forge614-workers`, with `.exe` and Windows slashes when `platform` is `win32`.
- **Throws:** never.
- **Used by:** `src/interfaces/cli/commands.ts:58`.

#### `runWorkersBatch(workersBinaryPath: string, enginesBin: string, tasks: WorkersTask[], onEvent: (event: WorkersEvent) => void): Promise<number>`
Launches Workers, writes the batch (`{ enginesBin, tasks }`) to its standard input and hands each event it prints (one NDJSON line per event) to `onEvent`, in order. Workers runs the tasks one after another, in the order received. If a line is not valid JSON or `onEvent` throws an error, it kills Workers and rejects. Defined at `src/modules/workers-client/run-batch.ts:101`.

- **Returns:** a promise with Workers's exit code: `0` if the batch finished without a quota pause (even if some task failed), `75` if it paused for quota, `2` for invalid input or a missing Engines and `1` for an unexpected failure (also `1` if Workers ended because of a system signal).
- **Throws:** the promise rejects if Workers cannot be launched, if a line is not valid JSON (`runWorkersBatch: failed to parse NDJSON line from forge614-workers: …`) or if `onEvent` throws (`runWorkersBatch: onEvent handler threw while processing a "<event>" event`, with the original error in `cause`).
- **Used by:** `src/modules/cli/dispatch-modules.ts:147`.

---

### 2.10 CLI core and dispatch (`src/modules/cli`)

#### `resolveEngine(agents: AgentDetection[], capabilitiesById: Map<string, Capabilities>, requestedId?: string): EngineResolution`
Chooses the engine `init` is going to use from what Engines reports. A candidate is an installed agent, with an executable and with `supportsHeadlessExec: true`. Defined at `src/modules/cli/resolve-engine.ts:24`.

- **Returns:** `resolved` with `id` and `executable` if one was requested that is a candidate, or if none was requested and there is exactly one; `engine-invalid` (with `requestedId` and the candidates, which may be none) if one was requested that is not a candidate; `engine-ambiguous` (with the candidates) if none was requested and there are two or more; `engine-unavailable` if none was requested and there are no candidates.
- **Throws:** never.
- **Used by:** `src/modules/cli/init.ts:182`.

#### `buildRunPlan(store: MemoryStore, projectId: string, directory: string, options: { skipCompleted: boolean }): RunPlanResult`
Discovers the project's modules, scores them (the four signals, the composite score and the tiers) and, with `skipCompleted: true`, discards those that already have their report saved. Defined at `src/modules/cli/build-run-plan.ts:48`.

- **Returns:** `{ modules, resumed }`: the pending modules with their tier, from highest to lowest score, and whether the run continues an earlier one. If no module is discovered it returns `{ modules: [], resumed: false }` without consulting the memory.
- **Throws:** no code of its own: the errors of the steps it invokes go up as they are (for example, the `Error` of `computeChurn` if the folder is not a Git repository or has no commits); `runInitCommand` turns them into `ANALYSIS_FAILED`.
- **Used by:** `src/modules/cli/init.ts:203` (with `--force`, `skipCompleted: false`) and `:217` (`skipCompleted: true`).

#### `runInitCommand(store: MemoryStore, options: RunInitOptions): Promise<InitOutcome>`
Runs the whole `init` flow: detects and chooses the engine, checks the read-only requirements (before opening any Engram session), opens or resumes the session, builds the plan and dispatches it to Workers. Defined at `src/modules/cli/init.ts:164`.

- **Returns:** a promise with the `InitOutcome` that the CLI prints (see [chapter 13](13-data-files.md)).
- **Throws:** expected failures do not throw: they come out as `{ status: "error" }` with their code. Engram errors when opening the session (for example `PROJECT_FILE_INVALID`) and the `ENOENT` of `deriveSessionId` do pass through; `src/interfaces/cli/main.ts:73` turns them into `UNEXPECTED_ERROR`.
- **Used by:** `src/interfaces/cli/commands.ts:59`.

#### `resolveModuleFiles(directory: string, moduleNames: string[]): Map<string, string[]>`
Discovers the modules of `directory` again and returns the files of those requested. Defined at `src/modules/cli/module-files.ts:15`.

- **Returns:** a map name → file paths (absolute if `directory` is), in the order of `moduleNames`; a name that was not discovered appears with `[]`, so that dispatch still creates one task for every name.
- **Throws:** the file-system error of `discoverModules` if `directory` cannot be read.
- **Used by:** `src/modules/cli/dispatch-modules.ts:81`.

#### `resolveTaskConfig(tier: Tier, engineId: string, capabilities: { supportsReasoningLevel: boolean }): TaskModelConfig`
Gives a task's model and reasoning level according to a fixed Atlas table (`MODEL_TABLE`). Defined at `src/modules/cli/task-config.ts:43`.

| Tier | `claude-code` | `codex` |
|---|---|---|
| `ligero` | `claude-haiku-4-5-20251001`, `low` | `gpt-5.6-luna`, `low` |
| `estandar` | `claude-sonnet-5`, `medium` | `gpt-5.6-terra`, `medium` |
| `profundo` | `claude-opus-5`, `medium` | `gpt-5.6-sol`, `medium` |

- **Returns:** the table row; if `capabilities.supportsReasoningLevel` is `false`, only the `model`, without `reasoningLevel`.
- **Throws:** `Error` with the message `No hay configuración de modelo/razonamiento para el motor "<engineId>"` if the engine is not in the table (only `claude-code` and `codex`).
- **Used by:** `src/modules/cli/dispatch-modules.ts:85`.

#### `buildAnalysisPrompt(moduleName: string, filePaths: string[]): string`
Builds the text a helper is asked to analyze a module with: a narrative explanation, without copying lines of code, that starts with the listed files. It does not read files or validate the paths: it only builds the text. Defined at `src/modules/cli/analysis-prompt.ts:16`.

- **Returns:** the complete instruction, in Spanish, with the lines joined by line breaks; each path comes out as a list item (`- path`), and with an empty list the files section is left without items.
- **Throws:** never.
- **Used by:** `src/modules/cli/dispatch-modules.ts:90`.

#### `dispatchModules(store: MemoryStore, directory: string, session: Session, workersBinaryPath: string, enginesBinaryPath: string, engine: { id: string; executable: string }, capabilities: Capabilities, modules: { name: string; tier: Tier }[]): Promise<DispatchResult>`
Sends Workers a batch with one task per module (always with `readOnly: true`, ordered by tier: `profundo` first, then `estandar` and `ligero` last) and saves each one's report in Engram. A module whose answer arrives cut off, that fails or whose report Engram rejects because it looks like a secret (`SECRET_REJECTED`) is skipped. If the quota runs out it notes a pause and leaves the session open; if the batch finishes, it builds the final report and closes the session. Defined at `src/modules/cli/dispatch-modules.ts:67`.

- **Returns:** a promise with `completed` (and the `report`), `paused` (with `analyzedCount` and `pendingCount`), `fatal_error` (with Workers's message, `<reason>: <detail>`) or `read_only_unsupported` (Workers refused to run tasks without the lock; the session is not closed). The priority is: fatal error, missing lock, quota exhausted.
- **Throws:** no code of its own: it rejects with the `Error` of `resolveTaskConfig` if the engine is not in its table; with that of `runWorkersBatch` if Workers cannot be launched, prints a line that is not JSON, or if saving a report fails with an Engram error other than `SECRET_REJECTED` (it arrives wrapped, with the original in `cause`); and with Engram's error, unwrapped, if `recordPause`, `readPauseCount` or `finalizeRun` fail. `runInitCommand` turns it into `WORKERS_FATAL_ERROR`.
- **Used by:** `src/modules/cli/init.ts:109`.

---

## 3. Production-Ready End-to-End Integration Example

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
