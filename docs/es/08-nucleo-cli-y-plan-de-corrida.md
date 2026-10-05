# 08. Núcleo del CLI y plan de corrida JSON

> **Estado:** Plan 3/5 completado y fusionado en `main` (`2b5272c`).  
> **Traducción hermana:** [08 (EN). CLI Core and JSON Run Plan](../en/08-cli-core-and-run-plan.md)

> **Actualización de alcance (Plan 4):** `init` ya no se detiene en el plan — lo despacha de verdad. El estado `"ready"` descrito abajo ya no existe; fue reemplazado por `"completed"` y `"paused"`. Consulta [09. Despacho Real de Subagentes](09-despacho-de-subagentes.md) para el contrato vigente. Este capítulo se conserva por las partes que siguen siendo ciertas: resolución de motor, armado de sesión/plan de módulos, y la forma de un `RunPlanModule`.

## Propósito

Atlas funciona aquí como el mostrador de un hospital: recibe un repositorio, confirma qué especialista puede atenderlo y prepara la lista priorizada de pacientes. El Plan 3 se detenía ahí — `init` solo preparaba un plan. El Plan 4 (capítulo 09) es lo que de verdad realiza el tratamiento.

## Comando público

```sh
bun run build
./dist/forge614-atlas init --engine claude-code
./dist/forge614-atlas init --force
./dist/forge614-atlas --version
./dist/forge614-atlas --help
./dist/forge614-atlas update
./dist/forge614-atlas uninstall --confirmed
```

La salida estándar de `init` y `uninstall` es siempre JSON con `schemaVersion: 1`; no se imprime texto orientado a humanos. `update` deja primero que el instalador imprima sus propios mensajes en la terminal y luego imprime su respuesta JSON. `--version` y `--help` imprimen texto simple. Las preguntas de `uninstall` salen por la salida de errores, así que nunca se mezclan con el JSON. `--engine` es opcional y se valida contra Engines. `--force` abre una sesión nueva y vuelve a incluir módulos ya reportados.

Los comandos distintos de `init` nunca abren Engram:

- `--version` (o `-v`, solo como primer argumento) imprime el nombre del producto y la versión de `package.json`, por ejemplo `forge614-atlas 1.1.0`. El nombre es parte del contrato: igual que hacen los demás productos de Forge614 con su propio comando, el `update` de Atlas valida el comando instalado leyendo exactamente `forge614-atlas X.Y.Z`.
- `--help` (o `-h`) se atiende en cualquier posición de los argumentos — `forge614-atlas init --help` y `forge614-atlas uninstall --help` también imprimen la ayuda — antes de que corra cualquier otra cosa, así que pedir ayuda nunca inicia un análisis, crea una sesión ni borra nada. Imprime una ayuda corta en inglés con `init [--engine <id>] [--force]`, `update`, `uninstall [--from forge614-engram] [--confirmed]`, `--version, -v`, `--help, -h` y la variable de entorno `FORGE614_HOME`, y sale con 0.
- `update` baja el instalador que acompaña el último release de Atlas (`https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh`) a un archivo temporal privado, lo corre con `bash <instalador> --force` mostrando sus mensajes en la terminal, lee `<FORGE614_HOME>/atlas/bin/forge614-atlas --version` y responde `{ "schemaVersion": 1, "status": "updated", "updated": true|false, "previousVersion": "…", "installedVersion": "…" }`. El archivo temporal se borra siempre. No acepta argumentos.
- `uninstall [--from forge614-engram] [--confirmed]` quita Atlas del disco y nada más. Borra únicamente la carpeta `<FORGE614_HOME>/atlas/` (tras comprobar que es una carpeta real, no un enlace, en esa ruta exacta) y únicamente el bloque entre `# >>> forge614-atlas PATH >>>` y `# <<< forge614-atlas PATH <<<` en `~/.zshrc`, `~/.bash_profile` y `~/.bashrc`; el archivo de fish `~/.config/fish/conf.d/forge614-atlas.fish` se borra cuando el bloque es todo lo que contiene, y si no, solo se saca el bloque. Nunca toca Engram, Engines, Shell, Workers, las memorias guardadas ni otros archivos. `--from` solo acepta `forge614-engram`, que es como lo llama Engram cuando se desinstala a sí mismo (`uninstall --from forge614-engram --confirmed`, sin terminal, leyendo solo el código de salida). Con `--confirmed` no pregunta nada; sin él, en una terminal, pide escribir exactamente `REMOVE FORGE614-ATLAS`. El orden es: comprobar todo, quitar los bloques de PATH, borrar la carpeta y solo entonces imprimir el resultado (el binario en ejecución puede borrarse a sí mismo en macOS y Linux), así que nunca se imprime `uninstalled` si el borrado falló. Si ya no hay nada que quitar y la confirmación está dada (`--confirmed`, o la frase escrita en una terminal), sale con 0 y `removed: false`; sin confirmación sigue pidiéndola (`CONFIRMATION_REQUIRED` si no hay terminal). Si todo sale bien imprime `{ "schemaVersion": 1, "status": "uninstalled", "removed": true|false, "pathPublications": [<archivos cambiados>] }`. `removed` solo dice si la carpeta de Atlas existía y se borró; los bloques de PATH se informan en `pathPublications`. Si borrar la carpeta falla, responde `UNINSTALL_FAILED` con salida 1 y el mensaje dice que los bloques de PATH ya se quitaron. Un binario instalado en otro lugar con `install.sh --bin-dir` no se quita.

## Flujo de `init`

1. Abre el almacén de Engram y habilita sesiones (todavía no se abre ninguna sesión).
2. Ejecuta el binario real `<FORGE614_HOME>/engines/bin/forge614-engines` (en Windows usa `.exe`) con `detect` y, para cada agente instalado, `capabilities --agent <id>`. `<FORGE614_HOME>` es la variable de entorno `FORGE614_HOME` cuando está definida y `~/.forge614` si no; la misma carpeta se usa para encontrar Workers (`<FORGE614_HOME>/workers/bin/forge614-workers`).
3. Acepta solamente agentes instalados, con ejecutable y `supportsHeadlessExec: true`. Un `--engine` inválido no se acepta por confianza.
4. Comprueba los requisitos de solo lectura, antes de abrir ninguna sesión: Engines debe informar `supportsReadOnly: true` para el motor elegido, el binario de Workers debe existir y `forge614-workers --version` debe imprimir `forge614-workers X.Y.Z` con X.Y.Z de 1.0.0 en adelante (detalle y códigos de error en el capítulo 09).
5. Crea o reanuda la sesión de Engram y calcula las señales del Plan 1. Al reanudar, excluye módulos que ya tienen reporte guardado.
6. Devuelve motor, sesión y módulos pendientes con su nivel `ligero`, `estandar` o `profundo`.

Internamente, esta es la lista de módulos que el Plan 4 (capítulo 09) consume para despachar el trabajo de verdad — desde el Plan 4, `init` ya no devuelve este plan por su cuenta y se detiene; lo alimenta directo al despacho y devuelve el resultado real (`"completed"` o `"paused"`, ver capítulo 09):

```json
{ "modules": [{ "name": "auth", "tier": "profundo" }] }
```

## El archivo `.forge614/project.json`

Cuando `init` abre una sesión, Engram (no Atlas) crea `.forge614/project.json` en la raíz del repositorio analizado si no existe. Es la identidad portátil del proyecto: su id y su nombre, más el grupo del ecosistema si pertenece a uno. Viaja con el repositorio, así que se pretende versionarlo; Atlas nunca lo lee y ignora la carpeta `.forge614` al puntuar módulos (`scoring/discovery.ts`). Si Engram no puede escribir el archivo, la corrida sigue sin él. Si el archivo existe pero no es válido, Engram lo rechaza sin modificarlo y `init` termina con `UNEXPECTED_ERROR` con el mensaje de Engram (el código propio de Engram para esto, `PROJECT_FILE_INVALID`, no forma parte del mensaje); hay que corregir o borrar el archivo. Si el archivo declara un proyecto distinto del que Engram tenía ligado a esa carpeta, gana el archivo: Engram liga la carpeta al proyecto que el archivo declara y deja el archivo como está.

## Resultados y fallas (previas al despacho)

Estos resultados siguen cortando el flujo antes de que empiece cualquier despacho, sin cambios desde el Plan 3: `already-complete` indica que la sesión determinista ya se cerró. `engine-ambiguous` lista los candidatos y deja que Shell resuelva una elección ambigua. `engine-unavailable` indica que no hay candidato headless. `engine-invalid` devuelve el identificador solicitado y los candidatos reales.

Los errores operativos también son JSON: `ENGINES_UNREACHABLE` cubre un binario de Engines inaccesible o una respuesta fallida; `ANALYSIS_FAILED` cubre, entre otros casos, un directorio sin Git o sin commits. Esto evita un stack trace crudo, pero no cambia el comportamiento de `computeChurn`. `update` puede fallar con `UPDATE_FAILED` (descarga, instalador o versión instalada inválida) e `INVALID_ARGUMENT` si recibe cualquier argumento. `uninstall` puede responder `INVALID_ARGUMENT` (un argumento desconocido, o `--from` con algo distinto de `forge614-engram`), `CONFIRMATION_REQUIRED` (sin `--confirmed` y sin terminal; no se borra nada), `UNINSTALL_CANCELLED` (salida 130: la frase escrita no coincidió; no se borra nada), `UNINSTALL_UNSAFE` (la carpeta, o la carpeta Forge614, no es una carpeta real; no se borra nada), `PATH_REMOVE_FAILED` (un perfil de la terminal es un enlace, no es un archivo normal, no se puede leer o tiene marcas desparejas — todo se comprueba antes de cambiar nada — o un perfil no se pudo reescribir, y entonces los perfiles anteriores de la lista ya quedaron limpios) y `UNINSTALL_FAILED` (la carpeta de Atlas no se pudo borrar; los bloques de PATH ya se habían quitado). `INVALID_FORGE614_HOME` lo responden `init`, `update` y `uninstall` apenas empiezan (salida 1; `init` no llega a abrir Engram y `uninstall` revisa antes sus argumentos, así que con un argumento inválido responde `INVALID_ARGUMENT`): la variable está definida pero vacía, es relativa o contiene un carácter nulo — la misma regla estricta que aplica Engram, para que un valor mal escrito nunca mande a Atlas a buscar en una carpeta inesperada. El Plan 4 agrega dos códigos de error más una vez que empieza el despacho (`WORKERS_UNREACHABLE`, `WORKERS_FATAL_ERROR`), y la comprobación de solo lectura agrega `READ_ONLY_UNSUPPORTED` y `WORKERS_OUTDATED`; los requisitos se verifican justo después de elegir el motor, antes de abrir cualquier sesión de Engram — ver capítulo 09.

## Límite resuelto

`discoverModules` antes sólo tomaba carpetas del primer nivel, así que una estructura `src/{auth,billing}` se interpretaba como un único módulo `src`, anulando los percentiles en ese patrón común. Esto se resolvió antes de arrancar el Plan 4: el descubrimiento de módulos ahora es recursivo y adaptable (una carpeta que solo contiene subcarpetas nunca es un módulo por sí misma; una carpeta con archivos sueltos y subcarpetas se divide en un módulo de archivos sueltos más uno por subcarpeta), y los nombres de módulo son rutas relativas (`src/auth`) en vez de solo el nombre de la carpeta.

## Comandos, respuestas y códigos de salida

| Comando | Éxito | Códigos de error (salida 1 salvo que se diga) |
|---|---|---|
| `init` | `completed`, `paused`, `already-complete`, `engine-ambiguous`, `engine-unavailable`, `engine-invalid` (salida 0) | `INVALID_FORGE614_HOME`, `ENGINES_UNREACHABLE`, `ANALYSIS_FAILED`, `READ_ONLY_UNSUPPORTED`, `WORKERS_UNREACHABLE`, `WORKERS_OUTDATED`, `WORKERS_FATAL_ERROR`, `UNEXPECTED_ERROR` |
| `update` | `status: "updated"` (salida 0) | `INVALID_FORGE614_HOME`, `INVALID_ARGUMENT`, `UPDATE_FAILED` |
| `uninstall` | `status: "uninstalled"` (salida 0) | `INVALID_FORGE614_HOME`, `INVALID_ARGUMENT`, `CONFIRMATION_REQUIRED`, `UNINSTALL_CANCELLED` (salida 130), `UNINSTALL_UNSAFE`, `PATH_REMOVE_FAILED`, `UNINSTALL_FAILED` |
| `--version`, `--help` (también `-v` y `-h`; la ayuda en cualquier posición) | texto (salida 0) | ninguno |
| cualquier otra cosa | ninguno | `UNKNOWN_COMMAND` |

`init` sale con 1 siempre que su respuesta lleva un `error`. `completed` lleva el campo opcional `rejectedReportModuleNames` (ver el capítulo 09). Todo error usa el mismo sobre, `{ "schemaVersion": 1, "status": "error", "error": { "code": "...", "message": "..." } }` (`UNKNOWN_COMMAND` lleva el `argv` recibido en vez de un `message`).
