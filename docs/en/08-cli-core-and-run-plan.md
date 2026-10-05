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
./dist/forge614-atlas --version
./dist/forge614-atlas --help
./dist/forge614-atlas update
./dist/forge614-atlas uninstall --confirmed
```

Standard output of `init` and `uninstall` is always JSON with `schemaVersion: 1`; no human-facing prose is emitted. `update` first lets the installer print its own messages in the terminal and then prints its JSON answer. `--version` and `--help` print plain text. The questions that `uninstall` asks go to the error output, so they never mix with the JSON. `--engine` is optional and validated against Engines. `--force` starts a new session and includes previously reported modules again.

The commands other than `init` never open Engram:

- `--version` (or `-v`, only as the first argument) prints the product name and the version from `package.json`, for example `forge614-atlas 1.1.0`. The name is part of the contract: like the other Forge614 products do with their own command, Atlas's `update` validates the installed command by reading exactly `forge614-atlas X.Y.Z`.
- `--help` (or `-h`) is answered in any position of the arguments — `forge614-atlas init --help` and `forge614-atlas uninstall --help` print the help too — before anything else runs, so asking for help never starts an analysis, creates a session or deletes anything. It prints a short English help with `init [--engine <id>] [--force]`, `update`, `uninstall [--from forge614-engram] [--confirmed]`, `--version, -v`, `--help, -h` and the `FORGE614_HOME` environment variable, and exits 0.
- `update` downloads the installer attached to the latest Atlas release (`https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh`) to a private temporary file, runs it with `bash <installer> --force` showing its messages in the terminal, then reads `<FORGE614_HOME>/atlas/bin/forge614-atlas --version` and answers `{ "schemaVersion": 1, "status": "updated", "updated": true|false, "previousVersion": "…", "installedVersion": "…" }`. The temporary file is always deleted. It takes no arguments.
- `uninstall [--from forge614-engram] [--confirmed]` removes Atlas from the disk and nothing else. It deletes only the folder `<FORGE614_HOME>/atlas/` (after checking it is a real folder, not a link, at exactly that path) and only the block between `# >>> forge614-atlas PATH >>>` and `# <<< forge614-atlas PATH <<<` in `~/.zshrc`, `~/.bash_profile` and `~/.bashrc`; the fish file `~/.config/fish/conf.d/forge614-atlas.fish` is deleted when the block is all it holds, and otherwise only the block is taken out. It never touches Engram, Engines, Shell, Workers, the saved memories or any other file. `--from` only accepts `forge614-engram`, which is how Engram calls it when it uninstalls itself (`uninstall --from forge614-engram --confirmed`, with no terminal, reading only the exit code). With `--confirmed` it asks nothing; without it, in a terminal, it asks to type exactly `REMOVE FORGE614-ATLAS`. The order is: check everything, remove the PATH blocks, delete the folder and only then print the result (the running binary can delete itself on macOS and Linux), so `uninstalled` is never printed when the deletion failed. If there is nothing left to remove and the confirmation is given (`--confirmed`, or the phrase typed in a terminal), it exits 0 with `removed: false`; without confirmation it still asks for it (`CONFIRMATION_REQUIRED` when there is no terminal). On success it prints `{ "schemaVersion": 1, "status": "uninstalled", "removed": true|false, "pathPublications": [<changed files>] }`. `removed` only tells whether the Atlas folder existed and was deleted; the PATH blocks are reported in `pathPublications`. If deleting the folder fails, it answers `UNINSTALL_FAILED` with exit 1, and the message says that the PATH blocks were already removed. A binary installed elsewhere with `install.sh --bin-dir` is not removed.

## `init` flow

1. Opens the Engram store and enables sessions (no session is opened yet).
2. Runs the real `<FORGE614_HOME>/engines/bin/forge614-engines` binary (`.exe` on Windows) with `detect` and, for every installed agent, `capabilities --agent <id>`. `<FORGE614_HOME>` is the `FORGE614_HOME` environment variable when it is set, and `~/.forge614` otherwise; the same folder is used to find Workers (`<FORGE614_HOME>/workers/bin/forge614-workers`).
3. Keeps only installed agents with an executable and `supportsHeadlessExec: true`. An invalid `--engine` is never trusted.
4. Checks the read-only requirements, before any session is opened: Engines must report `supportsReadOnly: true` for the chosen engine, the Workers binary must exist, and `forge614-workers --version` must print `forge614-workers X.Y.Z` with X.Y.Z at least 1.0.0 (details and error codes in chapter 09).
5. Starts or resumes the Engram session and computes Plan 1 signals. When resuming, it excludes modules with an already-saved report.
6. Returns the engine, session, and pending modules with `ligero`, `estandar`, or `profundo` tiers.

Internally, this is the module list Plan 4 (chapter 09) consumes to actually dispatch work — as of Plan 4, `init` no longer returns this plan on its own and stops; it feeds it straight into dispatch and returns the real outcome (`"completed"` or `"paused"`, see chapter 09):

```json
{ "modules": [{ "name": "auth", "tier": "profundo" }] }
```

## The `.forge614/project.json` file

When `init` starts a session, Engram (not Atlas) creates `.forge614/project.json` in the root of the analyzed repository if it does not exist. It is the project's portable identity: the project id and name, plus the ecosystem group when the project belongs to one. It travels with the repository, so it is meant to be committed; Atlas never reads it and ignores the `.forge614` folder when it scores modules (`scoring/discovery.ts`). If Engram cannot write the file, the run goes on without it. If the file exists but is not valid, Engram refuses it without changing it and `init` ends with `UNEXPECTED_ERROR` carrying Engram's message (Engram's own code for this, `PROJECT_FILE_INVALID`, is not part of the message); fix or delete the file. If the file declares a different project than the one Engram had linked to that folder, the file wins: Engram links the folder to the project the file declares and leaves the file as it is.

## Outcomes and failures (pre-dispatch)

These outcomes still short-circuit before any dispatch happens, unchanged since Plan 3: `already-complete` means the deterministic session has already closed. `engine-ambiguous` lists candidates and leaves an ambiguous choice to Shell. `engine-unavailable` means no headless candidate exists. `engine-invalid` returns the requested identifier and real candidates.

Operational failures are JSON too: `ENGINES_UNREACHABLE` covers an unreachable Engines binary or failed response; `ANALYSIS_FAILED` covers, among other cases, a directory without Git or without commits. This prevents a raw stack trace but does not change `computeChurn` behavior. `update` can fail with `UPDATE_FAILED` (download, installer or invalid installed version) and `INVALID_ARGUMENT` when it gets any argument. `uninstall` can answer `INVALID_ARGUMENT` (an unknown argument, or `--from` with anything other than `forge614-engram`), `CONFIRMATION_REQUIRED` (no `--confirmed` and no terminal; nothing is deleted), `UNINSTALL_CANCELLED` (exit 130: the typed phrase did not match; nothing is deleted), `UNINSTALL_UNSAFE` (the folder, or the Forge614 folder, is not a real folder; nothing is deleted), `PATH_REMOVE_FAILED` (a terminal profile is a link, is not a regular file, cannot be read or has unmatched marks — all checked before anything is changed — or a profile could not be rewritten, in which case the profiles listed before it were already cleaned) and `UNINSTALL_FAILED` (the Atlas folder could not be deleted; the PATH blocks were already removed). `INVALID_FORGE614_HOME` is answered by `init`, `update` and `uninstall` as soon as they start (exit code 1; `init` never opens Engram and `uninstall` checks its arguments first, so with an invalid argument it answers `INVALID_ARGUMENT`): the variable is set but empty, relative, or contains a NUL character — the same strict rule Engram applies, so a mistyped value never sends Atlas looking in an unexpected folder. Plan 4 adds two more error codes once dispatch starts (`WORKERS_UNREACHABLE`, `WORKERS_FATAL_ERROR`), and the read-only check adds `READ_ONLY_UNSUPPORTED` and `WORKERS_OUTDATED`; the requirements are verified right after the engine is chosen, before any Engram session is opened — see chapter 09.

## Resolved limit

`discoverModules` used to consider only first-level directories, so a `src/{auth,billing}` layout collapsed into one `src` module, defeating percentile tiers for a common pattern. This was fixed before Plan 4 started: module discovery is now adaptively recursive (a folder with only subfolders is never a module itself; a folder with both loose files and subfolders splits into a loose-files module plus one module per subfolder), and module names are relative paths (`src/auth`) instead of bare folder names.

## Commands, answers and exit codes

| Command | Success | Error codes (exit 1 unless noted) |
|---|---|---|
| `init` | `completed`, `paused`, `already-complete`, `engine-ambiguous`, `engine-unavailable`, `engine-invalid` (exit 0) | `INVALID_FORGE614_HOME`, `ENGINES_UNREACHABLE`, `ANALYSIS_FAILED`, `READ_ONLY_UNSUPPORTED`, `WORKERS_UNREACHABLE`, `WORKERS_OUTDATED`, `WORKERS_FATAL_ERROR`, `UNEXPECTED_ERROR` |
| `update` | `status: "updated"` (exit 0) | `INVALID_FORGE614_HOME`, `INVALID_ARGUMENT`, `UPDATE_FAILED` |
| `uninstall` | `status: "uninstalled"` (exit 0) | `INVALID_FORGE614_HOME`, `INVALID_ARGUMENT`, `CONFIRMATION_REQUIRED`, `UNINSTALL_CANCELLED` (exit 130), `UNINSTALL_UNSAFE`, `PATH_REMOVE_FAILED`, `UNINSTALL_FAILED` |
| `--version`, `--help` (also `-v` and `-h`; help in any position) | text (exit 0) | none |
| anything else | none | `UNKNOWN_COMMAND` |

`init` exits with 1 whenever its answer carries an `error`. `completed` carries the optional field `rejectedReportModuleNames` (see chapter 09). Every error uses the same envelope, `{ "schemaVersion": 1, "status": "error", "error": { "code": "...", "message": "..." } }` (`UNKNOWN_COMMAND` carries the received `argv` instead of a `message`).
