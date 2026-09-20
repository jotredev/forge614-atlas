# 08 (EN). CLI Core and JSON Run Plan

> **Status:** Plan 3/5 completed and merged into `main` (`2b5272c`).  
> **Sister translation:** [08. Núcleo del CLI y plan de corrida JSON](../es/08-nucleo-cli-y-plan-de-corrida.md)

## Purpose

At this stage Atlas is a hospital reception desk: it receives a repository, confirms which specialist can treat it, and prepares the prioritized patient list. It does not perform treatment. `init` prepares a plan; subagent dispatch belongs to Plan 4 and does not exist yet.

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

Example result that Plan 4 can consume:

```json
{
  "schemaVersion": 1,
  "status": "ready",
  "engine": { "id": "claude-code", "executable": "/usr/local/bin/claude" },
  "session": { "sessionId": "atlas:…", "resumed": false },
  "modules": [{ "name": "auth", "tier": "profundo" }]
}
```

## Outcomes and failures

`already-complete` means the deterministic session has already closed. `engine-ambiguous` lists candidates and leaves an ambiguous choice to Shell. `engine-unavailable` means no headless candidate exists. `engine-invalid` returns the requested identifier and real candidates.

Operational failures are JSON too: `ENGINES_UNREACHABLE` covers an unreachable Engines binary or failed response; `ANALYSIS_FAILED` covers, among other cases, a directory without Git or without commits. This prevents a raw stack trace but does not change `computeChurn` behavior.

## Known blocking limit

`discoverModules` considers only first-level directories. A `src/{auth,billing}` layout becomes one `src` module, defeating percentile tiers for a common pattern. This must be fixed before Plan 4, which will consume this plan directly.
