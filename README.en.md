# Forge614 Atlas (`forge614-atlas`)

> One-sentence analogy: Atlas is the cartographer who walks a code project, decides how much effort each area deserves, sends helpers that only look, and files the map in memory; it does not hand out jobs and never modifies anything in the project.

Español: [README.md](README.md).

## What it is
Forge614's project contextualizer: it scores a repository's modules without AI (complexity, dependencies, Git history and tests), splits them into three tiers (Deep, Standard and Light), sends Forge614 Workers a batch of tasks so Claude Code or Codex analyze each module, and saves one report per module in Forge614 Engram the moment it arrives. With that memory, any AI assistant can know the project without reading all of it again. If the subscription quota runs out, it leaves the run open and the next `init` continues it.

## What it is not
- It is not the job orchestrator: it contextualizes a project and nothing more.
- It has no interface: the only visual interface of the ecosystem is Forge614 Shell.
- It does not detect AI assistants (that is Forge614 Engines' job) or run them on its own (that is Forge614 Workers' job).
- It does not register MCP or touch the configuration of any AI assistant.
- It has no Windows version yet: official binaries are for macOS and Linux.

## Requirements
- Bash, `curl` and a SHA-256 utility (`shasum` or `sha256sum`).
- Forge614 Engram 1.8.7 or newer, Forge614 Workers 1.0.0 or newer and Forge614 Engines 1.17.0 or newer with the read-only lock (`supportsReadOnly`). Atlas's installer installs or updates Engram and Workers when they are missing or older (Engram's needs Node.js 22.19 or newer and `tar`) and checks Engines at the end. If anything cannot be met, it installs nothing of Atlas and explains what is missing.
- Git in the project to analyze, with at least one commit.
- An AI assistant that Forge614 Engines can run headless (Claude Code or Codex), already authenticated.

## Installation

macOS / Linux:
```bash
curl -fsSL https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh | bash
```

To install a specific version: `curl -fsSL https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh | bash -s -- --version v1.1.0`.

The binary is placed at `~/.forge614/atlas/bin/forge614-atlas` and that folder is added to the PATH of the next terminal (if your terminal is not recognized, the installer prints the exact line to add by hand). If you set `FORGE614_HOME` (an absolute path), the installer, `update`, `uninstall` and Atlas itself use that folder instead of `~/.forge614`; an empty or relative value is rejected with `INVALID_FORGE614_HOME`.

To verify: `forge614-atlas --version` (it prints `forge614-atlas X.Y.Z`).

## Commands
| Command | What it does |
| --- | --- |
| `forge614-atlas init [--engine <id>] [--force]` | Contextualizes the project in the current folder and answers in JSON (`completed`, `paused`, `already-complete`, `engine-ambiguous`, `engine-unavailable`, `engine-invalid` or an error). `--force` redoes an already complete analysis. |
| `forge614-atlas update` | Downloads the installer of the latest published version and runs it with `--force`; answers with the previous and the new version. |
| `forge614-atlas uninstall [--confirmed]` | Removes Atlas (see below). |
| `forge614-atlas --version`, `-v` | Prints the product name and the version. |
| `forge614-atlas --help`, `-h` | Prints the help; also `init --help` and `uninstall --help`, without running anything. |

Errors use a single JSON envelope, `{ "schemaVersion": 1, "status": "error", "error": { "code": "...", "message": "..." } }`; the table of commands, answers and exit codes is in [chapter 08](docs/en/08-cli-core-and-run-plan.md).

## Security: the helpers only read
Since 1.1.0 every task Atlas sends carries `readOnly: true`, with no option to turn it off. Forge614 Engines puts the lock on: Claude Code gets only `Read`, `Grep` and `Glob`, no permission prompts and no MCP server; Codex runs in its read-only sandbox without the user's configuration. If Engines or Workers cannot guarantee it, Atlas refuses to start (`READ_ONLY_UNSUPPORTED`, `WORKERS_OUTDATED`) before opening any Engram session. Only Atlas saves to memory, never the helpers. Details in [chapter 09](docs/en/09-subagent-dispatch.md).

Engram also writes `.forge614/project.json` (the project's portable identity) in the analyzed repository; it is meant to be committed and Atlas never reads it.

## Uninstall
`forge614-atlas uninstall` asks you to type exactly `REMOVE FORGE614-ATLAS` (with `--confirmed` it asks nothing). It removes only the folder `~/.forge614/atlas` (or `<FORGE614_HOME>/atlas`) and the PATH block the installer added; it never touches Engram, Engines, Shell, Workers or the saved memories. It is the command Engram uses when it uninstalls itself.

## Documentation
| # | Español | English |
| --- | --- | --- |
| 00 | [Resumen y guía rápida](docs/es/00-resumen-y-guia-rapida.md) | [Summary and quickstart](docs/en/00-summary-and-quickstart.md) |
| 01 | [Alcance y diseño del orquestador](docs/es/01-alcance-y-diseno-del-orquestador.md) | [Scope and orchestrator design](docs/en/01-scope-and-orchestrator-design.md) |
| 02 | [Arquitectura del motor de puntuación](docs/es/02-arquitectura-motor-puntuacion.md) | [Scoring engine architecture](docs/en/02-scoring-engine-architecture.md) |
| 03 | [Señales, métricas y fórmulas](docs/es/03-senales-metricas-y-formulas.md) | [Signals, metrics and formulas](docs/en/03-signals-metrics-and-formulas.md) |
| 04 | [Clasificación de niveles y percentiles](docs/es/04-clasificacion-niveles-y-percentiles.md) | [Tier classification and percentiles](docs/en/04-tier-classification-and-percentiles.md) |
| 05 | [Proceso SDD y catálogo de defectos](docs/es/05-proceso-sdd-y-catalogo-defectos.md) | [SDD process and defect catalog](docs/en/05-sdd-process-and-defect-catalog.md) |
| 06 | [Referencia de API en TypeScript](docs/es/06-referencia-api-typescript.md) | [TypeScript API reference](docs/en/06-typescript-api-reference.md) |
| 07 | [Estructura y código fuente línea por línea](docs/es/07-estructura-codigo-linea-por-linea.md) | [Project structure and documented source code](docs/en/07-project-structure-documented-source-code.md) |
| 08 | [Núcleo del CLI y plan de corrida](docs/es/08-nucleo-cli-y-plan-de-corrida.md) | [CLI core and run plan](docs/en/08-cli-core-and-run-plan.md) |
| 09 | [Despacho real de subagentes](docs/es/09-despacho-de-subagentes.md) | [Real subagent dispatch](docs/en/09-subagent-dispatch.md) |
| 10 | [Instalador y release](docs/es/10-instalador-y-release.md) | [Installer and release](docs/en/10-installer-and-release.md) |
| 11 | [Resolución de errores](docs/es/11-resolucion-de-errores.md) | [Troubleshooting](docs/en/11-troubleshooting.md) |
| 12 | [Glosario](docs/es/12-glosario.md) | [Glossary](docs/en/12-glossary.md) |

Also: the product contract ([`CONTRACT.md`](CONTRACT.md) / [`CONTRACT.en.md`](CONTRACT.en.md)), the [project state](STATE.md) (Spanish) and the [changelog](CHANGELOG.md).

## Development
Requires Bun 1.3.9 or newer (CI uses 1.4.2) and, as a sibling folder, a copy of Engram 1.8.7 with its dependencies installed (`bun install` inside `../forge614-engram`). The tests pass 192 of 192; the ones that call Engines and Workers need both installed in `~/.forge614` or in `FORGE614_HOME`, and `init.test.ts` also needs a real, authenticated Claude Code.

```bash
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
```

## License
All rights reserved. See [`LICENSE`](LICENSE). Vulnerabilities are reported as described in [`SECURITY.md`](SECURITY.md).
