# 13 (EN). Data files and automation

> **Status:** current for version 1.1.1 (branch `work/1.1.1`, not yet released).
> **Sister translation:** [13. Archivos de datos y automatización](../es/13-archivos-de-datos.md)

## Purpose

This chapter describes, one by one, the data and automation files that are part of Atlas but are not code: who writes them, who reads them (with file and line) and what each field means. They are not interchangeable settings: each has a concrete owner, and several are written by another program, not by Atlas. The examples come from this repository's real files. The contract of each command is in [chapter 08](08-cli-core-and-run-plan.md), the installer in [chapter 10](10-installer-and-release.md) and the errors in [chapter 11](11-troubleshooting.md).

## `.forge614/project.json`

The repository's identity card: a project identifier (and, where applicable, a group identifier) that travels with the code and does not depend on which folder of the disk it sits in.

- **What it is for:** so that Engram recognizes the same project even if the folder moves or is cloned onto another computer. It is meant to be committed: in this repository it is in Git.
- **Who writes it:** Engram, never Atlas (in Atlas's `src`, `scripts` and `test` there is only a comment that names it, `src/modules/scoring/discovery.ts:27`). Engram writes it when Atlas opens a session or saves something. `init` opens the session with `startProjectSession` at `src/modules/cli/init.ts:200` (with `--force`) or, without `--force`, at `src/modules/memory/run-state.ts:25` (called from `init.ts:210`). That function (`forge614-engram/src/app/project-context.ts:202`) reads the file (`:179`) and publishes it (`:188`) with `publishIdentity`, which calls `writeIdentity` and `ensureProjectFile` (`src/app/project-identity.ts:109` and `:89`; `src/infrastructure/filesystem/project-identity-file.ts:195`). Every module report (`src/modules/memory/module-report.ts:32`) and every change of the pause counter (`src/modules/memory/pause-count.ts:37`) goes through the same path (`project-context.ts:141` and `:146`). `ensureProjectFile` creates the file only if it does not exist; if it already exists, it never changes `project.id` or `project.name` and only completes `ecosystem` when it is missing or, being `null`, when the project already belongs to a group (`project-identity-file.ts:197-209`). If Engram cannot write it (for example, because of permissions) it only produces the `PROJECT_FILE_NOT_WRITTEN` notice (`project-identity.ts:95`) and `init` goes on: `startProjectSession` returns only the session, without the notices (`project-context.ts:202`).
- **Who reads it:** only Engram. `readProjectFile` (`project-identity-file.ts:119`) reads it inside `applyIdentityFile` (`project-identity.ts:60`), which runs when the session opens and when each report is saved. Atlas does not read it and excludes the `.forge614` folder when it discovers modules: it is in `EXCLUDED_DIRS` (`src/modules/scoring/discovery.ts:19-28`, line 27) and the filters at `:81` and `:105` also discard any folder whose name starts with a dot.
- **If it is invalid:** Engram does not modify it and throws `PROJECT_FILE_INVALID` (`project-identity-file.ts:86`, with a message in Spanish); Atlas does not catch it and `init` answers `UNEXPECTED_ERROR` with that message (see [chapter 11](11-troubleshooting.md)).

### Fields

| Field | Type | Required | Meaning | Real example |
|---|---|:---:|---|---|
| `schemaVersion` | number | Yes | Version of the file's shape; only `1` exists (`project-identity-file.ts:46`). | `1` |
| `project` | object | Yes | The project's identity; it only admits `id` and `name`. | `{ "id": …, "name": … }` |
| `project.id` | text (UUID v4) | Yes | The project's unique identifier; Engram never changes it. | `"f35e737c-1648-40b0-bfa2-aa4e7f37334d"` |
| `project.name` | text | Yes | Display name: not empty, without a NUL character and up to 300 characters (`:42`). | `"forge614-atlas"` |
| `ecosystem` | object or `null` | No | The group (ecosystem) the project belongs to. It may be missing or `null` (a standalone project); Engram completes it later. | `{ "id": …, "name": … }` |
| `ecosystem.id` | text (UUID v4) | Yes, if `ecosystem` is present | The group's identifier. The one of the `forge614` group is fixed (`forge614-engram/src/modules/ecosystem/rules.ts:16`). | `"e0b3e1c9-ffbb-4b6b-8a55-79fbf3e8f0b4"` |
| `ecosystem.name` | text | Yes, if `ecosystem` is present | The group's name: lowercase letters, digits and single hyphens, from 1 to 64 characters (`rules.ts:12-13`). | `"forge614"` |

Rules Engram demands when it reads it (`project-identity-file.ts:119-131`): valid JSON; a size of up to 64 KiB (`:15`); `.forge614` must be a real folder and `project.json` a regular file, not symbolic links (`:122` and `:126`); and no unknown field (the schema is strict, `:28-49`). Engram writes it with a two-space indent, a final line break and a missing `ecosystem` saved as `null` (`:106`).

This repository's real file:

```json
{
  "schemaVersion": 1,
  "project": { "id": "f35e737c-1648-40b0-bfa2-aa4e7f37334d", "name": "forge614-atlas" },
  "ecosystem": { "id": "e0b3e1c9-ffbb-4b6b-8a55-79fbf3e8f0b4", "name": "forge614" }
}
```

(On disk each object takes several lines; it is shown compact here.)

## `docs/notion-map.json`

The record of which local manuals already have a copy published in Notion and which version that copy corresponds to.

- **What it is for:** to know which chapters have a Notion page, where each one is and when they were last published.
- **Who writes it:** whoever publishes the Notion pages, when republishing them or creating a new one; no program in the repository generates it. Its history is five commits (`f6e0dc6`, `a97e276`, `d7d7cec`, `5319ed9` and `e8b923a`: «document Plan N … and index the Notion mirror» and «record real Notion URLs …»). `reviewedProductVersion` and `reviewedCommit` change only when the pages are republished; today they say `1.0.0` and `5319ed9` although the product is already at `1.1.0`, because the pages have not been republished (`STATE.md:302`).
- **Who reads it:** no program in this repository: `grep` finds neither its name nor its fields in `src`, `scripts`, `test` or `.github`; only `STATE.md:302` mentions it. It is a record for people, and Atlas does not consume it at runtime.
- **What it includes:** only chapters 08, 09 and 10 (in Spanish and in English, six pages); the other chapters, including 11, 12 and this one, do not appear in the map.

### Fields

| Field | Type | Required | Meaning | Real example |
|---|---|:---:|---|---|
| `reviewedProductVersion` | text | Yes* | Product version that was reviewed when the pages were published. | `"1.0.0"` |
| `reviewedCommit` | text | Yes* | Commit (short hash) of the repository that was reviewed when publishing. | `"5319ed9"` |
| `pages` | list | Yes* | One entry per published page. | 6 entries |
| `pages[].localPath` | text | Yes* | Path of the local manual, from the repository root. | `"docs/es/08-nucleo-cli-y-plan-de-corrida.md"` |
| `pages[].language` | text | Yes* | Language of the page: `es` or `en`. | `"es"` |
| `pages[].notionUrl` | text | Yes* | Address of the page in Notion (`https://app.notion.com/p/<identifier>?pvs=204`). | `"https://app.notion.com/p/3e121943d129812d9814cb2e9e9a95c9?pvs=204"` |
| `pages[].contentFingerprint` | text | Yes* | Label of the published version of that page (see below). | `"plan4-dispatch-5cb2ea5"` |

\* No program validates this file; «Yes» means that the three fields above and the four of each entry are always present in the real file.

**How the fingerprint (`contentFingerprint`) is built.** It is not a hash computed from the text: compared with the file, it has the form `<plan label>-<short hash of a commit>`. `plan4-dispatch-5cb2ea5` (chapters 08 and 09) uses the commit `5cb2ea5`, «docs: close out Plan 4 in STATE.md», and `plan5-installer-6952559` (chapter 10) uses `6952559`, «docs: close out Plan 5 in STATE.md». Nothing in the repository computes or compares it, so it does not warn if the text changes afterwards: whoever republishes must update it.

## `package.json`

The package's card. Only the fields that Atlas, its compiled binary, its CI or its tests really use matter here.

- **Who writes it:** the project team (the version goes up with each release; `test/versions.test.ts` forces chapter 10 and `CHANGELOG.md` to say the same one).
- **Who reads it:** Bun and TypeScript when installing and compiling; Atlas's code (only `version`); the tests and the CI workflows, according to the table.

### Fields

| Field | Type | Required | Meaning | Who uses it | Real example |
|---|---|:---:|---|---|---|
| `version` | text | Yes | The product version. | `src/interfaces/cli/main.ts:7` imports it and prints it in `--version` (`:40`) and in `--help` (`:34`), and passes it to `update` (`:45`): it ends up inside the binary. `test/versions.test.ts:8` and `src/interfaces/cli/main.test.ts:10` compare it. `release.yml:73`, `:79` and `:134` use it for the changelog, the tag and the binary check. | `"1.1.0"` |
| `exports` | text | No | Public entry point when Atlas is used as a library. | No file in the repository reads it; `src/index.ts:2` mentions it. | `"./src/index.ts"` |
| `scripts.typecheck` | text | No | Checks the types without generating files. | `verify.yml:66` and `release.yml:66` (`bun run typecheck`). | `"tsc --noEmit"` |
| `scripts.test` | text | No | Runs all the tests. | Local use; the CI does not call it: it runs `bun test` with a list of files (`verify.yml:65`). | `"bun test"` |
| `scripts.build` | text | No | Compiles the standalone binary. | Local use (chapter 08); the CI compiles with the same entry point, but with `--target` (`release.yml:130`). | `"bun build ./src/interfaces/cli/main.ts --compile --outfile dist/forge614-atlas"` |
| `engines.bun` | text | No | Minimum Bun version. | No program in the repository checks it; `README.md` repeats it as a requirement (`:76`) and the CI pins Bun 1.4.2 separately (`verify.yml:39`, `release.yml:39`). | `">=1.3.9"` |
| `dependencies.typescript` | text | Yes | The compiler, at an exact version. | Atlas uses it while running to count paths and dependencies (`src/modules/scoring/cyclomatic.ts:10`, `src/modules/scoring/fan-in.ts:11`; it ends up inside the binary) and `tsc` for the types. | `"5.9.3"` |
| `dependencies.forge614-engram` | text | Yes | The Engram library, taken from a sibling folder. | Atlas imports it in `src` (for example `src/modules/cli/init.ts:6`) and it ends up inside the binary; the CI downloads that sibling folder at the `ENGRAM_REF` version (`verify.yml:30-36`). | `"file:../forge614-engram"` |
| `devDependencies.@types/bun` | text | No | Bun types for the type checker. | `tsconfig.json:10` asks for the `bun-types` types, which this package brings. | `"latest"` |

The other fields (`name`, `private`, `type` and `description`) are read by no file in the repository: Bun and the package manager interpret them (`type: "module"` makes files be read as ESM modules).

## `.github/workflows/verify.yml`

The «Verify» workflow: the check that runs on every change.

- **Who writes it and who reads it:** the project team writes it; GitHub Actions reads and runs it.
- **What it checks:** that the project installs the same way as in local development, that the tests pass against the pinned Engines and Workers, that the types add up and that the installer is syntactically valid.
- **What it publishes:** nothing. It only has read permission (`contents: read`, `:7-8`).

### Triggers

| Trigger | When it runs | Line |
|---|---|:---:|
| `pull_request` | On any pull request, with no filters. | `:4` |
| `push` | On any push, to any branch or tag, with no filters. | `:5` |

### Jobs

| Job | Name | System | What it does |
|---|---|---|---|
| `unix` | `Unix checks (<system>)` | `ubuntu-latest` and `macos-latest`, in parallel and without stopping one if the other fails (`fail-fast: false`); 25-minute limit | Installs, tests and verifies. |

### Main steps

1. Downloads Atlas into the `forge614-atlas` folder (`actions/checkout@v4`).
2. Downloads Engram, at the `ENGRAM_REF` version, into the sibling folder `forge614-engram` (Atlas depends on it through `file:../forge614-engram`) and installs its dependencies with `bun install --frozen-lockfile` (the lock file rules: it does not change versions).
3. Installs Bun 1.4.2 (`oven-sh/setup-bun@v2`) and Atlas's dependencies, also with `--frozen-lockfile`.
4. Installs Engines and Workers at fixed versions with the shared action (see below).
5. Runs all the tests (`*.test.ts`) except `src/modules/cli/init.test.ts`: its `completed` tests launch a real, authenticated Claude Code, which a shared runner does not have. The others run for real, including the ones that call the pinned Engines and Workers (their AI engine is a test script).
6. `bun run typecheck`, `git diff --check` (looks for stray whitespace in the pending changes; in a clean run it would only find what an earlier step had left) and `bash -n scripts/install.sh` (checks the installer's syntax without running it).

### Pinned versions

| What | Version | Line |
|---|---|:---:|
| Engram (`ENGRAM_REF`) | `v1.8.7` | `:12` |
| Bun | `1.4.2` | `:39` |
| Engines | `1.17.0` (through the shared action) | — |
| Workers | `1.0.0` (through the shared action) | — |
| Actions | `actions/checkout@v4`, `oven-sh/setup-bun@v2` | `:27`, `:37` |

`ubuntu-latest` and `macos-latest` are not pinned: GitHub moves them to the newest version.

## `.github/workflows/release.yml`

The «Release standalone artifacts» workflow: it builds and publishes the binaries of a version.

- **Who writes it and who reads it:** the project team writes it; GitHub Actions reads and runs it.
- **What it checks:** it repeats the `verify.yml` battery on `ubuntu-latest` and adds two checks: that `CHANGELOG.md` has a `## <version>` line for the `package.json` version (`:69-75`) and, on a tag, that the tag is `v` plus that version (`:76-83`). Each compiled binary must answer `forge614-atlas <version>` (`:131-139`), and the four binaries with their `SHA256SUMS` are validated before being uploaded (`:174-192`).
- **What it publishes:** only the `publish` job, and only with a tag: it creates the GitHub release with the four binaries, `SHA256SUMS` and `scripts/install.sh` (published as `install.sh`), with the notes generated by GitHub (`:227-236`). A tag with a hyphen (for example `v1.2.0-rc.1`) is published as a prerelease (`:224-226`).

### Triggers

| Trigger | When it runs | Publishes | Line |
|---|---|:---:|:---:|
| `push` of a `v*` tag | When a tag such as `v1.1.0` is pushed. | Yes | `:4-6` |
| `pull_request` that changes `.github/workflows/release.yml`, `.github/actions/install-forge614-dependencies/action.yml` or `scripts/install.sh` | When the change touches the release machinery. | No | `:8-12` |
| `workflow_dispatch` | By hand, from GitHub. | No (`publish` requires a tag `push`, `:207`) | `:13` |

### Jobs

| Job | Name | System | What it does |
|---|---|---|---|
| `verify` | `Release verification` | `ubuntu-latest` | Installs, tests, checks the types, and checks the changelog and the tag. |
| `build` | `Build <artifact>` (four, in parallel) | `macos-14` (`darwin-arm64`), `macos-15-intel` (`darwin-x64`), `ubuntu-latest` (`linux-x64`) and `ubuntu-24.04-arm` (`linux-arm64`) | Compiles the binary with `bun build … --compile --target=<target>`, tests it with `--version`, packs it into a `.tar.gz` (to keep the execute permission) and uploads it. |
| `assemble` | `Assemble and validate release assets` | `ubuntu-latest`; waits for `build` | Extracts the four binaries, generates `SHA256SUMS` (four lines) and validates that they exist, are executable and that each checksum matches. |
| `publish` | `Publish GitHub Release` | `ubuntu-latest`; waits for `verify` and `assemble`; write permission (`contents: write`) | Creates the release with `gh release create`. It only runs on a tag `push`. |

### Main steps

1. `verify`: the same steps 1 to 6 of `verify.yml` (with the test list without `init.test.ts`), plus the two checks above.
2. `build`: downloads Atlas and Engram (`ENGRAM_REF`), installs Bun and the dependencies, creates `dist`, compiles, tests the native binary (each runner compiles for its own architecture), packs and uploads.
3. `assemble`: downloads the four packages, extracts them, generates and validates `SHA256SUMS` and uploads the final files as `release-assets`.
4. `publish`: downloads `release-assets` and creates the release.

### Pinned versions

| What | Version | Line |
|---|---|:---:|
| Engram (`ENGRAM_REF`) | `v1.8.7` | `:19` |
| Bun | `1.4.2` (in `verify` and in each `build` row) | `:39`, `:98`, `:102`, `:106`, `:110` |
| Engines | `1.17.0` (through the shared action) | — |
| Workers | `1.0.0` (through the shared action) | — |
| Actions | `actions/checkout@v4`, `oven-sh/setup-bun@v2`, `actions/upload-artifact@v4`, `actions/download-artifact@v4` | `:29`, `:37`, `:142`, `:153` |

`ENGRAM_REF` is written in this file and also in `verify.yml`: if it changes, it must change in both.

## `.github/actions/install-forge614-dependencies/action.yml`

The shared action that `verify.yml` and `release.yml` (`verify`) use to have real Engines and Workers, at a fixed version, without depending on the latest release or on the runner's own home folder.

- **Who writes it and who reads it:** the project team writes it; both workflows run it with `uses: ./forge614-atlas/.github/actions/install-forge614-dependencies`.
- **What it checks:** that each download matches its published checksum, that the installed binary reports the requested version and that Engines guarantees the read-only lock for `claude-code` (`"supportsReadOnly": true`). A wrong or old Engines fails here with a clear message, not as a pile of broken tests.
- **What it publishes:** nothing; it leaves the binaries in a temporary folder.

### Inputs

| Input | Type | Required | Meaning | Default | Line |
|---|---|:---:|---|---|:---:|
| `engines-version` | text | No | Engines version, without the leading `v`. | `"1.17.0"` | `:8-10` |
| `workers-version` | text | No | Workers version, without the leading `v`. | `"1.0.0"` | `:11-13` |

### Main steps

1. Points `FORGE614_HOME` at the temporary folder `$RUNNER_TEMP/forge614` (`:18-23`).
2. Installs Engines (`:25-55`): picks the package according to the system (`Linux-X64`, `Linux-ARM64`, `macOS-ARM64` or `macOS-X64`; any other fails), downloads `forge614-engines-<version>-<target>.tar.gz` and its `.sha256` from `https://github.com/jotredev/forge614-engines/releases/download/v<version>/`, verifies the checksum with `shasum -a 256 -c`, installs it at `$FORGE614_HOME/engines/bin/forge614-engines`, requires `--version` to say `forge614-engines <version>` and `capabilities --agent claude-code` to carry `"supportsReadOnly": true`.
3. Installs Workers (`:57-84`): downloads `forge614-workers-<target>` and `SHA256SUMS` from `https://github.com/jotredev/forge614-workers/releases/download/v<version>/`, verifies the binary against its own line of `SHA256SUMS`, installs it at `$FORGE614_HOME/workers/bin/forge614-workers` and requires `--version` to say `forge614-workers <version>`.

The pinned versions are those of the inputs table: Engines `1.17.0` and Workers `1.0.0`, which are also the minimums Atlas requires at runtime (see [chapter 09](09-subagent-dispatch.md)).

## `init` JSON response

What `init` prints on standard output (`runInitCommand` in `src/modules/cli/init.ts:164`; the `InitOutcome` type, `:43-67`). Every answer carries `schemaVersion: 1`. The detail of each case, and what to do, is in [chapter 08](08-cli-core-and-run-plan.md) and in [chapter 11](11-troubleshooting.md).

| `status` | Exit | Fields besides `schemaVersion` and `status` | When | Line |
|---|:---:|---|---|:---:|
| `completed` | 0 | `engine` (`{ id, executable }`), `session` (`{ sessionId, resumed }`) and `report` (the final report, see [chapter 09](09-subagent-dispatch.md)) | The batch finished. | `init.ts:148` |
| `paused` | 0 | `engine`, `session`, `analyzedCount` and `pendingCount` (numbers) | The AI subscription quota ran out in the middle of the batch. | `init.ts:137` |
| `already-complete` | 0 | none | The analysis of this project already finished (only without `--force`). | `init.ts:212` |
| `engine-ambiguous` | 0 | `candidates` (list of `{ id, executable }`) | Two or more possible engines and none requested. | `resolve-engine.ts:46` |
| `engine-unavailable` | 0 | none | No possible engine and none requested. | `resolve-engine.ts:44` |
| `engine-invalid` | 0 | `requestedId` (text) and `candidates` | The requested `--engine` is not a possible engine. | `resolve-engine.ts:37` |
| `error` | 1 | `error` (`{ code, message }`) | See below. | `init.ts:75` |

Common fields: `engine.id` is the engine's identifier (for example `claude-code`), `engine.executable` the path of its executable, `session.sessionId` the Engram session identifier (`atlas:` and 16 hexadecimal characters; with `--force`, also `:` and the milliseconds, `src/modules/memory/session-id.ts:56` and `:67`) and `session.resumed` whether the run continues an earlier one (always `false` with `--force`, `init.ts:207`).

The `error` codes that come out of `runInitCommand` are `ENGINES_UNREACHABLE` (`init.ts:169` and `:179`), `READ_ONLY_UNSUPPORTED`, `WORKERS_UNREACHABLE` and `WORKERS_OUTDATED` (the three from the preliminary check, `init.ts:196`; the first also when dispatching, `:134`), `ANALYSIS_FAILED` (`:205` and `:219`) and `WORKERS_FATAL_ERROR` (`:120` and `:127`). The other two errors that whoever calls `init` can see, `INVALID_FORGE614_HOME` and `UNEXPECTED_ERROR`, do not come from here, but from `src/interfaces/cli/commands.ts` and from `src/interfaces/cli/main.ts:73`.
