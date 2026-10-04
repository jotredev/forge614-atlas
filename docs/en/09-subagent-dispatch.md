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

Error codes join the existing `ENGINES_UNREACHABLE`/`ANALYSIS_FAILED`: `WORKERS_UNREACHABLE` (the `forge614-workers` binary is missing or not executable), `WORKERS_FATAL_ERROR` (the whole batch could not run at all — malformed input or an unreachable `forge614-engines` binary from Workers' own perspective), and the two read-only codes described next, `READ_ONLY_UNSUPPORTED` and `WORKERS_OUTDATED`.

**Every helper is read-only, always.** Each task Atlas sends carries `readOnly: true`; there is no option to turn it off. `forge614-workers` then asks `forge614-engines` for the lock and refuses to run the task if Engines cannot guarantee it. In plain words, Engines puts the lock on like this: Claude Code gets only the three reading tools (`Read`, `Grep`, `Glob`), no permission prompts it could never answer, and none of the user's MCP servers, so it cannot write a file or save anything into Engram; Codex runs in its read-only sandbox, asked for explicitly, without the user's own configuration.

**The requirements are checked at the start, before Engram is touched.** Right after the engine is chosen — and before any session is opened or resumed — `init` checks three things, in this order, and stops with a JSON error if one fails:

1. `READ_ONLY_UNSUPPORTED` — `capabilities --agent <id>` does not say `supportsReadOnly: true` (a missing field counts as `false`). Engines 1.17.0 or newer is required; the message ends with `Update it with: forge614-engines update`.
2. `WORKERS_UNREACHABLE` — the `forge614-workers` binary is missing or not executable.
3. `WORKERS_OUTDATED` — `forge614-workers --version` (no input, 10-second limit) does not print exactly `forge614-workers X.Y.Z` with X.Y.Z at least 1.0.0, exits with a non-zero code, or does not finish in time. The check matters because a Workers older than 1.0.0 silently ignores `readOnly` and the helper would run without the lock. The message names the version found (`unknown` when it could not be read) and the installer to run.

**A second line of defense.** If, even so, Workers rejects tasks with `task_failed` whose `stderr` starts with `READ_ONLY_UNSUPPORTED` (Workers ran nothing for those tasks), Atlas does not count those modules as skipped: it lets the batch finish and ends with the same `READ_ONLY_UNSUPPORTED` error, leaving the Engram session open. Otherwise the run would look "completed" with zero modules analyzed and no reason.

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

Before including a reasoning level in a task, Atlas checks `forge614-engines`' `capabilities --agent <id>` for the real `supportsReasoningLevel: boolean` field. Since Engines 1.16.0 both Claude Code (through `--effort`) and Codex report `true`, so both engines receive the level: Engines accepts five (`low`, `medium`, `high`, `xhigh`, `max`) and Atlas uses only two of them, `low` and `medium`, because of Rule 1. Haiku 4.5 has no levels: Claude Code ignores the level there without an error, so the `ligero` tier on Claude Code sends `low` with no real effect. The check stays as a defense — if an engine ever reports `false`, Atlas sends the model alone.

## Reading the real project files: `readableDir`

`forge614-workers` runs every task in an isolated, empty scratch directory — it never runs *from* the real project, so no accidental config/memory bleed happens between modules or between different projects. But the AI still needs to read the actual code. Every task Atlas builds carries `readableDir` pointing at the project's root, which `forge614-engines`' `headless` command turns into `--add-dir <path>` (Claude Code and Codex). `readableDir` only grants access to the folder — it does not stop writing; that is the job of the `readOnly: true` lock every task also carries (see above).

This was verified with real, live tests, not assumed:

- **Claude Code:** confirmed that `--add-dir` grants read access to the real files without ever loading that project's own `CLAUDE.md` — only the user's own global `CLAUDE.md` loads, which is expected (it's the person's identity, not the project's).
- **Codex:** confirmed the same read access works, and confirmed a real, accepted limitation — Codex *can* read and be influenced by the analyzed project's own `AGENTS.md` if it decides to explore the directory on its own initiative. The risk is low: with `readOnly: true` Engines asks for Codex's `read-only` sandbox explicitly, so nothing can be written or damaged, only the tone/context of that one analysis could be nudged.

The analysis prompt always asks for a narrative summary — never "the raw content" — because Claude Code can reject a prompt that reads like a data-exfiltration pattern (confirmed live during this plan's own testing).

## Streaming the batch

Atlas sends `forge614-workers` **one single batch** per `init` run — never one invocation per module — with the full ordered task list over `stdin`. It then reads NDJSON events from `stdout` as they arrive:

- `task_completed` → the module's report is saved to Engram **immediately** (`recordModuleReport`), never accumulated until the end. If the reported output was truncated (`stdoutTruncated: true`, meaning it hit the byte cap), the module is treated as skipped instead of saved, so the next `init`/resume retries it rather than permanently keeping a cut-off analysis.
- `task_failed` → the module is recorded as skipped; dispatch continues with the rest. The one exception is a `stderr` that starts with `READ_ONLY_UNSUPPORTED` (the second line of defense above): that ends the run with that error instead.
- `quota_exhausted` → dispatch stops immediately. The Engram session is deliberately **left open** — that open state *is* the "this run is incomplete" signal for the next `init`, which resumes automatically (same mechanism Plan 2 already built). A running pause counter, itself stored in Engram (`atlas:meta:pause-count`), is incremented so the eventual closing report's `pauseCount` reflects the project's whole lifetime, not just the final run.
- `fatal_error` → the whole batch never produced anything usable; mapped to `WORKERS_FATAL_ERROR`.
- `run_completed` → carries the aggregate timing used for `totalTimeMs`.

## Final report

Once every module is accounted for, Atlas calls the same `finalizeRun` Plan 2 already built, closing the session with the six fixed Engram summary fields. `pauseCount` is read back from the running counter, so it reflects every pause across every `init`/resume cycle for that project — not just the final one that happened to finish it.
