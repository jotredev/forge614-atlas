# 10 (EN). Public Installer and Release Pipeline

> **Status:** Single installer adopted for Atlas 1.2.0.
> **Product version:** `package.json`: version `1.2.0`
> **Sister translation:** [10. Instalador Público y Pipeline de Release](../es/10-instalador-y-release.md)

## Purpose

Plans 1-4 built Atlas's core analysis and dispatch logic. Plan 5 constructed the initial public installer, and in version 1.2.0 Atlas adopted the Forge614 single installer standard (`forge614-ai`), based on native gatekeepers (`install.sh`, `install.ps1`), the universal `install.mjs` installer engine, and the declarative node pointer `forge614.node.json`. The compiled binary remains self-contained and requires neither Node.js nor Bun at runtime.

## Scope: what the installer deliberately does not do

- **Zero MCP registration.** The installer never detects AI assistants and never writes MCP configuration. Any assistant integration is handled subsequently by `forge614-atlas init` via `forge614-engines`.
- **macOS and Linux only** (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`). **Windows is formally excluded in 1.2.0** per Architecture Decision 2 (`docs/decisions/0002-windows-omitted-1-2-0.md`). If executed on Windows, `install.mjs:222-225` detects the unsupported platform in `requireSupportedSystem` and terminates cleanly with exit code 65 (`EXIT.REQUIREMENT`, `install.mjs:11`) printing to stderr: "unsupported system: windows-x64" (`install.mjs:1021`).
- **No package-manager distribution** (npm/Homebrew/Scoop) and no "install from source" variant.

## Requirements and Ecosystem Dependencies

The installer and gatekeeper require **Node.js 22.19.0 or later** to execute on the host machine.

Atlas declares its dependencies in `forge614.node.json`:
1. **Engram, at least 1.10.0** — the version Atlas 1.2.0 is built against. If Engram is missing or older (such as 1.9.0), the installer downloads and runs Engram's official installer to update it to 1.10.0.
2. **Workers, at least 1.0.0** — required to dispatch helper tasks under read-only mode. If missing, the installer downloads and installs it.
3. **Engines, at least 1.17.0** — required with read-only lock support (`supportsReadOnly: true`).

Any failure to satisfy requirements halts the installation with an explanatory message and non-zero exit code, leaving no orphaned directories or residual PATH modifications.

### Destination: `FORGE614_HOME`

The installer applies the same rules as Atlas's internal runtime (`src/modules/forge-home`): without the environment variable, the Forge614 folder defaults to `$HOME/.forge614`; when set, it must be a non-empty absolute path, otherwise the installer halts with `INVALID_FORGE614_HOME: FORGE614_HOME must be a non-empty absolute path.` prior to creating or downloading files.

## The `install.sh` and `install.mjs` Workflow

When running `curl -fsSL https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh | bash`:

1. The `install.sh` gatekeeper checks for Node.js 22.19.0+.
2. Resolves the requested release tag (`latest` or `--version X.Y.Z`).
3. Downloads `install.mjs`, `forge614.node.json`, and `SHA256SUMS` from the release, strictly validating SHA-256 cryptographic checksums.
4. Invokes `node install.mjs`, forwarding all received options (`--version`, `--uninstall`, etc.).
5. `install.mjs` resolves the dependency graph in `FORGE614_HOME`, downloads the platform-specific binary (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`), validates its GNU SHA-256 checksum, and performs a staged launcher smoke test (`forge614-atlas --version`).
6. Links the binary into `<FORGE614_HOME>/atlas/bin/forge614-atlas` and publishes the bin directory into the user profile PATH (`.zshrc`, `.bashrc`, `.bash_profile`, or fish) enclosed between the markers `# >>> forge614-atlas PATH >>>` and `# <<< forge614-atlas PATH <<<`.

## CLI Maintenance and Lifecycle Commands

Atlas 1.2.0 exposes a unified contract for maintenance:

- `--version` (or `-v`) prints `forge614-atlas 1.2.0`. Supplying `--json` prints the structured envelope `{"schemaVersion":1,"name":"forge614-atlas","version":"1.2.0"}`.
- `--help` (or `-h`) prints usage guidance regardless of argument position, exiting 0 without touching disk.
- `update [--version X.Y.Z] [--json]` downloads the gatekeeper for the specified version (or latest), verifies SHA-256 integrity, and runs the update; outputs human-readable text or JSON with `{"schemaVersion":1,"status":"updated","updated":true|false,"previousVersion":"...","installedVersion":"..."}`.
- `uninstall [--from forge614-engram] [--confirmed] [--json] [--self]`:
  - If the working directory (`cwd`) is inside `<FORGE614_HOME>/atlas`, uninstallation is immediately rejected with `UNINSTALL_FAILED` (exit 1) to prevent unsafe self-deletion.
  - The `--self` flag (invoked by `install.mjs --uninstall`) cleans local integrations and returns `{"schemaVersion":1,"result":{"integrationsRemoved":true}}` with exit code 0.
  - The `--from forge614-engram` flag allows Engram to coordinate cascading uninstallation.
  - Uninstallation removes only the `<FORGE614_HOME>/atlas/` directory and Atlas's PATH block, always preserving memory facts and databases in `FORGE614_HOME/memory/`.

## CI and Release Pipeline

- **`verify-platforms.yml`**: runs the entire unit, integration, and E2E installer test suites (`test/e2e-installer.test.ts`), plus compiling and smoke-testing native binaries on macOS and Ubuntu runners (`macos-15`, `macos-15-intel`, `ubuntu-24.04-arm`, `ubuntu-24.04`).
- **`release.yml`**: packages compiled binaries and the installer suite (`install.sh`, `install.ps1`, `install.mjs`, `forge614.node.json`), generates the canonical `SHA256SUMS` file via `scripts/prepare-release-assets.mjs`, and publishes GitHub Releases upon receiving a `v*` tag.

## E2E Installer and Lifecycle Verification

The `test/e2e-installer.test.ts` suite verifies the complete installer lifecycle without public internet access:
1. Clean installation with gatekeeper from an empty `FORGE614_HOME`.
2. Seamless upgrade from Atlas 1.1.2 to 1.2.0 in a single `update`, using a local TLS reverse proxy to intercept requests to `github.com` and guaranteeing a clean, single PATH block.
3. Automatic upgrade of Engram 1.9.0 to 1.10.0 and migration of memories from `engram/` to `memory/`.
4. Safe uninstallation with working directory rejection, removal of binary and PATH entries, and memory preservation.
5. Coordinated uninstallation triggered by Engram 1.10.0.
6. Node installer engine uninstallation via `install.mjs --uninstall` using `uninstall --self`.
