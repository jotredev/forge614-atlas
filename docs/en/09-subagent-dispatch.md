# 09 (EN). Real Subagent Dispatch

> **Status:** Plan 4/5 completed and merged into `main`.
> **Sister translation:** [09. Despacho Real de Subagentes](../es/09-despacho-de-subagentes.md)

## Purpose

Plan 3 built the hospital reception desk — it triages the patients (modules) and writes the priority list. Plan 4 is the medical staff actually walking the floor: `forge614-atlas init` now dispatches each pending module to a real AI engine, saves each finding into Engram the moment it lands, and produces a real closing report instead of just a plan.

Dispatch happens through a separate, dedicated node of the Forge614 ecosystem: **`forge614-workers`**. Atlas never talks to a CLI like `claude` or `codex` directly — it hands `forge614-workers` a batch of tasks and reads back a stream of structured events. `forge614-workers` never decides anything and never saves anything; Atlas is the only one that writes to Engram, exactly as already established in Plan 2.

## What changed in the public contract

`init`'s output no longer stops at `"ready"`. That status is gone. Two new terminal outcomes replace it:

```json
{
  "schemaVersion": 1,
  "status": "completed",
  "engine": { "id": "claude-code", "executable": "/usr/local/bin/claude" },
  "session": { "sessionId": "atlas:…", "resumed": false },
  "report": {
    "repoName": "/path/to/analyzed/repo",
    "tierBreakdown": { "deep": 1, "standard": 3, "light": 6 },
    "engineByTier": { "deep": "claude-code", "standard": "claude-code", "light": "claude-code" },
    "totalWorkersByTier": { "deep": 1, "standard": 3, "light": 6 },
    "tokensConsumed": 0,
    "totalTimeMs": 184320,
    "pauseCount": 0,
    "analyzedModuleNames": ["src/auth", "src/billing"],
    "skippedModuleNames": []
  }
}
```

```json
{
  "schemaVersion": 1,
  "status": "paused",
  "engine": { "id": "claude-code", "executable": "/usr/local/bin/claude" },
  "session": { "sessionId": "atlas:…", "resumed": true },
  "analyzedCount": 4,
  "pendingCount": 6
}
```

Two new error codes join the existing `ENGINES_UNREACHABLE`/`ANALYSIS_FAILED`: `WORKERS_UNREACHABLE` (the `forge614-workers` binary is missing or not executable — checked before dispatch even starts) and `WORKERS_FATAL_ERROR` (the whole batch could not run at all — malformed input or an unreachable `forge614-engines` binary from Workers' own perspective).

`tokensConsumed` is deliberately always `0` today: `forge614-workers` never interprets the content of an engine's response (that boundary was chosen on purpose, see the Workers design spec), so Atlas has no real number to report yet.

## Order of dispatch

Modules are grouped and dispatched in a fixed order: **Profundo → Estándar → Ligero**. If the subscription's quota runs out mid-run, whatever already got analyzed is the highest-value work (core, auth, billing) — what's left for the next `init` is the least critical.

## Model and reasoning-level resolution

For each module, Atlas looks up the fixed table (model per tier and engine):

| Tier | Claude Code | Codex |
|---|---|---|
| Ligero | `claude-haiku-4-5-20251001` | `gpt-5.6-luna` |
| Estándar | `claude-sonnet-5` | `gpt-5.6-terra` |
| Profundo | `claude-opus-5` | `gpt-5.6-sol` |

Before including a reasoning level in a task, Atlas checks `forge614-engines`' `capabilities --agent <id>` for the real `supportsReasoningLevel: boolean` field (added in Engines v1.11.0). Today Claude Code reports `false` and Codex reports `true` — Atlas simply never asks Claude Code for a reasoning level; it never gets the chance to reject it.

## Reading the real project files: `readableDir`

`forge614-workers` runs every task in an isolated, empty scratch directory — it never runs *from* the real project, so no accidental config/memory bleed happens between modules or between different projects. But the AI still needs to read the actual code. Every task Atlas builds carries `readableDir` pointing at the project's root, which `forge614-engines`' `headless` command turns into `--add-dir <path>` (Claude Code) or `--add-dir <path>` (Codex, kept at its default `read-only` sandbox).

This was verified with real, live tests, not assumed:

- **Claude Code:** confirmed that `--add-dir` grants read access to the real files without ever loading that project's own `CLAUDE.md` — only the user's own global `CLAUDE.md` loads, which is expected (it's the person's identity, not the project's).
- **Codex:** confirmed the same read access works, and confirmed a real, accepted limitation — Codex *can* read and be influenced by the analyzed project's own `AGENTS.md` if it decides to explore the directory on its own initiative (there is no Codex equivalent to Claude Code's per-tool `--allowedTools` restriction). The risk is low: Codex's sandbox stays `read-only`, so nothing can be written or damaged, only the tone/context of that one analysis could be nudged.

The analysis prompt always asks for a narrative summary — never "the raw content" — because Claude Code can reject a prompt that reads like a data-exfiltration pattern (confirmed live during this plan's own testing).

## Streaming the batch

Atlas sends `forge614-workers` **one single batch** per `init` run — never one invocation per module — with the full ordered task list over `stdin`. It then reads NDJSON events from `stdout` as they arrive:

- `task_completed` → the module's report is saved to Engram **immediately** (`recordModuleReport`), never accumulated until the end. If the reported output was truncated (`stdoutTruncated: true`, meaning it hit the byte cap), the module is treated as skipped instead of saved, so the next `init`/resume retries it rather than permanently keeping a cut-off analysis.
- `task_failed` → the module is recorded as skipped; dispatch continues with the rest.
- `quota_exhausted` → dispatch stops immediately. The Engram session is deliberately **left open** — that open state *is* the "this run is incomplete" signal for the next `init`, which resumes automatically (same mechanism Plan 2 already built). A running pause counter, itself stored in Engram (`atlas:meta:pause-count`), is incremented so the eventual closing report's `pauseCount` reflects the project's whole lifetime, not just the final run.
- `fatal_error` → the whole batch never produced anything usable; mapped to `WORKERS_FATAL_ERROR`.
- `run_completed` → carries the aggregate timing used for `totalTimeMs`.

## Final report

Once every module is accounted for, Atlas calls the same `finalizeRun` Plan 2 already built, closing the session with the six fixed Engram summary fields. `pauseCount` is read back from the running counter, so it reflects every pause across every `init`/resume cycle for that project — not just the final one that happened to finish it.
