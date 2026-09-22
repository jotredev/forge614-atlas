# 08 (EN). CLI Core and JSON Run Plan

> **Status:** Plan 3/5 completed and merged into `main` (`2b5272c`).  
> **Sister translation:** [08. Núcleo del CLI y plan de corrida JSON](../es/08-nucleo-cli-y-plan-de-corrida.md)

> **Scope update (Plan 4):** `init` no longer stops at a plan — it dispatches it for real. The `"ready"` status described below no longer exists; it was replaced by `"completed"` and `"paused"`. See [09 (EN). Real Subagent Dispatch](09-subagent-dispatch.md) for the current contract. This chapter is kept for the parts that are still accurate: engine resolution, session/module-plan assembly, and the shape of a `RunPlanModule`.

## Purpose

At this stage Atlas is a hospital reception desk: it receives a repository, confirms which specialist can treat it, and prepares the prioritized patient list. Plan 3 stopped there — `init` only prepared a plan. Plan 4 (chapter 09) is what actually performs the treatment.

## Public command

```sh
bun run build
./dist/forge614-atlas init --engine claude-code
./dist/forge614-atlas init --force
```

Standard output is always JSON with `schemaVersion: 1`; no human-facing prose is emitted. `--engine` is optional and validated against Engines. `--force` starts a new session and includes previously reported modules again.

## `init` flow

1. Opens the Engram store and enables sessions.
2. Runs the real `~/.forge614/engines/bin/forge614-engines` binary (`.exe` on Windows) with `detect` and, for every installed agent, `capabilities --agent <id>`.
3. Keeps only installed agents with an executable and `supportsHeadlessExec: true`. An invalid `--engine` is never trusted.
4. Starts or resumes the Engram session and computes Plan 1 signals. When resuming, it excludes modules with an already-saved report.
5. Returns the engine, session, and pending modules with `ligero`, `estandar`, or `profundo` tiers.

Internally, this is the module list Plan 4 (chapter 09) consumes to actually dispatch work — as of Plan 4, `init` no longer returns this plan on its own and stops; it feeds it straight into dispatch and returns the real outcome (`"completed"` or `"paused"`, see chapter 09):

```json
{ "modules": [{ "name": "auth", "tier": "profundo" }] }
```

## Outcomes and failures (pre-dispatch)

These outcomes still short-circuit before any dispatch happens, unchanged since Plan 3: `already-complete` means the deterministic session has already closed. `engine-ambiguous` lists candidates and leaves an ambiguous choice to Shell. `engine-unavailable` means no headless candidate exists. `engine-invalid` returns the requested identifier and real candidates.

Operational failures are JSON too: `ENGINES_UNREACHABLE` covers an unreachable Engines binary or failed response; `ANALYSIS_FAILED` covers, among other cases, a directory without Git or without commits. This prevents a raw stack trace but does not change `computeChurn` behavior. Plan 4 adds two more error codes once dispatch starts (`WORKERS_UNREACHABLE`, `WORKERS_FATAL_ERROR`) — see chapter 09.

## Resolved limit

`discoverModules` used to consider only first-level directories, so a `src/{auth,billing}` layout collapsed into one `src` module, defeating percentile tiers for a common pattern. This was fixed before Plan 4 started: module discovery is now adaptively recursive (a folder with only subfolders is never a module itself; a folder with both loose files and subfolders splits into a loose-files module plus one module per subfolder), and module names are relative paths (`src/auth`) instead of bare folder names.
