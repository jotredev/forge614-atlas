# 10 (EN). Public Installer and Release Pipeline

> **Status:** Plan 5/5 completed and merged into `main` — the last plan in Atlas's roadmap.
> **Sister translation:** [10. Instalador Público y Pipeline de Release](../es/10-instalador-y-release.md)

## Purpose

Plans 1-4 built everything Atlas *does*. Plan 5 builds how a person actually gets Atlas onto their machine: a public `curl | bash` installer, a self-contained compiled binary (no Bun/Node required at runtime — same pattern as `forge614-engram` and `forge614-engines`), and the GitHub Actions pipeline that compiles and publishes it.

No new Atlas command was added beyond a minimal `--version` on the CLI (used by the release pipeline's own smoke test). `init` remains the only functional command, unchanged.

## Scope: what the installer deliberately does not do

- **Zero MCP registration.** The installer never detects AI assistants and never writes MCP configuration — that rule was already fixed in `STATE.md` ("Atlas never registers MCP on its own") and stays true at install time exactly as it does at runtime. Any assistant integration is handled later, by `forge614-atlas init` itself, through `forge614-engines` — never by this script.
- **macOS and Linux only** (x64/arm64), matching Engram's real, shipped scope today — not Engram's own spec, which mentions a Windows `install.ps1` that was never actually built. Windows stays fully out of scope for Atlas too.
- **No package-manager distribution** (npm/Homebrew/Scoop) and no "install from source" variant — both explicitly out of scope for this plan.

## Chaining only Engram — Engines arrives for free

Installing Atlas fully requires three components: Atlas, Engram, and Engines (per the ecosystem contract's directory tree under `~/.forge614/`). `forge614-engram`'s own real, published installer already chains and installs `forge614-engines` on its own. So Atlas's installer chains **only** Engram:

```bash
https://github.com/jotredev/forge614-engram/releases/latest/download/install.sh
```

If `$HOME/.forge614/engram/bin/forge614-engram` is already present and executable, nothing happens. If it's missing, that real installer script is downloaded and run — which, in turn, resolves Engines by itself. This keeps the "how do I get Engines" logic living in exactly one place (Engram's own script) instead of duplicated in Atlas's.

## The `install.sh` flow

Running `curl -fsSL https://raw.githubusercontent.com/jotredev/forge614-atlas/main/scripts/install.sh | bash`:

1. Parses `--version TAG`, `--bin-dir PATH`, `--force`, `--help`.
2. Detects platform/architecture (`Darwin/arm64`, `Darwin/x86_64`, `Linux/x86_64`, `Linux/aarch64`) — anything else fails immediately, before touching the network.
3. Resolves the GitHub release (`latest` by default, or a pinned tag), downloads `SHA256SUMS` and the matching binary over HTTPS only.
4. **Verifies the SHA-256 checksum before anything else is created.** No file under the destination directory exists until this passes — confirmed by an explicit test ("rejects a checksum mismatch before creating the destination").
5. Chains the Engram installer (see above). If that fails, the whole install stops — Atlas's own binary is never placed without its dependency satisfied.
6. Publishes the verified binary atomically into `$HOME/.forge614/atlas/bin/forge614-atlas` (`mktemp` + `mv`/`ln`, never a partially-written file).
7. Publishes that directory onto the PATH for the *next* terminal session (an idempotent marked block in `.zshrc`/`.bashrc`/`.bash_profile`/fish's `conf.d`). An unrecognized shell doesn't fail the install — it prints the exact `export PATH=...` line to run manually and still exits 0.
8. Prints `forge614-atlas init` as the next command to run.

No failure after step 5 can ever roll back or delete an already-verified Atlas binary — a PATH-publication failure only prints manual guidance.

## The release pipeline (`.github/workflows/release.yml`)

Four jobs, triggered by pushing a `v*` tag (or manually via `workflow_dispatch`):

- **`verify`** — installs dependencies, runs the full test suite and typecheck, and (on a tag push) asserts the pushed tag matches `package.json`'s version, so a published binary can never silently misreport its own `--version`.
- **`build`** — a 4-way matrix (`macos-14`/`macos-15-intel`/`ubuntu-latest`/`ubuntu-24.04-arm`) compiles each platform's binary with `bun build --compile`, smoke-tests it with `--version`, and uploads it.
- **`assemble`** — collects all four binaries, generates `SHA256SUMS`, and cross-validates every checksum before anything is published.
- **`publish`** — creates the actual GitHub Release with the four binaries, `SHA256SUMS`, and `scripts/install.sh` attached, only when the workflow ran from a real tag push.

**A real gap the final whole-branch review caught, and fixed:** because Atlas's own dependency on `forge614-engram` is a local path (`file:../forge614-engram`, a deliberate Plan 2 decision for local development), a plain `actions/checkout` of only the Atlas repo left that path unresolved on any real GitHub Actions runner — `bun install --frozen-lockfile` would have failed on the pipeline's very first real run. The fix checks out `jotredev/forge614-engram` (pinned to its real published `v1.5.0` tag) as a sibling directory inside the same job, exactly mirroring the local development layout, without reopening Plan 2's `file:../` decision.

## How the installer is tested without touching the real GitHub API

Same proven pattern as Engram's own real, shipped test suite — no test ever hits `api.github.com` or downloads anything real:

- A double-guarded set of environment variables (`FORGE614_ATLAS_INSTALLER_TEST=1` must be present before either `FORGE614_ATLAS_TEST_RELEASE_BASE_URL` or `FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL` is honored) redirects the release API and the chained Engram installer to local fixtures.
- `FORGE614_ATLAS_TEST_RELEASE_BASE_URL` must additionally be a loopback HTTP URL with an explicit numeric port; `FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL` must be a `file:///` URL. Both are validated before use, and every release-asset URL returned by the fixture server is re-validated against the same loopback check — closing the path where a test fixture's own JSON could redirect a real download to a non-loopback host.
- Each test spins up a disposable local HTTP server (`Bun.serve`) with a dummy binary and a checksum computed on the fly, and a disposable one-line Engram-installer stub — all created inside `mktemp` directories at test time, never committed as static fixtures.

## Accepted design risk: the chained installer's own trust boundary

Atlas's own binary is checksum-verified before it's ever installed. The Engram installer it chains to is not — it's downloaded over HTTPS and executed directly, by design (mirroring exactly how Engram's own installer chains Engines). This means the whole ecosystem's `curl | bash` trust chain is bounded by whoever controls Engram's release assets. This is a deliberate, accepted risk from the spec, not an oversight — recorded here and in `STATE.md` so a future reader doesn't mistake it for a bug.

## Publishing the real `v1.0.0` release

Closing this plan includes tagging and pushing `v1.0.0` — the first public release of `forge614-atlas` — which triggers the pipeline above for real. `package.json`'s version was bumped from `0.1.0` to `1.0.0` as part of this plan specifically for that first release.
