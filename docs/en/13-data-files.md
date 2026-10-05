# 13. Data files and automation

> **Sister translation:** [13. Archivos de datos y automatización](../es/13-archivos-de-datos.md)

This chapter describes files Atlas reads, writes or publishes, and the workflows that verify it. They are not interchangeable settings: each has a concrete owner.

## `.forge614/project.json`

Engram writes this file when it opens a session to preserve the project's portable identity; Atlas does not read it and excludes `.forge614` during module discovery (`src/modules/scoring/discovery.ts:34`). Engram reads it when reopening or linking the project. Its shape belongs to Engram: it includes project identity (`id`, `name`) and, where applicable, group identity. The `init` behavior for an invalid file is in [chapter 08](08-cli-core-and-run-plan.md).

## `docs/notion-map.json`

The person who publishes Notion pages maintains this map and that publishing process reads it; Atlas does not consume it at runtime. `reviewedProductVersion` identifies the reviewed version and `reviewedCommit` the reviewed commit; both change only when pages are republished. `pages` lists pages: each entry contains `localPath` (local manual), `language` (`es` or `en`), `notionUrl` (published target), and `contentFingerprint` (published-version fingerprint).

## `package.json`

The project maintains it; Bun, TypeScript, compilation, and version tests read it. `name` names the package; `version` feeds `--version`, `test/versions.test.ts`, the changelog and release tag; `private` prevents registry publication; `type` enables ESM; `exports` publishes `src/index.ts`; `scripts` defines `test`, `typecheck`, and `build`; `engines.bun` sets the minimum; `dependencies.forge614-engram` links the sibling copy and `dependencies.typescript` pins the compiler.

## CI workflows

`verify.yml` runs on every `push` and `pull_request`: it checks reproducible installation, pinned Engines/Workers, tests (except the integration requiring an authenticated assistant), `typecheck`, whitespace, and installer syntax on macOS and Linux.

`release.yml` runs for a `v*` tag, a PR changing release machinery, and manually. It verifies, builds four binaries, assembles them with `SHA256SUMS`, and only on tags publishes the release with binaries and `install.sh`.

`install-forge614-dependencies/action.yml` is the shared action that prepares a temporary `FORGE614_HOME`, downloads Engines 1.17.0 and Workers 1.0.0, validates their checksums and versions, and confirms the read-only lock.

## `init` response

The `init` JSON response contains `schemaVersion`, a `status`, and status-specific fields; `paused` includes counts and `completed` the final report. The complete list of statuses, fields, and `rejectedReportModuleNames` is in [chapter 08](08-cli-core-and-run-plan.md), to avoid duplicating the contract.
