# 10 (EN). Public Installer and Release Pipeline

> **Status:** Plan 5/5 completed and merged into `main` — the last plan in Atlas's roadmap.
> **Product version:** `package.json`: version `1.1.0`
> **Sister translation:** [10. Instalador Público y Pipeline de Release](../es/10-instalador-y-release.md)

## Purpose

Plans 1-4 built everything Atlas *does*. Plan 5 builds how a person actually gets Atlas onto their machine: a public `curl | bash` installer, a self-contained compiled binary (no Bun/Node required at runtime — same pattern as `forge614-engram` and `forge614-engines`), and the GitHub Actions pipeline that compiles and publishes it.

Atlas 1.1.0 later added `--help`, `update` and `uninstall`, and made `--version` print the product name (`forge614-atlas X.Y.Z`); see chapter 08. `init` is still the only command that analyzes a project.

## Scope: what the installer deliberately does not do

- **Zero MCP registration.** The installer never detects AI assistants and never writes MCP configuration — that rule was already fixed in `STATE.md` ("Atlas never registers MCP on its own") and stays true at install time exactly as it does at runtime. Any assistant integration is handled later, by `forge614-atlas init` itself, through `forge614-engines` — never by this script.
- **macOS and Linux only** (x64/arm64). **Windows is a declared debt of 1.1.0**: the ecosystem contract asks every node to ship binaries and an installer for macOS, Linux and Windows (rule 8 of its section 8), and Atlas does not — there is no `install.ps1` and no Windows binary. It is stated here and in `CONTRACT.md` instead of being hidden, and it is not part of this version.
- **No package-manager distribution** (npm/Homebrew/Scoop) and no "install from source" variant — both explicitly out of scope for this plan.

## What the installer makes sure of before it creates anything

Atlas needs three components besides itself: Engram (a copy of its code is compiled into the Atlas binary, and Atlas shares the memory database with the installed one), Workers (which dispatches the helpers) and Engines (which builds each engine command). Before the installer creates anything of Atlas it checks the three, in this order, always inside the Forge614 folder (`$FORGE614_HOME` when the variable is set, `$HOME/.forge614` otherwise — see below):

1. **Engram, at least 1.8.7** — the version Atlas 1.1.0 is compiled against, held in one variable of the script (`engram_min_version`). `<forge614 folder>/engram/bin/forge614-engram --version` (with the input closed) must print `forge614-engram X.Y.Z` with X.Y.Z at least that version. If not, the installer downloads the published Engram installer (`https://github.com/jotredev/forge614-engram/releases/latest/download/install.sh`) and runs it with `FORGE614_HOME` set and the input closed — with `--force` when an Engram was already there (the way Engram's own `update` command does) and without it when there was none — and checks again. That installer needs Node.js 22.19 or newer and `tar` and installs Shell and Engines by itself when they are missing.
2. **Workers, at least 1.0.0.** `<forge614 folder>/workers/bin/forge614-workers --version` must print `forge614-workers X.Y.Z` with X.Y.Z at least 1.0.0; a Workers that does not answer `--version` (like 0.1.0) counts as too old, because an older Workers silently ignores `readOnly`. If not, the installer downloads the published Workers installer (`https://github.com/jotredev/forge614-workers/releases/latest/download/install.sh`) and runs it **without** `--force` (if something that is not a link sits where the Workers command goes, Workers refuses and Atlas installs nothing, instead of overwriting it), with `FORGE614_HOME` set and the input closed, and checks again. Workers' own installer keeps Engines current when it installs.
3. **Engines, at least 1.17.0 with the read-only lock.** This one is only checked, never installed here: `<forge614 folder>/engines/bin/forge614-engines --version` must print `forge614-engines X.Y.Z` with X.Y.Z at least 1.17.0 and `capabilities --agent claude-code` must say `"supportsReadOnly": true`. It is checked at the end because a Workers that was already fine skips its own Engines step.

Every failure says what is missing and ends with `Atlas was not changed.`, with exit code 1, and nothing of Atlas exists afterwards: no folder, no binary and no PATH line.

### Where everything goes: `FORGE614_HOME`

The installer applies the same rule as the Atlas code (`src/modules/forge-home`): without the variable the Forge614 folder is `$HOME/.forge614`; with it, it must be a non-empty absolute path, otherwise the installer stops with `INVALID_FORGE614_HOME: FORGE614_HOME must be a non-empty absolute path.` before creating or downloading anything. The dependency checks, the dependency installers (which receive the variable) and the default destination (`<forge614 folder>/atlas/bin/forge614-atlas`) all use that folder. `--bin-dir` still overrides the destination of the Atlas binary only.

## The `install.sh` flow

Running `curl -fsSL https://raw.githubusercontent.com/jotredev/forge614-atlas/main/scripts/install.sh | bash`:

1. Parses `--version TAG`, `--bin-dir PATH`, `--force`, `--help`, and resolves the Forge614 folder (`FORGE614_HOME`, see above).
2. Detects platform/architecture (`Darwin/arm64`, `Darwin/x86_64`, `Linux/x86_64`, `Linux/aarch64`) — anything else fails immediately, before touching the network.
3. Resolves the GitHub release (`latest` by default, or a pinned tag), downloads `SHA256SUMS` and the matching binary over HTTPS only.
4. **Verifies the SHA-256 checksum before anything else is created.** No file under the destination directory exists until this passes — confirmed by an explicit test ("rejects a checksum mismatch before creating the destination").
5. Makes sure of Engram, Workers and Engines (see above). If any of them cannot be met, the whole install stops — Atlas's own binary is never placed without its dependencies satisfied.
6. Publishes the verified binary atomically into `<FORGE614_HOME>/atlas/bin/forge614-atlas` (`$HOME/.forge614/atlas/bin/forge614-atlas` when `FORGE614_HOME` is not set) (`mktemp` + `mv`/`ln`, never a partially-written file).
7. Publishes that directory onto the PATH for the *next* terminal session (an idempotent marked block in `.zshrc`/`.bashrc`/`.bash_profile`/fish's `conf.d`). An unrecognized shell doesn't fail the install — it prints the exact `export PATH=...` line to run manually and still exits 0.
8. Prints `forge614-atlas init` as the next command to run.

No failure after step 5 can ever roll back or delete an already-verified Atlas binary — a PATH-publication failure only prints manual guidance.

## The release pipeline (`.github/workflows/release.yml`)

Four jobs, triggered by pushing a `v*` tag, manually via `workflow_dispatch`, or by a pull request that touches `.github/workflows/release.yml`, the dependency action `.github/actions/install-forge614-dependencies/action.yml` or `scripts/install.sh` (a pull request runs `verify`, `build` and `assemble`, never `publish`):

- **`verify`** — installs dependencies, installs Engines 1.17.0 and Workers 1.0.0 at those exact versions (each checked against its published checksum) into a disposable `FORGE614_HOME`, runs the test suite except `init.test.ts` (the only file that needs a real, authenticated Claude Code: it resolves `claude-code` and its "completed" tests launch it; `run-batch.test.ts` and `dispatch-modules.test.ts` do run, because they only need Workers and Engines and use a fixture script as the AI engine), runs the typecheck, `git diff --check` and `bash -n scripts/install.sh`, checks that `CHANGELOG.md` has a `## <package.json version>` entry, and (on a tag push) asserts the pushed tag matches `package.json`'s version, so a published binary can never silently misreport its own `--version`.
- **`build`** — a 4-way matrix (`macos-14`/`macos-15-intel`/`ubuntu-latest`/`ubuntu-24.04-arm`) compiles each platform's binary with `bun build --compile`, smoke-tests it by checking that `--version` prints exactly `forge614-atlas <package.json version>`, and uploads it.
- **`assemble`** — collects all four binaries, generates `SHA256SUMS`, and cross-validates every checksum before anything is published.
- **`publish`** — creates the actual GitHub Release with the four binaries, `SHA256SUMS`, and `scripts/install.sh` attached, only when the workflow ran from a real tag push.

**A real gap the final whole-branch review caught, and fixed:** because Atlas's own dependency on `forge614-engram` is a local path (`file:../forge614-engram`, a deliberate Plan 2 decision for local development), a plain `actions/checkout` of only the Atlas repo left that path unresolved on any real GitHub Actions runner — `bun install --frozen-lockfile` would have failed on the pipeline's very first real run. The fix checks out `jotredev/forge614-engram` as a sibling directory inside the same job, pinned to one release tag held in a single workflow variable (`ENGRAM_REF`, today `v1.8.7`), and installs that copy's own dependencies (`bun install --frozen-lockfile` inside it) before Atlas is installed or compiled, exactly mirroring the local development layout, without reopening Plan 2's `file:../` decision. Without that second step the Engram copy fails with `Could not resolve: "zod"`.

### The `Verify` workflow (`.github/workflows/verify.yml`)

Separate from the release pipeline, it runs on every push and every pull request, on `ubuntu-latest` and `macos-latest`, with Bun 1.4.2. It does the same preparation as `verify` above (the Engram copy at `ENGRAM_REF`, with its own `bun install --frozen-lockfile`, then Atlas's; the pinned Engines and Workers in a disposable `FORGE614_HOME`) and then runs the same test suite (all but `init.test.ts`), the typecheck, `git diff --check` and `bash -n scripts/install.sh`. `main` has no branch protection in 1.1.0; this workflow is how a broken change is noticed before a tag.

## How the installer is tested without touching the real GitHub API

Same proven pattern as Engram's own real, shipped test suite — no test ever hits `api.github.com` or downloads anything real:

- A double-guarded set of environment variables (`FORGE614_ATLAS_INSTALLER_TEST=1` must be present before `FORGE614_ATLAS_TEST_RELEASE_BASE_URL`, `FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL` or `FORGE614_ATLAS_WORKERS_INSTALLER_TEST_URL` is honored) redirects the release API and the Engram and Workers installers to local fixtures.
- `FORGE614_ATLAS_TEST_RELEASE_BASE_URL` must additionally be a loopback HTTP URL with an explicit numeric port; `FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL` and `FORGE614_ATLAS_WORKERS_INSTALLER_TEST_URL` must be `file:///` URLs. All are validated before use, and every release-asset URL returned by the fixture server is re-validated against the same loopback check — closing the path where a test fixture's own JSON could redirect a real download to a non-loopback host.
- Each test spins up a disposable local HTTP server (`Bun.serve`) with a dummy binary and a checksum computed on the fly, plus FAKE Engram and Workers installers and a fake Engines binary that record how they were called — all created inside temporary directories at test time, never committed as static fixtures, and always with a temporary `HOME` and `FORGE614_HOME`, never the real ones. The tests cover: a clean install that runs both installers; Engram 1.8.7 and Workers 1.0.0 already fine (neither installer runs); Engram 1.5.0 updated with `--force`; Workers 0.1.0 or without `--version` installed; a failing Workers installer, an Engram that stays old and an Engines without `supportsReadOnly` (nothing of Atlas is created and the exit code is 1); an absolute `FORGE614_HOME` receiving everything; and an empty or relative one answering `INVALID_FORGE614_HOME` without creating anything.

## Accepted design risk: the chained installers' own trust boundary

Atlas's own binary is checksum-verified before it's ever installed. The Engram and Workers installers it runs are not — each is downloaded over HTTPS and executed directly, by design (mirroring exactly how Engram's own installer chains Shell and Engines). This means the whole ecosystem's `curl | bash` trust chain is bounded by whoever controls the release assets of Engram and Workers. This is a deliberate, accepted risk from the spec, not an oversight — recorded here and in `STATE.md` so a future reader doesn't mistake it for a bug.

## Publishing the releases

`v1.0.0` was the first public release of `forge614-atlas`; `package.json`'s version was bumped from `0.1.0` to `1.0.0` for it. Version 1.1.0 is prepared in the repository (changelog, README in both languages, `LICENSE`, `SECURITY.md`) and published separately, by pushing the `v1.1.0` tag, which triggers the pipeline above. A test (`test/versions.test.ts`) keeps `package.json`, `CHANGELOG.md` and the version line of this chapter in both languages equal.
