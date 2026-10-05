# 12 (EN). Glossary

> **Status:** current for version 1.1.1 (branch `work/1.1.1`, not yet released).
> **Sister translation:** [12. Glosario](../es/12-glosario.md)

Atlas's own terms that appear in the manuals and in what it prints. Each one points to the chapter that explains it in depth. Errors and output statuses are in [chapter 11](11-troubleshooting.md).

## Module

The unit Atlas scores and sends for analysis: a folder with code files. Its name is the path relative to the project root (`src/auth`), so two folders with the same name in different places are never confused. Explained in [chapter 08](08-cli-core-and-run-plan.md) and [chapter 03](03-signals-metrics-and-formulas.md).

## Mixed folder

A folder that has loose code files and also subfolders. Atlas splits it: the loose files form one module and each subfolder is evaluated separately; a folder that only has subfolders is never a module by itself. Explained in [chapter 08](08-cli-core-and-run-plan.md).

## Signal

Each objective measure Atlas takes from a module's code to decide how much attention it deserves: cyclomatic complexity, fan-in, churn and test coverage gap. They always give the same result for the same code. Explained in [chapter 03](03-signals-metrics-and-formulas.md).

## Cyclomatic complexity

How many different paths a module's code can take (McCabe's rule): it starts at 1 and adds one for each `if`, `? :`, loop, `catch`, `case` (not `default`), `&&`, `||` and `??`. It is the sum of its files, test files excluded, and weighs 35 % in the score. Explained in [chapter 03](03-signals-metrics-and-formulas.md), section 2.2.

## Fan-in

How many different modules depend on a module (import it). A module many others depend on is more delicate to change; it weighs 35 % in the score. Explained in [chapter 03](03-signals-metrics-and-formulas.md), section 2.3.

## Churn

How many times a module's files changed in the Git history (once for each commit in which each file appears). That is why `init` needs a repository with commits; it weighs 30 % in the score. Explained in [chapter 03](03-signals-metrics-and-formulas.md), section 2.4.

## Test coverage gap

The share of a module's files that have no sibling test file (`x.test.ts` or `x.spec.ts` next to `x.ts`): 0 if all have one, 1 if none do. It does not add: it multiplies the score by up to 20 % more. Explained in [chapter 03](03-signals-metrics-and-formulas.md), sections 2.5 and 4.

## Min-Max normalization

Bringing each signal to a 0-to-1 scale (the module with the lowest value gets 0 and the highest gets 1) so that signals measuring different things can be added. If every module has the same value, it gives 0. Explained in [chapter 03](03-signals-metrics-and-formulas.md), section 3.

## Composite score

The number that orders the modules: 0.35 × complexity + 0.35 × fan-in + 0.30 × churn (already normalized), multiplied by 1 + 0.20 × test gap. Explained in [chapter 03](03-signals-metrics-and-formulas.md), section 4.

## Percentile

A module's position in the list ordered by score, instead of a fixed threshold. This way the split into tiers adapts to each project, large or small. Explained in [chapter 04](04-tier-classification-and-percentiles.md).

## Tier (nivel)

The amount of analysis a module receives: `profundo` (about the top 15 %, at least one), `estandar` (about the next 35 %) and `ligero` (the rest). The tier decides which AI model analyzes it and in what order it is dispatched; the final report uses the English names `deep`, `standard` and `light`. Explained in [chapter 04](04-tier-classification-and-percentiles.md) and [chapter 09](09-subagent-dispatch.md).

## Run plan

The list of pending modules with their tier that `init` builds before dispatching (`{ "modules": [{ "name": "auth", "tier": "profundo" }] }`). When resuming a session it leaves out the modules that already have a report. Explained in [chapter 08](08-cli-core-and-run-plan.md).

## Engine

The person's AI assistant that does the analysis: today `claude-code` (Claude Code) or `codex` (Codex). It is a candidate if Forge614 Engines sees it installed, with an executable and able to run without a screen (headless); it is chosen with `init --engine <id>`. Explained in [chapter 08](08-cli-core-and-run-plan.md) and [chapter 09](09-subagent-dispatch.md).

## Read-only helper

Each module analysis runs as a helper (subagent: a separate run of the engine) that can read the project but not write to it. The `readOnly: true` lock guarantees it, and Atlas always sets it; if Engines or Workers cannot honor it, Atlas does not start (`READ_ONLY_UNSUPPORTED`, `WORKERS_OUTDATED`). Explained in [chapter 09](09-subagent-dispatch.md).

## Workers batch

The set of tasks, one per module, that Atlas hands at once to Forge614 Workers, the program that runs them and returns one event per result. Tasks are ordered by tier: `profundo` first, then `estandar` and `ligero` last. Explained in [chapter 09](09-subagent-dispatch.md).

## Module report

The summary the helper writes about a module; Atlas saves it in Engram as soon as it arrives, under the topic key `atlas:module:<module name>`. Explained in [chapter 09](09-subagent-dispatch.md).

## Skipped module

A module the batch left without a report: its task failed, its answer arrived cut off or Engram refused to save it. It appears in `skippedModuleNames` of the final report; if the run finished, it is only analyzed again with `init --force`. Explained in [chapter 09](09-subagent-dispatch.md).

## Rejected report

A module report that Engram refused to save because its text looks like a secret (`SECRET_REJECTED`). The analysis goes on; the module counts as skipped and its name also appears in `rejectedReportModuleNames`. Explained in [chapter 09](09-subagent-dispatch.md).

## Atlas session

The record in Engram of an `init` run over a project. While it is open, the next `init` resumes it; once it is closed with the final report, `init` answers `already-complete` until `--force` is used, which opens a new session. Explained in [chapter 08](08-cli-core-and-run-plan.md) and [chapter 09](09-subagent-dispatch.md).

## Paused session

A session left open because the AI subscription quota ran out (`init` answers `paused`). What was already analyzed stays saved and a pause counter in Engram (`atlas:meta:pause-count`) goes up by one; the next `init` continues where it stopped. Explained in [chapter 09](09-subagent-dispatch.md) and [chapter 11](11-troubleshooting.md).

## `FORGE614_HOME`

The environment variable that says where the Forge614 products live; when it is not set, `~/.forge614` is used. Atlas installs into `<FORGE614_HOME>/atlas` and looks for Engines and Workers in that same folder; an empty or relative value is the `INVALID_FORGE614_HOME` error. Explained in [chapter 08](08-cli-core-and-run-plan.md) and [chapter 10](10-installer-and-release.md).

## PATH block

The lines the installer adds to the terminal profile (`~/.zshrc`, `~/.bashrc`, `~/.bash_profile` or the fish file) between `# >>> forge614-atlas PATH >>>` and `# <<< forge614-atlas PATH <<<`, so that the `forge614-atlas` command works in a new terminal. `uninstall` removes only that block. Explained in [chapter 10](10-installer-and-release.md) and [chapter 08](08-cli-core-and-run-plan.md).

## Error envelope

The fixed shape of every Atlas error answer: `{ "schemaVersion": 1, "status": "error", "error": { "code": "…", "message": "…" } }`. The `code` is stable and is what a program should read. Explained in [chapter 08](08-cli-core-and-run-plan.md) and [chapter 11](11-troubleshooting.md).

## `schemaVersion`

The version number of the shape of Atlas's JSON answers; today it is 1. It only goes up when an answer changes shape in an incompatible way. Explained in [chapter 08](08-cli-core-and-run-plan.md).
