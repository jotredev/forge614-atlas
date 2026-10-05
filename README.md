# Forge614 Atlas (`forge614-atlas`)

> Analogía en una frase: Atlas es el cartógrafo que recorre un proyecto de código, decide cuánto esfuerzo merece cada zona, manda a ayudantes que solo miran y archiva el mapa en la memoria; no reparte trabajos ni modifica nada del proyecto.

English: [README.en.md](README.en.md).

## Qué es
El contextualizador de proyectos de Forge614: puntúa los módulos de un repositorio sin IA (complejidad, dependencias, historial de Git y pruebas), los reparte en tres niveles (Profundo, Estándar y Ligero), manda a Forge614 Workers un lote de tareas para que Claude Code o Codex analicen cada módulo y guarda un reporte por módulo en Forge614 Engram, en cuanto llega. Con esa memoria, cualquier asistente de IA puede conocer el proyecto sin volver a leerlo entero. Si se agota la cuota de la suscripción, deja la corrida abierta y el siguiente `init` la continúa.

## Qué no es
- No es el orquestador de trabajos: contextualiza un proyecto y nada más.
- No tiene interfaz: la única interfaz visual del ecosistema es Forge614 Shell.
- No detecta asistentes de IA (eso es de Forge614 Engines) ni los ejecuta por su cuenta (eso es de Forge614 Workers).
- No registra MCP ni toca la configuración de ningún asistente de IA.
- No tiene versión para Windows todavía: los binarios oficiales son para macOS y Linux.

## Requisitos
- Bash, `curl` y una utilidad SHA-256 (`shasum` o `sha256sum`).
- Forge614 Engram 1.8.7 o posterior, Forge614 Workers 1.0.0 o posterior y Forge614 Engines 1.17.0 o posterior con el candado de solo lectura (`supportsReadOnly`). El instalador de Atlas instala o actualiza Engram y Workers cuando faltan o son anteriores (el de Engram necesita Node.js 22.19 o posterior y `tar`) y comprueba Engines al final. Si algo no se cumple, no instala nada de Atlas y explica qué falta.
- Git en el proyecto que se va a analizar, con al menos un commit.
- Un asistente de IA que Forge614 Engines pueda correr sin pantalla (Claude Code o Codex), ya autenticado.

## Instalación

macOS / Linux:
```bash
curl -fsSL https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh | bash
```

Para instalar una versión concreta: `curl -fsSL https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh | bash -s -- --version v1.1.0`.

El binario queda en `~/.forge614/atlas/bin/forge614-atlas` y esa carpeta se agrega al PATH de la siguiente terminal (si tu terminal no se reconoce, el instalador imprime la línea exacta para agregarla a mano). Si defines `FORGE614_HOME` (ruta absoluta), el instalador, `update`, `uninstall` y el propio Atlas usan esa carpeta en lugar de `~/.forge614`; una variable vacía o relativa se rechaza con `INVALID_FORGE614_HOME`.

Para verificar: `forge614-atlas --version` (imprime `forge614-atlas X.Y.Z`).

## Órdenes
| Orden | Qué hace |
| --- | --- |
| `forge614-atlas init [--engine <id>] [--force]` | Contextualiza el proyecto de la carpeta actual y responde en JSON (`completed`, `paused`, `already-complete`, `engine-ambiguous`, `engine-unavailable`, `engine-invalid` o un error). `--force` rehace un análisis ya completo. |
| `forge614-atlas update` | Descarga el instalador de la última versión publicada y lo ejecuta con `--force`; responde con la versión anterior y la nueva. |
| `forge614-atlas uninstall [--confirmed]` | Quita Atlas (ver abajo). |
| `forge614-atlas --version`, `-v` | Imprime el nombre del producto y la versión. |
| `forge614-atlas --help`, `-h` | Imprime la ayuda; también `init --help` y `uninstall --help`, sin ejecutar nada. |

Los errores usan un sobre JSON único, `{ "schemaVersion": 1, "status": "error", "error": { "code": "...", "message": "..." } }`; la tabla de comandos, respuestas y códigos de salida está en el [capítulo 08](docs/es/08-nucleo-cli-y-plan-de-corrida.md).

## Seguridad: los ayudantes solo leen
Desde 1.1.0 cada tarea que Atlas manda lleva `readOnly: true`, sin opción de apagarlo. Forge614 Engines pone el candado: Claude Code recibe solo `Read`, `Grep` y `Glob`, sin preguntas de permiso y sin ningún servidor MCP; Codex corre en su sandbox de solo lectura y sin la configuración del usuario. Si Engines o Workers no pueden garantizarlo, Atlas se niega a empezar (`READ_ONLY_UNSUPPORTED`, `WORKERS_OUTDATED`) antes de abrir ninguna sesión de Engram. Solo Atlas guarda en la memoria, nunca los ayudantes. Detalle en el [capítulo 09](docs/es/09-despacho-de-subagentes.md).

Engram guarda además `.forge614/project.json` (la identidad portátil del proyecto) en el repositorio analizado; está pensado para versionarse y Atlas nunca lo lee.

## Desinstalar
`forge614-atlas uninstall` pide escribir exactamente `REMOVE FORGE614-ATLAS` (con `--confirmed` no pregunta). Quita únicamente la carpeta `~/.forge614/atlas` (o `<FORGE614_HOME>/atlas`) y el bloque de PATH que puso el instalador; nunca toca Engram, Engines, Shell, Workers ni las memorias guardadas. Es el comando que usa Engram cuando se desinstala a sí mismo.

## Documentación
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

Además: el contrato del producto ([`CONTRACT.md`](CONTRACT.md) / [`CONTRACT.en.md`](CONTRACT.en.md)), el [estado del proyecto](STATE.md) y el [historial de cambios](CHANGELOG.md).

## Desarrollo
Requiere Bun 1.3.9 o posterior (la CI usa 1.4.2) y, como carpeta hermana, una copia de Engram 1.8.7 con sus dependencias instaladas (`bun install` dentro de `../forge614-engram`). Las pruebas pasan 192 de 192; las que llaman a Engines y a Workers necesitan ambos instalados en `~/.forge614` o en `FORGE614_HOME`, y `init.test.ts` necesita además un Claude Code real y autenticado.

```bash
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
```

## Licencia
Todos los derechos reservados. Ver [`LICENSE`](LICENSE). Las vulnerabilidades se reportan según [`SECURITY.md`](SECURITY.md).
