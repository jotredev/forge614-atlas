# 11. Resolución de errores

> **Estado:** vigente para la versión 1.1.1 (rama `work/1.1.1`, aún sin publicar).
> **Traducción hermana:** [11 (EN). Troubleshooting](../en/11-troubleshooting.md)

## Propósito

Este capítulo es el «qué hago ahora» de Atlas. Por cada respuesta que no es un éxito dice qué ve la persona, por qué pasa (con el archivo y la línea del código que la produce) y qué hacer. La lista sale de la tabla «Códigos de error» de `CONTRACT.md` (16 códigos) y de los cinco estados de `init` que no entregan un análisis terminado. El detalle de cada comando está en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md) y el del despacho en el [capítulo 09](09-despacho-de-subagentes.md).

Todo error sale en la salida estándar con el mismo sobre (la forma fija de la respuesta de error):

```json
{ "schemaVersion": 1, "status": "error", "error": { "code": "…", "message": "…" } }
```

`UNKNOWN_COMMAND` es la excepción: lleva `argv` (los argumentos recibidos) en vez de `message`. Los mensajes de Atlas están en inglés y aquí se citan tal cual; los que vienen de Engram (por ejemplo, el de `UNEXPECTED_ERROR` por `.forge614/project.json`) están en español.

## Códigos de salida

| Código | Cuándo |
|:---:|---|
| `0` | Éxito: `init` con `completed`, `paused`, `already-complete`, `engine-ambiguous`, `engine-unavailable` o `engine-invalid`; `update` con `updated`; `uninstall` con `uninstalled`; `--version` y `--help`. |
| `1` | Cualquier respuesta con `status: "error"`, salvo `UNINSTALL_CANCELLED`. |
| `130` | Solo `UNINSTALL_CANCELLED`: la persona escribió otra cosa en vez de la frase de confirmación. |

Ojo: los cinco estados de `init` de la última sección salen con `0` aunque no hayan entregado un análisis terminado (`paused` ya pudo guardar parte de los reportes; `already-complete` no analiza nada; `src/interfaces/cli/commands.ts:61` solo pone `1` cuando la respuesta lleva `error`). Un programa que llama a Atlas debe leer `status`, no solo el código de salida.

## Errores de configuración y de uso

### `INVALID_FORGE614_HOME`

- **Qué ves:** `"code": "INVALID_FORGE614_HOME"`, mensaje `FORGE614_HOME must be a non-empty absolute path.`, salida 1. Lo responden `init`, `update` y `uninstall` apenas empiezan (`init` no llega a abrir Engram; `uninstall` revisa antes sus argumentos, así que con un argumento inválido responde `INVALID_ARGUMENT`).
- **Por qué pasa:** la variable `FORGE614_HOME` existe pero está vacía, es una ruta relativa (por ejemplo `relative/forge614`) o tiene un carácter nulo (`src/modules/forge-home/forge-home.ts:38`). Una variable vacía no se ignora: es un error, igual que en Engram.
- **Qué hacer:** mira su valor con `echo "$FORGE614_HOME"`. Dale una ruta absoluta (`export FORGE614_HOME="$HOME/.forge614"`) o quítala (`unset FORGE614_HOME`) para usar la carpeta por omisión, `~/.forge614`. Si la pusiste en el perfil de tu terminal (`~/.zshrc`, `~/.bashrc`…), corrígela también ahí.

### `UNKNOWN_COMMAND`

- **Qué ves:** `{ "schemaVersion": 1, "status": "error", "error": { "code": "UNKNOWN_COMMAND", "argv": [...] } }`, salida 1.
- **Por qué pasa:** el primer argumento no es `init`, `update`, `uninstall`, `--version` ni `-v` (`src/interfaces/cli/main.ts:65`). Por ejemplo, `forge614-atlas analyze`.
- **Qué hacer:** corre `forge614-atlas --help` para ver los comandos que existen. Si en la línea aparece `--help` o `-h` en cualquier posición, Atlas imprime la ayuda en vez de este error.

### `INVALID_ARGUMENT`

- **Qué ves:** salida 1 con uno de estos mensajes:
  - `forge614-atlas update takes no arguments.` (`src/modules/updater/updater.ts:144`): `update` recibió algo, por ejemplo `update --force`.
  - `--from only accepts forge614-engram.` (`src/interfaces/cli/uninstall-command.ts:68`): `uninstall --from` sin valor o con otro valor.
  - `Unknown argument for uninstall: <argumento>` (`src/interfaces/cli/uninstall-command.ts:73`).
- **Qué hacer:** `update` no lleva argumentos: corre `forge614-atlas update`. `uninstall` solo acepta `--confirmed` y `--from forge614-engram` (este último lo usa Engram cuando desinstala a Atlas; no cambia lo que se hace).

### `UNEXPECTED_ERROR`

- **Qué ves:** `"code": "UNEXPECTED_ERROR"` con el mensaje original del fallo, salida 1.
- **Por qué pasa:** algo falló fuera de los casos previstos y llegó hasta el `.catch` de `src/interfaces/cli/main.ts:73`. Casos conocidos: Engram no pudo abrir su base o su sesión al empezar `init`; el archivo `.forge614/project.json` del proyecto existe pero no es válido (Engram lo rechaza; ver el capítulo 08); o un error del sistema de archivos que `uninstall` no tenía previsto (por ejemplo, de permisos).
- **Qué hacer:** lee el mensaje: dice la causa real. Si nombra `project.json`, corrige o borra `.forge614/project.json` en la raíz del proyecto y vuelve a correr `forge614-atlas init`. Si es de permisos, corrige los permisos de la ruta que nombra. Si el mensaje no da una pista, vuelve a intentarlo; un error que se repite igual es un fallo de Atlas o de Engram: lo que queda es avisar a quien mantiene Forge614, con el mensaje completo.

## Errores de `init` antes del análisis

### `ENGINES_UNREACHABLE`

- **Qué ves:** salida 1 con `forge614-engines detect failed: <detalle>` (`src/modules/engines-client/detect.ts:43`) o `forge614-engines capabilities failed for <agente>: <detalle>` (`src/modules/engines-client/capabilities.ts:50`). `init` lo responde en `src/modules/cli/init.ts:169` y `:179`.
- **Por qué pasa:** el binario de Engines, `<FORGE614_HOME>/engines/bin/forge614-engines`, no existe, no arranca o termina con error. Si responde algo que no es JSON (texto con campos), el mensaje es el error de lectura del JSON.
- **Qué hacer:** comprueba que exista y responda: `~/.forge614/engines/bin/forge614-engines --version` (cambia `~/.forge614` por tu `FORGE614_HOME` si la usas) y `~/.forge614/engines/bin/forge614-engines detect`. Si falta o falla, instálalo o actualízalo con `curl -fsSL https://github.com/jotredev/forge614-engines/releases/latest/download/install.sh | bash`, o con `forge614-engines update` si ya está instalado. Después vuelve a correr `forge614-atlas init`.

### `READ_ONLY_UNSUPPORTED`

- **Qué ves:** salida 1 y `Forge614 Engines does not guarantee read-only helpers for "<agente>" (Engines 1.17.0 or newer is required). Update it with: forge614-engines update` (`src/modules/cli/requirements.ts:37`).
- **Por qué pasa:** en dos momentos. (1) Al empezar, antes de abrir ninguna sesión de Engram: Engines no declara `supportsReadOnly: true` para el motor elegido (`src/modules/cli/requirements.ts:85`; un Engines anterior a ese campo no lo declara, y Atlas toma su ausencia como `false`). (2) Durante el despacho: Workers se negó a correr tareas porque no pudo garantizar el candado de solo lectura (`src/modules/cli/init.ts:134`); en ese caso la sesión de Engram queda abierta. Atlas nunca manda un ayudante que pueda escribir en tu proyecto.
- **Qué hacer:** corre `forge614-engines update` y luego `forge614-engines capabilities --agent <agente>`, que debe mostrar `supportsReadOnly` en `true`. Vuelve a correr `forge614-atlas init`; si la sesión había quedado abierta, se retoma.

### `WORKERS_UNREACHABLE`

- **Qué ves:** salida 1 y el mensaje del sistema al buscar el archivo, por ejemplo `ENOENT: no such file or directory, access '<ruta>'` (`src/modules/cli/requirements.ts:91`).
- **Por qué pasa:** el binario de Workers, `<FORGE614_HOME>/workers/bin/forge614-workers`, no existe o no tiene permiso de ejecución. Se comprueba antes de abrir ninguna sesión.
- **Qué hacer:** instálalo con `curl -fsSL https://github.com/jotredev/forge614-workers/releases/latest/download/install.sh | bash`, o corre `forge614-atlas update`: el instalador de Atlas instala Workers si falta. Si el archivo existe, revisa sus permisos (`ls -l ~/.forge614/workers/bin/forge614-workers`).

### `WORKERS_OUTDATED`

- **Qué ves:** salida 1 y `Forge614 Workers 1.0.0 or newer is required (found: <versión o unknown>). Install it with: curl -fsSL https://github.com/jotredev/forge614-workers/releases/latest/download/install.sh | bash` (`src/modules/cli/requirements.ts:46`, devuelto en `:96`).
- **Por qué pasa:** `forge614-workers --version` respondió una versión anterior a 1.0.0, no respondió en 10 segundos, salió con error o no imprimió exactamente `forge614-workers X.Y.Z`. Un Workers anterior a 1.0.0 ignoraría el candado de solo lectura, por eso Atlas no lo usa.
- **Qué hacer:** corre la orden de instalación que trae el mensaje (o `forge614-atlas update`, que también lo reinstala si es viejo) y comprueba con `forge614-workers --version`.

### `ANALYSIS_FAILED`

- **Qué ves:** salida 1; lo más común es `git log failed in <carpeta>: <error de git>` (`src/modules/scoring/churn.ts:53`). `init` lo responde en `src/modules/cli/init.ts:205` y `:219`.
- **Por qué pasa:** Atlas no pudo puntuar el proyecto. La causa típica es que la carpeta no es un repositorio de Git o no tiene ningún commit: el churn (cuántas veces cambió cada archivo) sale del historial de Git. También llega aquí un error al leer las carpetas del proyecto.
- **Qué hacer:** corre `forge614-atlas init` desde la raíz de un repositorio con al menos un commit (`git status` y `git log -1` deben funcionar). En un proyecto nuevo: `git init`, `git add .` y `git commit -m "first commit"`. Si el mensaje es de permisos, corrígelos en la carpeta que nombra.

## Errores de `init` durante el despacho

### `WORKERS_FATAL_ERROR`

- **Qué ves:** salida 1 con uno de estos mensajes:
  - `<motivo>: <detalle>` cuando Workers avisó un error fatal (`src/modules/cli/dispatch-modules.ts:140`, respondido en `src/modules/cli/init.ts:127`). Los motivos que Workers usa son `invalid_input`, `engines_bin_not_found` y `unexpected_error`.
  - El error que cortó el despacho (`src/modules/cli/init.ts:120`), por ejemplo `runWorkersBatch: failed to parse NDJSON line from forge614-workers: …` (Workers imprimió una línea que no es JSON) o `runWorkersBatch: onEvent handler threw while processing a "task_completed" event` (falló guardar un reporte en Engram por una causa distinta de `SECRET_REJECTED`, que es cuando Engram se niega a guardar un texto que parece un secreto: en ese caso Atlas omite el módulo y sigue; ver el [glosario](12-glosario.md), «Reporte rechazado»).
- **Por qué pasa:** Workers no pudo correr el lote de tareas, o Atlas no pudo procesar lo que devolvió. La sesión de Engram no se cierra y los reportes ya guardados se quedan.
- **Qué hacer:** con `engines_bin_not_found`, instala o repara Engines como en `ENGINES_UNREACHABLE`. En los demás casos, comprueba Workers (`forge614-workers --version`) y vuelve a correr `forge614-atlas init`: retoma la sesión y no repite los módulos que ya tienen reporte. Si se repite igual, lo que queda es avisar a quien mantiene Forge614, con el mensaje completo.

## Errores de `update`

### `UPDATE_FAILED`

- **Qué ves:** salida 1 y un JSON con uno de estos mensajes (lo arma `src/modules/updater/updater.ts:157`); si el instalador llegó a correr, sus mensajes salen antes en la terminal:
  - `Could not download the Forge614 Atlas installer.` (`src/modules/updater/updater.ts:73`), o un error de red: no se pudo bajar el instalador.
  - `The Forge614 Atlas installer failed; the installed version was not confirmed.` (`src/modules/updater/updater.ts:106`): el instalador terminó con error; la causa está en sus mensajes, justo arriba (por ejemplo, una dependencia que no se pudo instalar, seguida de `Atlas was not changed.`).
  - `The installed Forge614 Atlas did not report a valid version.` (`src/modules/updater/updater.ts:59`): el binario instalado no respondió `forge614-atlas X.Y.Z`.
- **Qué hacer:** revisa la conexión y vuelve a correr `forge614-atlas update`. Si el instalador falló, corrige lo que dicen sus mensajes (por ejemplo, actualizar Engines con `forge614-engines update`) y repite. También puedes correr el instalador a mano: `curl -fsSL https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh | bash -s -- --force`.

## Errores de `uninstall`

En todos estos casos, salvo `PATH_REMOVE_FAILED` al reescribir y `UNINSTALL_FAILED`, **no se borró nada**.

### `CONFIRMATION_REQUIRED`

- **Qué ves:** salida 1 y `Run it from a terminal and type REMOVE FORGE614-ATLAS, or pass --confirmed.` (`src/interfaces/cli/uninstall-command.ts:94`).
- **Por qué pasa:** corriste `uninstall` sin `--confirmed` y sin una terminal donde preguntar (por ejemplo, desde un script).
- **Qué hacer:** córrelo desde una terminal y escribe la frase, o agrega `--confirmed`: `forge614-atlas uninstall --confirmed`.

### `UNINSTALL_CANCELLED`

- **Qué ves:** salida **130** y `The confirmation did not match; nothing was removed.` (`src/interfaces/cli/uninstall-command.ts:99`).
- **Por qué pasa:** a la pregunta respondiste algo distinto de `REMOVE FORGE614-ATLAS`, exacto, con mayúsculas.
- **Qué hacer:** si sí querías desinstalar, vuelve a correr `forge614-atlas uninstall` y escribe la frase tal cual.

### `UNINSTALL_UNSAFE`

- **Qué ves:** salida 1 y `The Forge614 folder is not a real folder; nothing was removed.` o `The Forge614 Atlas folder is not a real folder; nothing was removed.` (`src/modules/uninstall/uninstall.ts:99` y `:103`).
- **Por qué pasa:** `<FORGE614_HOME>` o `<FORGE614_HOME>/atlas` existe pero no es una carpeta real: es un enlace simbólico (un acceso directo a otra ruta) u otro tipo de archivo. Atlas no borra a través de un enlace, para no borrar algo que está en otro lugar.
- **Qué hacer:** míralo con `ls -ld ~/.forge614 ~/.forge614/atlas` (o con tu `FORGE614_HOME`). Si es un enlace, decide tú qué hacer con él y con lo que apunta; Atlas no lo hará por ti.

### `PATH_REMOVE_FAILED`

- **Qué ves:** salida 1 y un mensaje que nombra el perfil de la terminal:
  - `The Forge614 Atlas PATH block in <perfil> cannot be removed safely: <motivo>` (`src/modules/uninstall/uninstall.ts:118`), con motivo `it is not a regular file.`, `it cannot be read.`, `The Forge614 Atlas PATH block is nested or duplicated.`, `… has an end mark without a start.` o `… was never closed.` (`src/modules/uninstall/path-block.ts:46`, `:50` y `:57`). Esto se comprueba antes de cambiar nada.
  - `The Forge614 Atlas PATH block in <perfil> could not be rewritten.` (`src/modules/uninstall/uninstall.ts:161`): falló la escritura; los perfiles anteriores de la lista (`~/.zshrc`, `~/.bash_profile`, `~/.bashrc` y el de fish, en ese orden) ya quedaron limpios.
- **Por qué pasa:** el bloque de PATH (las líneas que el instalador agregó entre `# >>> forge614-atlas PATH >>>` y `# <<< forge614-atlas PATH <<<`) está incompleto, repetido o editado a mano, o el perfil es un enlace o no se puede leer o escribir. Una marca solo cuenta si la línea es exactamente igual a ella.
- **Qué hacer:** abre el perfil que nombra el mensaje y deja un solo bloque con sus dos marcas, o bórralo entero a mano. Si el motivo es `it is not a regular file.` (el perfil es un enlace simbólico, por ejemplo hacia una carpeta de configuración compartida), Atlas no lo toca nunca, aunque ya no tenga el bloque: quita el bloque a mano en el archivo al que apunta el enlace y, para que `uninstall` pueda seguir, reemplaza el enlace por un archivo normal (por ejemplo, con una copia de su contenido). Revisa los permisos si no se pudo leer o escribir. Vuelve a correr `forge614-atlas uninstall`: los perfiles que ya son archivos normales y están limpios no tienen bloque y no se tocan.

### `UNINSTALL_FAILED`

- **Qué ves:** salida 1 y `The Forge614 Atlas folder could not be removed (<motivo>). The PATH blocks were already removed.` (`src/interfaces/cli/uninstall-command.ts:125`).
- **Por qué pasa:** los bloques de PATH ya se quitaron, pero la carpeta `<FORGE614_HOME>/atlas` no se pudo borrar (por ejemplo, por permisos, o porque justo antes de borrar dejó de ser una carpeta real).
- **Qué hacer:** como el PATH ya no tiene a Atlas, en una terminal nueva usa la ruta completa: `~/.forge614/atlas/bin/forge614-atlas uninstall --confirmed`. Si el motivo es de permisos, corrígelos antes. Si sigue fallando, revisa la carpeta con `ls -ld ~/.forge614/atlas` y bórrala tú.

## Estados de `init` que no son un análisis terminado

Salen con código 0 (no son errores), pero no analizaron nada nuevo o no terminaron. Los tres primeros los decide `src/modules/cli/resolve-engine.ts` antes de abrir ninguna sesión; un motor candidato es un agente que Engines ve instalado, con ejecutable y con `supportsHeadlessExec: true` (puede correr sin pantalla).

### `engine-ambiguous`

- **Qué ves:** `{ "schemaVersion": 1, "status": "engine-ambiguous", "candidates": [ { "id": "…", "executable": "…" }, … ] }`.
- **Por qué pasa:** hay dos o más motores candidatos y no dijiste cuál usar (`src/modules/cli/resolve-engine.ts:46`).
- **Qué hacer:** elige uno de `candidates`: `forge614-atlas init --engine claude-code` o `forge614-atlas init --engine codex`.

### `engine-unavailable`

- **Qué ves:** `{ "schemaVersion": 1, "status": "engine-unavailable" }`.
- **Por qué pasa:** no pediste un motor y Engines no encontró ningún candidato (`src/modules/cli/resolve-engine.ts:44`). Atlas trabaja con Claude Code y con Codex.
- **Qué hacer:** instala Claude Code o Codex. Comprueba lo que ve Engines con `forge614-engines detect` y vuelve a correr `forge614-atlas init`.

### `engine-invalid`

- **Qué ves:** `{ "schemaVersion": 1, "status": "engine-invalid", "requestedId": "…", "candidates": [ … ] }`.
- **Por qué pasa:** el valor de `--engine` no es uno de los candidatos (`src/modules/cli/resolve-engine.ts:37`): está mal escrito, ese asistente no está instalado o no puede correr sin pantalla. La lista puede venir vacía.
- **Qué hacer:** usa un `id` de `candidates`. Si la lista está vacía, sigue los pasos de `engine-unavailable`.

### `already-complete`

- **Qué ves:** `{ "schemaVersion": 1, "status": "already-complete" }`, salida 0 (`src/modules/cli/init.ts:212`).
- **Por qué pasa:** el análisis de este proyecto ya terminó: Engram responde que el identificador de sesión de este repositorio pertenece a una sesión cerrada (`src/modules/memory/run-state.ts:28`). Atlas no analiza nada.
- **Qué hacer:** nada, si el análisis guardado te sirve. Para rehacerlo desde cero corre `forge614-atlas init --force`: abre una sesión nueva y analiza todos los módulos otra vez.

### `paused`

- **Qué ves:** `{ "schemaVersion": 1, "status": "paused", "engine": {…}, "session": {…}, "analyzedCount": N, "pendingCount": M }` (`src/modules/cli/init.ts:140`).
- **Por qué pasa:** se agotó la cuota de tu suscripción de IA a mitad del lote. Los reportes de los `analyzedCount` módulos ya están guardados en Engram; la sesión queda abierta a propósito y el contador de pausas suma uno (`src/modules/cli/dispatch-modules.ts:161`). Como se despacha primero lo profundo, lo que se quedó sin analizar por la cuota suele ser lo menos crítico; `pendingCount` cuenta además los módulos que fallaron, llegaron cortados o se rechazaron, de cualquier nivel (`src/modules/cli/dispatch-modules.ts:159`).
- **Qué hacer:** espera a que tu cuota se renueve y corre otra vez `forge614-atlas init` (sin `--force`): retoma la misma sesión y solo analiza los `pendingCount` módulos que faltan. Con `--force` empezaría de cero y reharía todos.
