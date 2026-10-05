# 11 (EN). Troubleshooting

> **Status:** current for version 1.1.1 (branch `work/1.1.1`, not yet released).
> **Sister translation:** [11. Resolución de errores](../es/11-resolucion-de-errores.md)

## Purpose

This chapter is Atlas's "what do I do now". For every answer that is not a success it says what the person sees, why it happens (with the file and line of the code that produces it) and what to do. The list comes from the "Códigos de error" table in `CONTRACT.md` (16 codes) and from the five `init` statuses that do not deliver a finished analysis. Each command is detailed in [chapter 08](08-cli-core-and-run-plan.md) and the dispatch in [chapter 09](09-subagent-dispatch.md).

Every error goes to standard output with the same envelope (the fixed shape of an error answer):

```json
{ "schemaVersion": 1, "status": "error", "error": { "code": "…", "message": "…" } }
```

`UNKNOWN_COMMAND` is the exception: it carries `argv` (the arguments received) instead of `message`. Atlas's messages are in English and are quoted here as they are; those that come from Engram (for example, the `UNEXPECTED_ERROR` one about `.forge614/project.json`) are in Spanish.

## Exit codes

| Code | When |
|:---:|---|
| `0` | Success: `init` with `completed`, `paused`, `already-complete`, `engine-ambiguous`, `engine-unavailable` or `engine-invalid`; `update` with `updated`; `uninstall` with `uninstalled`; `--version` and `--help`. |
| `1` | Any answer with `status: "error"`, except `UNINSTALL_CANCELLED`. |
| `130` | Only `UNINSTALL_CANCELLED`: the person typed something other than the confirmation phrase. |

Note: the five `init` statuses in the last section exit with `0` even though they did not deliver a finished analysis (`paused` may already have saved part of the reports; `already-complete` analyzes nothing; `src/interfaces/cli/commands.ts:61` only sets `1` when the answer carries `error`). A program that calls Atlas must read `status`, not only the exit code.

## Configuration and usage errors

### `INVALID_FORGE614_HOME`

- **What you see:** `"code": "INVALID_FORGE614_HOME"`, message `FORGE614_HOME must be a non-empty absolute path.`, exit 1. `init`, `update` and `uninstall` answer it as soon as they start (`init` never opens Engram; `uninstall` checks its arguments first, so with an invalid argument it answers `INVALID_ARGUMENT`).
- **Why it happens:** the `FORGE614_HOME` variable exists but is empty, is a relative path (for example `relative/forge614`) or contains a null character (`src/modules/forge-home/forge-home.ts:38`). An empty variable is not ignored: it is an error, just as in Engram.
- **What to do:** check its value with `echo "$FORGE614_HOME"`. Give it an absolute path (`export FORGE614_HOME="$HOME/.forge614"`) or remove it (`unset FORGE614_HOME`) to use the default folder, `~/.forge614`. If you set it in your terminal profile (`~/.zshrc`, `~/.bashrc`…), fix it there too.

### `UNKNOWN_COMMAND`

- **What you see:** `{ "schemaVersion": 1, "status": "error", "error": { "code": "UNKNOWN_COMMAND", "argv": [...] } }`, exit 1.
- **Why it happens:** the first argument is not `init`, `update`, `uninstall`, `--version` or `-v` (`src/interfaces/cli/main.ts:65`). For example, `forge614-atlas analyze`.
- **What to do:** run `forge614-atlas --help` to see the commands that exist. If `--help` or `-h` appears anywhere on the line, Atlas prints the help instead of this error.

### `INVALID_ARGUMENT`

- **What you see:** exit 1 with one of these messages:
  - `forge614-atlas update takes no arguments.` (`src/modules/updater/updater.ts:144`): `update` received something, for example `update --force`.
  - `--from only accepts forge614-engram.` (`src/interfaces/cli/uninstall-command.ts:68`): `uninstall --from` with no value or another value.
  - `Unknown argument for uninstall: <argument>` (`src/interfaces/cli/uninstall-command.ts:73`).
- **What to do:** `update` takes no arguments: run `forge614-atlas update`. `uninstall` only accepts `--confirmed` and `--from forge614-engram` (the latter is what Engram uses when it uninstalls Atlas; it does not change what is done).

### `UNEXPECTED_ERROR`

- **What you see:** `"code": "UNEXPECTED_ERROR"` with the original failure message, exit 1.
- **Why it happens:** something failed outside the expected cases and reached the `.catch` at `src/interfaces/cli/main.ts:73`. Known cases: Engram could not open its database or its session when `init` starts; the project's `.forge614/project.json` file exists but is not valid (Engram rejects it; see chapter 08); or a file-system error that `uninstall` did not expect (for example, a permission error).
- **What to do:** read the message: it states the real cause. If it names `project.json`, fix or delete `.forge614/project.json` at the project root and run `forge614-atlas init` again. If it is a permission error, fix the permissions of the path it names. If the message gives no clue, try again; an error that repeats the same way is an Atlas or Engram bug: what is left is to tell whoever maintains Forge614, with the full message.

## `init` errors before the analysis

### `ENGINES_UNREACHABLE`

- **What you see:** exit 1 with `forge614-engines detect failed: <detail>` (`src/modules/engines-client/detect.ts:43`) or `forge614-engines capabilities failed for <agent>: <detail>` (`src/modules/engines-client/capabilities.ts:50`). `init` answers it at `src/modules/cli/init.ts:169` and `:179`.
- **Why it happens:** the Engines binary, `<FORGE614_HOME>/engines/bin/forge614-engines`, does not exist, does not start or ends with an error. If it answers something that is not JSON (text with fields), the message is the JSON parsing error.
- **What to do:** check that it exists and answers: `~/.forge614/engines/bin/forge614-engines --version` (replace `~/.forge614` with your `FORGE614_HOME` if you use one) and `~/.forge614/engines/bin/forge614-engines detect`. If it is missing or fails, install or update it with `curl -fsSL https://github.com/jotredev/forge614-engines/releases/latest/download/install.sh | bash`, or with `forge614-engines update` if it is already installed. Then run `forge614-atlas init` again.

### `READ_ONLY_UNSUPPORTED`

- **What you see:** exit 1 and `Forge614 Engines does not guarantee read-only helpers for "<agent>" (Engines 1.17.0 or newer is required). Update it with: forge614-engines update` (`src/modules/cli/requirements.ts:37`).
- **Why it happens:** at two moments. (1) At start, before any Engram session is opened: Engines does not declare `supportsReadOnly: true` for the chosen engine (`src/modules/cli/requirements.ts:85`; an Engines older than that field does not declare it, and Atlas takes its absence as `false`). (2) During dispatch: Workers refused to run tasks because it could not guarantee the read-only lock (`src/modules/cli/init.ts:134`); in that case the Engram session stays open. Atlas never sends a helper that could write to your project.
- **What to do:** run `forge614-engines update` and then `forge614-engines capabilities --agent <agent>`, which must show `supportsReadOnly` as `true`. Run `forge614-atlas init` again; if the session was left open, it is resumed.

### `WORKERS_UNREACHABLE`

- **What you see:** exit 1 and the system message from looking up the file, for example `ENOENT: no such file or directory, access '<path>'` (`src/modules/cli/requirements.ts:91`).
- **Why it happens:** the Workers binary, `<FORGE614_HOME>/workers/bin/forge614-workers`, does not exist or is not executable. This is checked before any session is opened.
- **What to do:** install it with `curl -fsSL https://github.com/jotredev/forge614-workers/releases/latest/download/install.sh | bash`, or run `forge614-atlas update`: the Atlas installer installs Workers when it is missing. If the file exists, check its permissions (`ls -l ~/.forge614/workers/bin/forge614-workers`).

### `WORKERS_OUTDATED`

- **What you see:** exit 1 and `Forge614 Workers 1.0.0 or newer is required (found: <version or unknown>). Install it with: curl -fsSL https://github.com/jotredev/forge614-workers/releases/latest/download/install.sh | bash` (`src/modules/cli/requirements.ts:46`, returned at `:96`).
- **Why it happens:** `forge614-workers --version` answered a version older than 1.0.0, did not answer within 10 seconds, exited with an error or did not print exactly `forge614-workers X.Y.Z`. A Workers older than 1.0.0 would ignore the read-only lock, which is why Atlas does not use it.
- **What to do:** run the install command in the message (or `forge614-atlas update`, which also reinstalls it when it is old) and check with `forge614-workers --version`.

### `ANALYSIS_FAILED`

- **What you see:** exit 1; the most common message is `git log failed in <folder>: <git error>` (`src/modules/scoring/churn.ts:53`). `init` answers it at `src/modules/cli/init.ts:205` and `:219`.
- **Why it happens:** Atlas could not score the project. The typical cause is that the folder is not a Git repository or has no commits: churn (how many times each file changed) comes from the Git history. An error while reading the project's folders also ends up here.
- **What to do:** run `forge614-atlas init` from the root of a repository with at least one commit (`git status` and `git log -1` must work). In a new project: `git init`, `git add .` and `git commit -m "first commit"`. If the message is about permissions, fix them on the folder it names.

## `init` errors during dispatch

### `WORKERS_FATAL_ERROR`

- **What you see:** exit 1 with one of these messages:
  - `<reason>: <detail>` when Workers reported a fatal error (`src/modules/cli/dispatch-modules.ts:140`, answered at `src/modules/cli/init.ts:127`). The reasons Workers uses are `invalid_input`, `engines_bin_not_found` and `unexpected_error`.
  - The error that stopped the dispatch (`src/modules/cli/init.ts:120`), for example `runWorkersBatch: failed to parse NDJSON line from forge614-workers: …` (Workers printed a line that is not JSON) or `runWorkersBatch: onEvent handler threw while processing a "task_completed" event` (saving a report in Engram failed for a reason other than `SECRET_REJECTED`, which is when Engram refuses to save a text that looks like a secret: in that case Atlas skips the module and goes on; see the [glossary](12-glossary.md), «Rejected report»).
- **Why it happens:** Workers could not run the task batch, or Atlas could not process what it returned. The Engram session is not closed and the reports already saved stay.
- **What to do:** with `engines_bin_not_found`, install or repair Engines as in `ENGINES_UNREACHABLE`. Otherwise, check Workers (`forge614-workers --version`) and run `forge614-atlas init` again: it resumes the session and does not repeat the modules that already have a report. If it repeats the same way, what is left is to tell whoever maintains Forge614, with the full message.

## `update` errors

### `UPDATE_FAILED`

- **What you see:** exit 1 and a JSON with one of these messages (built at `src/modules/updater/updater.ts:157`); if the installer got to run, its messages come out first in the terminal:
  - `Could not download the Forge614 Atlas installer.` (`src/modules/updater/updater.ts:73`), or a network error: the installer could not be downloaded.
  - `The Forge614 Atlas installer failed; the installed version was not confirmed.` (`src/modules/updater/updater.ts:106`): the installer ended with an error; the cause is in its messages, right above (for example, a dependency that could not be installed, followed by `Atlas was not changed.`).
  - `The installed Forge614 Atlas did not report a valid version.` (`src/modules/updater/updater.ts:59`): the installed binary did not answer `forge614-atlas X.Y.Z`.
- **What to do:** check the connection and run `forge614-atlas update` again. If the installer failed, fix what its messages say (for example, update Engines with `forge614-engines update`) and repeat. You can also run the installer by hand: `curl -fsSL https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh | bash -s -- --force`.

## `uninstall` errors

In all these cases, except `PATH_REMOVE_FAILED` while rewriting and `UNINSTALL_FAILED`, **nothing was removed**.

### `CONFIRMATION_REQUIRED`

- **What you see:** exit 1 and `Run it from a terminal and type REMOVE FORGE614-ATLAS, or pass --confirmed.` (`src/interfaces/cli/uninstall-command.ts:94`).
- **Why it happens:** you ran `uninstall` without `--confirmed` and without a terminal to ask in (for example, from a script).
- **What to do:** run it from a terminal and type the phrase, or add `--confirmed`: `forge614-atlas uninstall --confirmed`.

### `UNINSTALL_CANCELLED`

- **What you see:** exit **130** and `The confirmation did not match; nothing was removed.` (`src/interfaces/cli/uninstall-command.ts:99`).
- **Why it happens:** you answered the question with something other than `REMOVE FORGE614-ATLAS`, exactly, in capitals.
- **What to do:** if you did want to uninstall, run `forge614-atlas uninstall` again and type the phrase as it is.

### `UNINSTALL_UNSAFE`

- **What you see:** exit 1 and `The Forge614 folder is not a real folder; nothing was removed.` or `The Forge614 Atlas folder is not a real folder; nothing was removed.` (`src/modules/uninstall/uninstall.ts:99` and `:103`).
- **Why it happens:** `<FORGE614_HOME>` or `<FORGE614_HOME>/atlas` exists but is not a real folder: it is a symbolic link (a shortcut to another path) or another kind of file. Atlas does not delete through a link, so as not to delete something that lives elsewhere.
- **What to do:** look at it with `ls -ld ~/.forge614 ~/.forge614/atlas` (or with your `FORGE614_HOME`). If it is a link, decide yourself what to do with it and with what it points to; Atlas will not do it for you.

### `PATH_REMOVE_FAILED`

- **What you see:** exit 1 and a message that names the terminal profile:
  - `The Forge614 Atlas PATH block in <profile> cannot be removed safely: <reason>` (`src/modules/uninstall/uninstall.ts:118`), with reason `it is not a regular file.`, `it cannot be read.`, `The Forge614 Atlas PATH block is nested or duplicated.`, `… has an end mark without a start.` or `… was never closed.` (`src/modules/uninstall/path-block.ts:46`, `:50` and `:57`). This is checked before anything changes.
  - `The Forge614 Atlas PATH block in <profile> could not be rewritten.` (`src/modules/uninstall/uninstall.ts:161`): writing failed; the earlier profiles in the list (`~/.zshrc`, `~/.bash_profile`, `~/.bashrc` and the fish one, in that order) were already cleaned.
- **Why it happens:** the PATH block (the lines the installer added between `# >>> forge614-atlas PATH >>>` and `# <<< forge614-atlas PATH <<<`) is incomplete, repeated or edited by hand, or the profile is a link or cannot be read or written. A mark only counts when the line is exactly equal to it.
- **What to do:** open the profile the message names and leave a single block with its two marks, or delete it entirely by hand. If the reason is `it is not a regular file.` (the profile is a symbolic link, for example into a shared configuration folder), Atlas never touches it, even if it no longer has the block: remove the block by hand in the file the link points to and, so that `uninstall` can go on, replace the link with a regular file (for example, a copy of its content). Check the permissions if it could not be read or written. Run `forge614-atlas uninstall` again: profiles that are already regular files and clean have no block and are not touched.

### `UNINSTALL_FAILED`

- **What you see:** exit 1 and `The Forge614 Atlas folder could not be removed (<reason>). The PATH blocks were already removed.` (`src/interfaces/cli/uninstall-command.ts:125`).
- **Why it happens:** the PATH blocks were already removed, but the `<FORGE614_HOME>/atlas` folder could not be deleted (for example, because of permissions, or because right before deleting it stopped being a real folder).
- **What to do:** since PATH no longer has Atlas, in a new terminal use the full path: `~/.forge614/atlas/bin/forge614-atlas uninstall --confirmed`. If the reason is permissions, fix them first. If it still fails, check the folder with `ls -ld ~/.forge614/atlas` and delete it yourself.

## `init` statuses that are not a finished analysis

They exit with code 0 (they are not errors), but they analyzed nothing new or did not finish. The first three are decided by `src/modules/cli/resolve-engine.ts` before any session is opened; a candidate engine is an agent that Engines sees installed, with an executable and with `supportsHeadlessExec: true` (it can run without a screen).

### `engine-ambiguous`

- **What you see:** `{ "schemaVersion": 1, "status": "engine-ambiguous", "candidates": [ { "id": "…", "executable": "…" }, … ] }`.
- **Why it happens:** there are two or more candidate engines and you did not say which one to use (`src/modules/cli/resolve-engine.ts:46`).
- **What to do:** pick one from `candidates`: `forge614-atlas init --engine claude-code` or `forge614-atlas init --engine codex`.

### `engine-unavailable`

- **What you see:** `{ "schemaVersion": 1, "status": "engine-unavailable" }`.
- **Why it happens:** you did not ask for an engine and Engines found no candidate (`src/modules/cli/resolve-engine.ts:44`). Atlas works with Claude Code and with Codex.
- **What to do:** install Claude Code or Codex. Check what Engines sees with `forge614-engines detect` and run `forge614-atlas init` again.

### `engine-invalid`

- **What you see:** `{ "schemaVersion": 1, "status": "engine-invalid", "requestedId": "…", "candidates": [ … ] }`.
- **Why it happens:** the `--engine` value is not one of the candidates (`src/modules/cli/resolve-engine.ts:37`): it is misspelled, that assistant is not installed or it cannot run without a screen. The list may be empty.
- **What to do:** use an `id` from `candidates`. If the list is empty, follow the steps for `engine-unavailable`.

### `already-complete`

- **What you see:** `{ "schemaVersion": 1, "status": "already-complete" }`, exit 0 (`src/modules/cli/init.ts:212`).
- **Why it happens:** the analysis of this project already finished: Engram answers that the session identifier of this repository belongs to a closed session (`src/modules/memory/run-state.ts:28`). Atlas analyzes nothing.
- **What to do:** nothing, if the saved analysis is good enough for you. To redo it from scratch run `forge614-atlas init --force`: it opens a new session and analyzes every module again.

### `paused`

- **What you see:** `{ "schemaVersion": 1, "status": "paused", "engine": {…}, "session": {…}, "analyzedCount": N, "pendingCount": M }` (`src/modules/cli/init.ts:140`).
- **Why it happens:** your AI subscription quota ran out in the middle of the batch. The reports of the `analyzedCount` modules are already saved in Engram; the session is left open on purpose and the pause counter goes up by one (`src/modules/cli/dispatch-modules.ts:161`). Since the deep tier is dispatched first, what was left unanalyzed by the quota is usually the least critical; `pendingCount` also counts the modules that failed, arrived cut off or were rejected, of any tier (`src/modules/cli/dispatch-modules.ts:159`).
- **What to do:** wait for your quota to renew and run `forge614-atlas init` again (without `--force`): it resumes the same session and only analyzes the `pendingCount` modules that are missing. With `--force` it would start over and redo all of them.
