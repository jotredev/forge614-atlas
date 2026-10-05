# Contract of Atlas (`forge614-atlas`)

> One-sentence analogy: Atlas is the cartographer who walks a project, decides how much effort each area deserves and files the map in memory; it is not the site manager who hands out the jobs.

Version of this contract: the product's (`package.json`). Translation: [CONTRACT.md](CONTRACT.md).

## Purpose
Atlas contextualizes a code project in depth and saves the result in Engram; it is not the job orchestrator.

## What it does
- Scores the project's modules without AI (cyclomatic complexity, fan-in, Git churn and test gap) and splits them into three percentile tiers: Light, Standard and Deep.
- Chooses the model and reasoning level of each module with a fixed table (`MODEL_TABLE` in `src/modules/cli/task-config.ts`); reasoning never goes above `medium`.
- Sends Workers a single batch per run, with `readOnly: true` on every task (see "Read-only helpers").
- Saves one report per module in Engram as soon as it arrives, and closes the session with a summary. A run interrupted by quota is continued by the next `init`.
- Provides the commands `init`, `update`, `uninstall`, `--version` and `--help`.
- Locates the Forge614 folder with `FORGE614_HOME` (absolute path; `~/.forge614` without the variable), with the same strict rule as Engram.

## What it does not do
- It does not detect AI engines: that is Engines' job. If more than one engine is possible and `--engine` was not given, it answers `engine-ambiguous` and leaves the choice to Shell.
- It does not run AI processes on its own: that is Workers' job.
- It does not let the helpers write to memory: only Atlas saves to Engram.
- It has no text interface of its own: the only visual experience is Shell.
- It does not register MCP or touch the configuration of any AI assistant, neither when installing nor when running.
- It does not install, update or uninstall other products; its `uninstall` removes only its own folder and its own PATH block.

## Dependencies
| Node or binary | How it is consumed | Minimum version |
| --- | --- | --- |
| Engram | TypeScript SDK compiled into the Atlas binary; the memory database is shared with the installed Engram (`<FORGE614_HOME>/engram`) | 1.8.7 |
| Engines | Binary `<FORGE614_HOME>/engines/bin/forge614-engines`: `detect` and `capabilities --agent <id>`; it must report `supportsReadOnly: true` | 1.17.0 |
| Workers | Binary `<FORGE614_HOME>/workers/bin/forge614-workers`: receives the batch on `stdin` and emits NDJSON events; `--version` must print `forge614-workers X.Y.Z` | 1.0.0 |
| Shell | Not called; installed by Engram's installer and decides the ambiguous engine choices | — |

Atlas's installer makes sure of Engram, Workers and Engines before it creates anything of Atlas (see chapter 10 of the manuals).

## Public commands
| Command | Input (schema) | Output (schema) | `schemaVersion` | Exit codes |
| --- | --- | --- | --- | --- |
| `init [--engine <id>] [--force]` | The current folder as the project | JSON: `completed`, `paused`, `already-complete`, `engine-ambiguous`, `engine-unavailable`, `engine-invalid` or the error envelope (chapters 08 and 09 of the manuals) | 1 | 0; 1 if it answers an error |
| `update` | None | JSON `{ status: "updated", updated, previousVersion, installedVersion }` | 1 | 0; 1 on failure |
| `uninstall [--from forge614-engram] [--confirmed]` | None; `--confirmed` skips the question | JSON `{ status: "uninstalled", removed, pathPublications }` | 1 | 0; 1 on failure; 130 if the person cancels |
| `--version`, `-v` | First argument | Text `forge614-atlas X.Y.Z` | — | 0 |
| `--help`, `-h` | In any position of the arguments | Help text | — | 0 |

## Error codes
| Code | Meaning |
| --- | --- |
| `INVALID_FORGE614_HOME` | `FORGE614_HOME` is set but empty, relative or contains a NUL character; `init`, `update` and `uninstall` answer it before doing anything else |
| `ENGINES_UNREACHABLE` | The Engines binary does not respond or its answer failed |
| `ANALYSIS_FAILED` | The project could not be scored (for example, no Git or no commits) |
| `READ_ONLY_UNSUPPORTED` | Engines does not declare `supportsReadOnly: true` for the chosen engine (an Engines older than 1.17.0 does not have that field and counts as not declared), or Workers refused to run tasks for the same reason |
| `WORKERS_UNREACHABLE` | The Workers binary does not exist or is not executable |
| `WORKERS_OUTDATED` | Workers is older than 1.0.0 or `--version` does not answer `forge614-workers X.Y.Z` |
| `WORKERS_FATAL_ERROR` | Workers could not run the batch |
| `UNEXPECTED_ERROR` | An unforeseen failure, carrying the original message |
| `UPDATE_FAILED` | `update`: the download or the installer failed, or the installed version is not valid |
| `INVALID_ARGUMENT` | `update` or `uninstall` received an argument they do not accept |
| `CONFIRMATION_REQUIRED` | `uninstall` without `--confirmed` and without a terminal; nothing is deleted |
| `UNINSTALL_CANCELLED` | `uninstall`: the typed phrase did not match (exit 130); nothing is deleted |
| `UNINSTALL_UNSAFE` | The Atlas folder or the Forge614 folder is not a real folder; nothing is deleted |
| `PATH_REMOVE_FAILED` | A terminal profile cannot be changed safely or could not be rewritten |
| `UNINSTALL_FAILED` | The Atlas folder could not be deleted; the PATH blocks were already removed |
| `UNKNOWN_COMMAND` | A command Atlas does not know |

## Mandatory requirements for supported AI assistants
`atlas` section of `standard/procedures/new-agent-checklist.md` (standard 1.1.2). Every new engine adds its row to `MODEL_TABLE` in `src/modules/cli/task-config.ts` (and to the `EngineId` type), and to the tables of chapters 01, 04 and 09 of the manuals and of `STATE.md`.

## Compatibility
Breaking changes bump `schemaVersion`; one compatibility version is kept. `schemaVersion` goes up with any breaking change in the output of `init`, `update` or `uninstall`.

## Read-only helpers
Every task Atlas sends to Workers carries `readOnly: true`, always and with no option to turn it off. Atlas refuses to start (`READ_ONLY_UNSUPPORTED`, `WORKERS_OUTDATED`) when Engines 1.17.0 or Workers 1.0.0 cannot guarantee it, and it checks this before opening or resuming any Engram session.

## Uninstall contract with Engram
Engram uninstalls Atlas with `forge614-atlas uninstall --from forge614-engram --confirmed`: with no terminal, ignoring the output and reading only the exit code. Exit code 0 means Atlas removed only `<FORGE614_HOME>/atlas/` and its own PATH block (never Engram, Engines, Shell, Workers or the saved memories); any other code means Atlas could not uninstall itself and Engram is left unchanged.

## Own error envelope
Every Atlas error uses `{ "schemaVersion": 1, "status": "error", "error": { "code": "...", "message": "..." } }`. It differs from the ecosystem's standard error envelope (`{ schemaVersion, code, error }`) on purpose: Shell already reads this one, and changing it would break its consumer. `UNKNOWN_COMMAND` carries the received `argv` instead of `message`.

## Windows
Declared debt of version 1.1.0: the ecosystem contract asks for macOS, Linux and Windows, and Atlas publishes only macOS and Linux (x64 and arm64); there is no `install.ps1` and no Windows binary.
