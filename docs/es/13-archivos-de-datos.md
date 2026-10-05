# 13. Archivos de datos y automatización

> **Traducción hermana:** [13 (EN). Data files](../en/13-data-files.md)

Este capítulo describe los archivos que Atlas lee, escribe o publica, y los flujos que lo verifican. No son configuraciones intercambiables: cada uno tiene un dueño concreto.

## `.forge614/project.json`

Engram escribe este archivo al abrir una sesión para conservar la identidad portátil del proyecto; Atlas no lo lee y excluye `.forge614` al descubrir módulos (`src/modules/scoring/discovery.ts:34`). Engram lo lee al volver a abrir o vincular el proyecto. Su forma pertenece a Engram: incluye la identidad del proyecto (`id`, `name`) y, si aplica, la del grupo. El comportamiento de `init` ante un archivo inválido está en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md).

## `docs/notion-map.json`

Este mapa lo mantiene quien publica las páginas de Notion y lo lee ese proceso de publicación; Atlas no lo consume en ejecución. `reviewedProductVersion` identifica la versión revisada y `reviewedCommit` el commit revisado; ambos cambian solo al volver a publicar las páginas. `pages` es la lista de páginas: cada entrada lleva `localPath` (manual local), `language` (`es` o `en`), `notionUrl` (destino publicado) y `contentFingerprint` (huella de la versión publicada).

## `package.json`

Lo mantiene el proyecto y lo leen Bun, TypeScript, el compilado y las pruebas de versiones. `name` nombra el paquete; `version` alimenta `--version`, la comprobación de `test/versions.test.ts`, el changelog y la etiqueta de release; `private` impide publicar al registro; `type` activa módulos ESM; `exports` publica `src/index.ts`; `scripts` define `test`, `typecheck` y `build`; `engines.bun` fija el mínimo; `dependencies.forge614-engram` enlaza la copia hermana y `dependencies.typescript` fija el compilador.

## Flujos de CI

`verify.yml` se dispara en cada `push` y `pull_request`: comprueba en macOS y Linux la instalación reproducible, Engines/Workers fijados, pruebas (salvo la integración que necesita un asistente autenticado), `typecheck`, espacios y sintaxis del instalador.

`release.yml` corre al crear una etiqueta `v*`, al modificar la maquinaria de release en una PR y manualmente. Verifica, compila cuatro binarios, los reúne con `SHA256SUMS` y, solo en etiquetas, publica la release con los binarios y `install.sh`.

`install-forge614-dependencies/action.yml` es la acción compartida que prepara un `FORGE614_HOME` temporal, descarga Engines 1.17.0 y Workers 1.0.0, valida sus checksums y versiones, y confirma el candado de solo lectura.

## Respuesta de `init`

La respuesta JSON de `init` contiene `schemaVersion`, un `status` y campos que dependen de ese estado; `paused` incluye los conteos y `completed` el reporte final. La lista completa de estados, campos y `rejectedReportModuleNames` está en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md), para no duplicar el contrato.
