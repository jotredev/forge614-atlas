# 13. Archivos de datos y automatización

> **Estado:** vigente para la versión 1.1.1 (rama `work/1.1.1`, aún sin publicar).
> **Traducción hermana:** [13 (EN). Data files and automation](../en/13-data-files.md)

## Propósito

Este capítulo describe, uno por uno, los archivos de datos y de automatización que forman parte de Atlas pero no son código: quién los escribe, quién los lee (con el archivo y la línea) y qué significa cada campo. No son configuraciones intercambiables: cada uno tiene un dueño concreto, y varios los escribe otro programa, no Atlas. Los ejemplos salen de los archivos reales de este repositorio. El contrato de cada comando está en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md), el instalador en el [capítulo 10](10-instalador-y-release.md) y los errores en el [capítulo 11](11-resolucion-de-errores.md).

## `.forge614/project.json`

La tarjeta de identidad del repositorio: un identificador de proyecto (y, si aplica, de su grupo) que viaja con el código y no depende de en qué carpeta del disco esté.

- **Para qué sirve:** que Engram reconozca el mismo proyecto aunque la carpeta cambie de lugar o se clone en otra computadora. Se pretende versionarlo: en este repositorio está en Git.
- **Quién lo escribe:** Engram, nunca Atlas (en `src`, `scripts` y `test` de Atlas solo hay un comentario que lo nombra, `src/modules/scoring/discovery.ts:27`). Engram lo escribe cuando Atlas le abre una sesión o le guarda algo. `init` abre la sesión con `startProjectSession` en `src/modules/cli/init.ts:200` (con `--force`) o, sin `--force`, en `src/modules/memory/run-state.ts:25` (llamada desde `init.ts:210`). Esa función (`forge614-engram/src/app/project-context.ts:202`, líneas de Engram 1.8.7) solo delega en `startProjectSessionWithNotices` (`:175`), que lee el archivo con `applyIdentityFile` (`:179`) y lo publica (`:188`) con `publishIdentity` (`src/app/project-identity.ts:109`); esta llama a `writeIdentity` (`:89`) y `writeIdentity` a `ensureProjectFile` (`src/infrastructure/filesystem/project-identity-file.ts:195`). Si el identificador de sesión pertenece a una sesión cerrada, Engram lanza `SESSION_CONFLICT` antes de publicar (`project-context.ts:186`) y `init` responde `already-complete` sin esa publicación. Cada reporte de módulo (`src/modules/memory/module-report.ts:32`) y cada cambio del contador de pausas (`src/modules/memory/pause-count.ts:37`) pasan por el mismo camino (`project-context.ts:141` y `:146`). `ensureProjectFile` crea el archivo solo si no existe; si ya existe, nunca cambia `project.id` ni `project.name` y solo completa `ecosystem` cuando falta o, estando en `null`, cuando el proyecto ya pertenece a un grupo (`project-identity-file.ts:197-209`). Si Engram no puede escribirlo (por ejemplo, por permisos) solo genera el aviso `PROJECT_FILE_NOT_WRITTEN` (`project-identity.ts:95`) y `init` sigue: `startProjectSession` devuelve solo la sesión, sin los avisos (`project-context.ts:202`).
- **Quién lo lee:** solo Engram lee su contenido. `readProjectFile` (`project-identity-file.ts:119`) lo lee dentro de `applyIdentityFile` (`project-identity.ts:60`), que corre al abrir la sesión y al guardar cada memoria (cada reporte y el contador de pausas), y dentro de `publishIdentity` (`:112`). Atlas no lo lee y excluye la carpeta `.forge614` al descubrir módulos: está en `EXCLUDED_DIRS` (`src/modules/scoring/discovery.ts:19-28`, la línea 27) y los filtros de `:81` y `:105` además descartan cualquier carpeta cuyo nombre empiece con punto.
- **Si es inválido:** Engram no lo modifica y lanza `PROJECT_FILE_INVALID` (`project-identity-file.ts:87`, con un mensaje en español); Atlas no lo atrapa y `init` responde `UNEXPECTED_ERROR` con ese mensaje (ver el [capítulo 11](11-resolucion-de-errores.md)).

### Campos

| Campo | Tipo | Obligatorio | Significado | Ejemplo real |
|---|---|:---:|---|---|
| `schemaVersion` | número | Sí | Versión de la forma del archivo; solo existe `1` (`project-identity-file.ts:46`). | `1` |
| `project` | objeto | Sí | Identidad del proyecto; solo admite `id` y `name`. | `{ "id": …, "name": … }` |
| `project.id` | texto (UUID v4) | Sí | Identificador único del proyecto (un UUID v4: texto de 36 caracteres generado al azar); Engram nunca lo cambia. | `"f35e737c-1648-40b0-bfa2-aa4e7f37334d"` |
| `project.name` | texto | Sí | Nombre para mostrar: no vacío, sin carácter nulo y de hasta 300 caracteres (`:42`). | `"forge614-atlas"` |
| `ecosystem` | objeto o `null` | No | El grupo (ecosistema) al que pertenece el proyecto. Puede faltar o ser `null` (proyecto suelto); Engram lo completa después. | `{ "id": …, "name": … }` |
| `ecosystem.id` | texto (UUID v4) | Sí, si hay `ecosystem` | Identificador del grupo. El del grupo `forge614` es fijo (`forge614-engram/src/modules/ecosystem/rules.ts:16`). | `"e0b3e1c9-ffbb-4b6b-8a55-79fbf3e8f0b4"` |
| `ecosystem.name` | texto | Sí, si hay `ecosystem` | Nombre del grupo: minúsculas, dígitos y guiones simples, de 1 a 64 caracteres (`rules.ts:12-13` y `:47-49`). | `"forge614"` |

Reglas que Engram exige al leerlo (`project-identity-file.ts:119-131`): JSON válido; un tamaño de hasta 64 KiB (`:15`); que `.forge614` sea una carpeta real y `project.json` un archivo normal, no enlaces simbólicos (`:122` y `:126`); y ningún campo desconocido (el esquema es estricto, `:28-49`). Engram lo escribe con sangría de dos espacios, un salto de línea final y `ecosystem` ausente guardado como `null` (`:106`).

El archivo real de este repositorio:

```json
{
  "schemaVersion": 1,
  "project": { "id": "f35e737c-1648-40b0-bfa2-aa4e7f37334d", "name": "forge614-atlas" },
  "ecosystem": { "id": "e0b3e1c9-ffbb-4b6b-8a55-79fbf3e8f0b4", "name": "forge614" }
}
```

(En disco cada objeto ocupa varias líneas; aquí se muestra compacto.)

## `docs/notion-map.json`

El registro de qué manuales locales ya tienen una copia publicada en Notion y a qué versión corresponde esa copia.

- **Para qué sirve:** saber qué capítulos tienen página en Notion, dónde está cada una y cuándo se publicaron por última vez.
- **Quién lo escribe:** quien publica las páginas de Notion, al republicarlas o crear una nueva; ningún programa del repositorio lo genera. Su historial son cinco commits (`f6e0dc6`, `a97e276`, `d7d7cec`, `5319ed9` y `e8b923a`: «document Plan N … and index the Notion mirror» y «record real Notion URLs …»). `reviewedProductVersion` y `reviewedCommit` cambian al republicar las páginas (`reviewedCommit` también se corrigió al registrar las direcciones del capítulo 10: `e8b923a` lo pasó de `6952559` a `5319ed9`); hoy dicen `1.0.0` y `5319ed9` aunque el producto ya va por `1.1.0`, porque las páginas no se han vuelto a publicar (`STATE.md:302`).
- **Quién lo lee:** ningún programa de este repositorio: `grep` no encuentra su nombre ni sus campos en `src`, `scripts`, `test` ni `.github`; solo lo cita `STATE.md:302`. Es un registro para personas, y Atlas no lo consume en ejecución.
- **Qué incluye:** solo los capítulos 08, 09 y 10 (en español y en inglés, seis páginas); los demás capítulos, incluidos el 11, el 12 y este, no aparecen en el mapa.

### Campos

| Campo | Tipo | Obligatorio | Significado | Ejemplo real |
|---|---|:---:|---|---|
| `reviewedProductVersion` | texto | Sí* | Versión del producto que se revisó al publicar las páginas. | `"1.0.0"` |
| `reviewedCommit` | texto | Sí* | Commit (hash corto) del repositorio que se revisó al publicar. | `"5319ed9"` |
| `pages` | lista | Sí* | Una entrada por página publicada. | 6 entradas |
| `pages[].localPath` | texto | Sí* | Ruta del manual local, desde la raíz del repositorio. | `"docs/es/08-nucleo-cli-y-plan-de-corrida.md"` |
| `pages[].language` | texto | Sí* | Idioma de la página: `es` o `en`. | `"es"` |
| `pages[].notionUrl` | texto | Sí* | Dirección de la página en Notion (`https://app.notion.com/p/<identificador>?pvs=204`). | `"https://app.notion.com/p/3e121943d129812d9814cb2e9e9a95c9?pvs=204"` |
| `pages[].contentFingerprint` | texto | Sí* | Etiqueta de la versión publicada de esa página (ver abajo). | `"plan4-dispatch-5cb2ea5"` |

\* Ningún programa valida este archivo; «Sí» quiere decir que los tres campos de arriba y los cuatro de cada entrada están siempre presentes en el archivo real.

**Cómo se arma la huella (`contentFingerprint`).** No es un resumen calculado del texto: comparándola con el archivo, tiene la forma `<etiqueta del plan>-<hash corto de un commit>`. `plan4-dispatch-5cb2ea5` (capítulos 08 y 09) usa el commit `5cb2ea5`, «docs: close out Plan 4 in STATE.md», y `plan5-installer-6952559` (capítulo 10) usa `6952559`, «docs: close out Plan 5 in STATE.md». Nada en el repositorio la calcula ni la compara, así que no avisa si el texto cambia después: quien republica debe actualizarla.

## `package.json`

La ficha del paquete. Solo importan aquí los campos que Atlas, su binario compilado, su CI o sus pruebas usan de verdad.

- **Quién lo escribe:** el equipo del proyecto (la versión sube con cada publicación; `test/versions.test.ts` obliga a que el capítulo 10 y `CHANGELOG.md` digan la misma).
- **Quién lo lee:** Bun y TypeScript al instalar y compilar; el código de Atlas (solo `version`); las pruebas y los flujos de CI, según la tabla.

### Campos

| Campo | Tipo | Obligatorio | Significado | Quién lo usa | Ejemplo real |
|---|---|:---:|---|---|---|
| `version` | texto | Sí | Versión del producto. | `src/interfaces/cli/main.ts:7` la importa y la imprime en `--version` (`:40`) y en `--help` (`:34`), y se la pasa a `update` (`:45`): queda dentro del binario. `test/versions.test.ts:8` y `src/interfaces/cli/main.test.ts:10` la comparan. `release.yml:73`, `:79` y `:134` la usan para el changelog, la etiqueta y la prueba del binario. | `"1.1.0"` |
| `exports` | texto | No | Entrada pública cuando Atlas se usa como librería. | Ningún archivo del repositorio la lee; `src/index.ts:2` la cita. | `"./src/index.ts"` |
| `scripts.typecheck` | texto | No | Revisa los tipos sin generar archivos. | `verify.yml:66` y `release.yml:66` (`bun run typecheck`). | `"tsc --noEmit"` |
| `scripts.test` | texto | No | Corre todas las pruebas. | Uso local; la CI no lo llama: corre `bun test` con una lista de archivos (`verify.yml:65`). | `"bun test"` |
| `scripts.build` | texto | No | Compila el binario independiente. | Uso local (capítulo 08); la CI compila con el mismo punto de entrada, pero con `--target` (`release.yml:130`). | `"bun build ./src/interfaces/cli/main.ts --compile --outfile dist/forge614-atlas"` |
| `engines.bun` | texto | No | Versión mínima de Bun. | Ningún programa del repositorio la comprueba; el `README.md` la repite como requisito (`:76`) y la CI fija Bun 1.4.2 aparte (`verify.yml:39`, `release.yml:39`). | `">=1.3.9"` |
| `dependencies.typescript` | texto | Sí | Compilador, con versión exacta. | Atlas lo usa al ejecutarse para contar caminos y dependencias (`src/modules/scoring/cyclomatic.ts:10`, `src/modules/scoring/fan-in.ts:11`; queda dentro del binario) y el comando `tsc` (el compilador de TypeScript) para revisar los tipos. | `"5.9.3"` |
| `dependencies.forge614-engram` | texto | Sí | La librería de Engram, tomada de una carpeta hermana. | Atlas la importa en `src` (por ejemplo `src/modules/cli/init.ts:6`) y queda dentro del binario; la CI descarga esa carpeta hermana en la versión `ENGRAM_REF` (`verify.yml:30-36`). | `"file:../forge614-engram"` |
| `devDependencies.@types/bun` | texto | No | Tipos de Bun para el revisor de tipos. | `tsconfig.json:10` pide los tipos `bun-types`, que trae este paquete. | `"latest"` |

Los demás campos (`name`, `private`, `type` y `description`) no los lee ningún archivo del repositorio: los interpretan Bun y el gestor de paquetes (`type: "module"` hace que los archivos se lean como módulos ESM).

## `.github/workflows/verify.yml`

El flujo «Verify»: la revisión que corre en cada cambio.

- **Quién lo escribe y quién lo lee:** el equipo del proyecto lo escribe; lo lee y ejecuta GitHub Actions.
- **Qué comprueba:** que el proyecto se instale igual que en desarrollo local, que las pruebas pasen contra los Engines y Workers fijados, que los tipos cuadren y que el instalador sea sintácticamente válido.
- **Qué publica:** nada. Solo tiene permiso de lectura (`contents: read`, `:7-8`).

### Disparadores

| Disparador | Cuándo corre | Línea |
|---|---|:---:|
| `pull_request` | En cualquier pull request, sin filtros. | `:4` |
| `push` | En cualquier push, a cualquier rama o etiqueta, sin filtros. | `:5` |

### Trabajos

| Trabajo | Nombre | Sistema | Qué hace |
|---|---|---|---|
| `unix` | `Unix checks (<sistema>)` | `ubuntu-latest` y `macos-latest`, en paralelo y sin cortar uno si el otro falla (`fail-fast: false`); tope de 25 minutos | Instala, prueba y verifica. |

### Pasos principales

1. Descarga Atlas en la carpeta `forge614-atlas` (`actions/checkout@v4`).
2. Descarga Engram, en la versión de `ENGRAM_REF`, en la carpeta hermana `forge614-engram` (Atlas depende de ella por `file:../forge614-engram`).
3. Instala Bun 1.4.2 (`oven-sh/setup-bun@v2`), después las dependencias de Engram con `bun install --frozen-lockfile` (el archivo de bloqueo manda: no cambia versiones) y las de Atlas, también con `--frozen-lockfile`.
4. Instala Engines y Workers en versiones fijas con la acción compartida (ver más abajo).
5. Corre todas las pruebas (`*.test.ts`) salvo `src/modules/cli/init.test.ts`: sus pruebas de `completed` lanzan un Claude Code real y autenticado, que un corredor compartido (la máquina virtual de GitHub donde corre el flujo) no tiene. Las demás corren de verdad, incluidas las que llaman a los Engines y Workers fijados (su motor de IA es un script de prueba).
6. `bun run typecheck`, `git diff --check` (busca espacios sobrantes en los cambios pendientes; en una ejecución limpia solo encontraría los que un paso anterior hubiera dejado) y `bash -n scripts/install.sh` (revisa la sintaxis del instalador sin ejecutarlo).

### Versiones fijadas

| Qué | Versión | Línea |
|---|---|:---:|
| Engram (`ENGRAM_REF`) | `v1.8.7` | `:12` |
| Bun | `1.4.2` | `:39` |
| Engines | `1.17.0` (por la acción compartida) | — |
| Workers | `1.0.0` (por la acción compartida) | — |
| Acciones | `actions/checkout@v4`, `oven-sh/setup-bun@v2` | `:27`, `:37` |

Los sistemas `ubuntu-latest` y `macos-latest` no están fijados: GitHub los mueve a la versión más reciente.

## `.github/workflows/release.yml`

El flujo «Release standalone artifacts»: construye y publica los binarios de una versión.

- **Quién lo escribe y quién lo lee:** el equipo del proyecto lo escribe; lo lee y ejecuta GitHub Actions.
- **Qué comprueba:** repite la batería de `verify.yml` en `ubuntu-latest` y agrega dos comprobaciones: que `CHANGELOG.md` tenga una línea `## <versión>` para la versión de `package.json` (`:69-75`) y, en una etiqueta, que la etiqueta sea `v` más esa versión (`:76-83`). Cada binario compilado debe responder `forge614-atlas <versión>` (`:131-139`), y los cuatro binarios con su `SHA256SUMS` se validan antes de subirlos (`:174-192`).
- **Qué publica:** solo el trabajo `publish`, y solo con una etiqueta: crea la release de GitHub con los cuatro binarios, `SHA256SUMS` y `scripts/install.sh` (publicado como `install.sh`), con las notas generadas por GitHub (`:227-236`). Una etiqueta con guion (por ejemplo `v1.2.0-rc.1`) se publica como versión preliminar (`:224-226`).

### Disparadores

| Disparador | Cuándo corre | Publica | Línea |
|---|---|:---:|:---:|
| `push` de una etiqueta `v*` | Al subir una etiqueta como `v1.1.0`. | Sí | `:4-6` |
| `pull_request` que cambie `.github/workflows/release.yml`, `.github/actions/install-forge614-dependencies/action.yml` o `scripts/install.sh` | Cuando el cambio toca la maquinaria de release. | No | `:8-12` |
| `workflow_dispatch` | A mano, desde GitHub. | No (`publish` exige un `push` de etiqueta, `:207`) | `:13` |

### Trabajos

| Trabajo | Nombre | Sistema | Qué hace |
|---|---|---|---|
| `verify` | `Release verification` | `ubuntu-latest` | Instala, prueba, revisa tipos, y comprueba el changelog y la etiqueta. |
| `build` | `Build <artefacto>` (cuatro, en paralelo) | `macos-14` (`darwin-arm64`), `macos-15-intel` (`darwin-x64`), `ubuntu-latest` (`linux-x64`) y `ubuntu-24.04-arm` (`linux-arm64`) | Compila el binario con `bun build … --compile --target=<destino>`, lo prueba con `--version`, lo empaqueta en `.tar.gz` (para conservar el permiso de ejecución) y lo sube. |
| `assemble` | `Assemble and validate release assets` | `ubuntu-latest`; espera a `build` | Extrae los cuatro binarios, genera `SHA256SUMS` (cuatro líneas) y valida que existan, sean ejecutables y que cada huella cuadre. |
| `publish` | `Publish GitHub Release` | `ubuntu-latest`; espera a `verify` y `assemble`; permiso de escritura (`contents: write`) | Crea la release con `gh release create`. Solo corre con un `push` de etiqueta. |

### Pasos principales

1. `verify`: los mismos pasos 1 a 6 de `verify.yml` (con la lista de pruebas sin `init.test.ts`), más las dos comprobaciones de arriba.
2. `build`: descarga Atlas y Engram (`ENGRAM_REF`), instala Bun y las dependencias, crea `dist`, compila, prueba el binario nativo (cada corredor compila para su propia arquitectura), empaqueta y sube.
3. `assemble`: baja los cuatro paquetes, los extrae, genera y valida `SHA256SUMS` y sube los archivos finales como `release-assets`.
4. `publish`: baja `release-assets` y crea la release.

### Versiones fijadas

| Qué | Versión | Línea |
|---|---|:---:|
| Engram (`ENGRAM_REF`) | `v1.8.7` | `:19` |
| Bun | `1.4.2` (en `verify` y en cada fila de `build`) | `:39`, `:98`, `:102`, `:106`, `:110` |
| Engines | `1.17.0` (por la acción compartida) | — |
| Workers | `1.0.0` (por la acción compartida) | — |
| Acciones | `actions/checkout@v4`, `oven-sh/setup-bun@v2`, `actions/upload-artifact@v4`, `actions/download-artifact@v4` | `:29`, `:37`, `:142`, `:153` |

`ENGRAM_REF` está escrito en este archivo y también en `verify.yml`: si cambia, hay que cambiarlo en los dos.

## `.github/actions/install-forge614-dependencies/action.yml`

La acción compartida que usan `verify.yml` y `release.yml` (`verify`) para tener Engines y Workers reales, en una versión fija, sin depender de la última release ni de la carpeta personal del corredor.

- **Quién lo escribe y quién lo lee:** el equipo del proyecto lo escribe; lo ejecutan los dos flujos con `uses: ./forge614-atlas/.github/actions/install-forge614-dependencies`.
- **Qué comprueba:** que cada descarga coincida con su huella publicada, que el binario instalado diga la versión pedida y que Engines garantice, para `claude-code`, el candado de solo lectura (que el ayudante no pueda modificar el proyecto: `"supportsReadOnly": true`). Un Engines equivocado o viejo falla aquí con un mensaje claro, no como una pila de pruebas rotas.
- **Qué publica:** nada; deja los binarios en una carpeta temporal.

### Entradas

| Entrada | Tipo | Obligatoria | Significado | Valor por omisión | Línea |
|---|---|:---:|---|---|:---:|
| `engines-version` | texto | No | Versión de Engines, sin la `v` inicial. | `"1.17.0"` | `:8-10` |
| `workers-version` | texto | No | Versión de Workers, sin la `v` inicial. | `"1.0.0"` | `:11-13` |

### Pasos principales

1. Apunta `FORGE614_HOME` a la carpeta temporal `$RUNNER_TEMP/forge614` (`:18-23`).
2. Instala Engines (`:25-55`): elige el paquete según el sistema (`Linux-X64`, `Linux-ARM64`, `macOS-ARM64` o `macOS-X64`; cualquier otro falla), baja `forge614-engines-<versión>-<destino>.tar.gz` y su `.sha256` de `https://github.com/jotredev/forge614-engines/releases/download/v<versión>/`, verifica la huella con `shasum -a 256 -c`, lo instala en `$FORGE614_HOME/engines/bin/forge614-engines`, exige que `--version` diga `forge614-engines <versión>` y que `capabilities --agent claude-code` traiga `"supportsReadOnly": true`.
3. Instala Workers (`:57-84`): baja `forge614-workers-<destino>` y `SHA256SUMS` de `https://github.com/jotredev/forge614-workers/releases/download/v<versión>/`, verifica el binario contra su propia línea del `SHA256SUMS`, lo instala en `$FORGE614_HOME/workers/bin/forge614-workers` y exige que `--version` diga `forge614-workers <versión>`.

Las versiones fijadas son las de la tabla de entradas: Engines `1.17.0` y Workers `1.0.0`. Son también las mínimas que necesita Atlas en tiempo de ejecución: de Workers comprueba la versión y de Engines comprueba que declare `supportsReadOnly: true`, campo que existe desde la 1.17.0 (ver el [capítulo 09](09-despacho-de-subagentes.md)).

## Respuesta JSON de `init`

Lo que `init` imprime en la salida estándar (`runInitCommand` en `src/modules/cli/init.ts:164`; el tipo `InitOutcome`, `:43-67`). Toda respuesta lleva `schemaVersion: 1`. El detalle de cada caso, y qué hacer, está en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md) y en el [capítulo 11](11-resolucion-de-errores.md).

| `status` | Salida | Campos además de `schemaVersion` y `status` | Cuándo | Línea |
|---|:---:|---|---|:---:|
| `completed` | 0 | `engine` (`{ id, executable }`), `session` (`{ sessionId, resumed }`) y `report` (el reporte final, ver el [capítulo 09](09-despacho-de-subagentes.md)) | El lote terminó. | `init.ts:148` |
| `paused` | 0 | `engine`, `session`, `analyzedCount` y `pendingCount` (números) | Se agotó la cuota de la suscripción de IA a mitad del lote. | `init.ts:137` |
| `already-complete` | 0 | ninguno | El análisis de este proyecto ya terminó (solo sin `--force`). | `init.ts:212` |
| `engine-ambiguous` | 0 | `candidates` (lista de `{ id, executable }`) | Dos o más motores posibles y ninguno pedido. | `resolve-engine.ts:46` |
| `engine-unavailable` | 0 | ninguno | Ningún motor posible y ninguno pedido. | `resolve-engine.ts:44` |
| `engine-invalid` | 0 | `requestedId` (texto) y `candidates` | El `--engine` pedido no es un motor posible. | `resolve-engine.ts:37` |
| `error` | 1 | `error` (`{ code, message }`) | Ver abajo. | `init.ts:75` |

Campos comunes: `engine.id` es el identificador del motor (por ejemplo `claude-code`), `engine.executable` la ruta de su ejecutable, `session.sessionId` el identificador de la sesión de Engram (`atlas:` y 16 caracteres hexadecimales; con `--force`, además `:` y los milisegundos, `src/modules/memory/session-id.ts:56` y `:67`) y `session.resumed` si la corrida continúa una anterior (siempre `false` con `--force`, `init.ts:207`).

Los códigos (`code`) de `error` que salen de `runInitCommand` son `ENGINES_UNREACHABLE` (`init.ts:169` y `:179`), `READ_ONLY_UNSUPPORTED`, `WORKERS_UNREACHABLE` y `WORKERS_OUTDATED` (las tres de la comprobación previa, `init.ts:196`; la primera también al despachar, `:134`), `ANALYSIS_FAILED` (`:205` y `:219`) y `WORKERS_FATAL_ERROR` (`:120` y `:127`). Los otros dos errores que puede ver quien llama a `init`, `INVALID_FORGE614_HOME` y `UNEXPECTED_ERROR`, no salen de aquí, sino de `src/interfaces/cli/commands.ts` y de `src/interfaces/cli/main.ts:73`.
