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

La salida estándar de `init`, `update` y `uninstall` es siempre JSON con `schemaVersion: 1`; no se imprime texto orientado a humanos. `--engine` es opcional y se valida contra Engines. `--force` abre una sesión nueva y vuelve a incluir módulos ya reportados.

Los comandos distintos de `init` nunca abren Engram:

- `--version` (o `-v`) imprime el nombre del producto y la versión de `package.json`, por ejemplo `forge614-atlas 1.0.0`. El nombre es parte del contrato: igual que hacen los demás productos de Forge614 con su propio comando, el `update` de Atlas valida el comando instalado leyendo exactamente `forge614-atlas X.Y.Z`.
- `--help` (o `-h`) imprime una ayuda corta en inglés con `init [--engine <id>] [--force]`, `update`, `uninstall [--confirmed]`, `--version` y `--help`, y sale con 0.
- `update` baja el instalador que acompaña el último release de Atlas (`https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh`) a un archivo temporal privado, lo corre con `bash <instalador> --force` mostrando sus mensajes en la terminal, lee `<FORGE614_HOME>/atlas/bin/forge614-atlas --version` y responde `{ "schemaVersion": 1, "status": "updated", "updated": true|false, "previousVersion": "…", "installedVersion": "…" }`. El archivo temporal se borra siempre. No acepta argumentos.
- `uninstall [--from forge614-engram] [--confirmed]` quita Atlas del disco y nada más. Borra únicamente la carpeta `<FORGE614_HOME>/atlas/` (tras comprobar que es una carpeta real, no un enlace, en esa ruta exacta) y únicamente el bloque entre `# >>> forge614-atlas PATH >>>` y `# <<< forge614-atlas PATH <<<` en `~/.zshrc`, `~/.bash_profile` y `~/.bashrc`; el archivo de fish `~/.config/fish/conf.d/forge614-atlas.fish` se borra cuando el bloque es todo lo que contiene, y si no, solo se saca el bloque. Nunca toca Engram, Engines, Shell, Workers, las memorias guardadas ni otros archivos. `--from` solo acepta `forge614-engram`, que es como lo llama Engram cuando se desinstala a sí mismo (`uninstall --from forge614-engram --confirmed`, sin terminal, leyendo solo el código de salida). Con `--confirmed` no pregunta nada; sin él, en una terminal, pide escribir exactamente `REMOVE FORGE614-ATLAS`. El orden es: comprobar todo, quitar los bloques de PATH, imprimir el resultado y borrar la carpeta al final. Es idempotente: si no hay nada que quitar sale con 0 y `removed: false`. Si todo sale bien imprime `{ "schemaVersion": 1, "status": "uninstalled", "removed": true|false, "pathPublications": [<archivos cambiados>] }`.

## Flujo de `init`

1. Abre el almacén de Engram y habilita sesiones.
2. Ejecuta el binario real `<FORGE614_HOME>/engines/bin/forge614-engines` (en Windows usa `.exe`) con `detect` y, para cada agente instalado, `capabilities --agent <id>`. `<FORGE614_HOME>` es la variable de entorno `FORGE614_HOME` cuando está definida y `~/.forge614` si no; la misma carpeta se usa para encontrar Workers (`<FORGE614_HOME>/workers/bin/forge614-workers`).
3. Acepta solamente agentes instalados, con ejecutable y `supportsHeadlessExec: true`. Un `--engine` inválido no se acepta por confianza.
4. Crea o reanuda la sesión de Engram y calcula las señales del Plan 1. Al reanudar, excluye módulos que ya tienen reporte guardado.
5. Devuelve motor, sesión y módulos pendientes con su nivel `ligero`, `estandar` o `profundo`.

Internamente, esta es la lista de módulos que el Plan 4 (capítulo 09) consume para despachar el trabajo de verdad — desde el Plan 4, `init` ya no devuelve este plan por su cuenta y se detiene; lo alimenta directo al despacho y devuelve el resultado real (`"completed"` o `"paused"`, ver capítulo 09):

```json
{ "modules": [{ "name": "auth", "tier": "profundo" }] }
```

## Resultados y fallas (previas al despacho)

Estos resultados siguen cortando el flujo antes de que empiece cualquier despacho, sin cambios desde el Plan 3: `already-complete` indica que la sesión determinista ya se cerró. `engine-ambiguous` lista los candidatos y deja que Shell resuelva una elección ambigua. `engine-unavailable` indica que no hay candidato headless. `engine-invalid` devuelve el identificador solicitado y los candidatos reales.

Los errores operativos también son JSON: `ENGINES_UNREACHABLE` cubre un binario de Engines inaccesible o una respuesta fallida; `ANALYSIS_FAILED` cubre, entre otros casos, un directorio sin Git o sin commits. Esto evita un stack trace crudo, pero no cambia el comportamiento de `computeChurn`. `update` puede fallar con `UPDATE_FAILED` (descarga, instalador o versión instalada inválida). `uninstall` puede responder `INVALID_ARGUMENT` (un argumento desconocido, o `--from` con algo distinto de `forge614-engram`), `CONFIRMATION_REQUIRED` (sin `--confirmed` y sin terminal; no se borra nada), `UNINSTALL_CANCELLED` (salida 130: la frase escrita no coincidió; no se borra nada), `UNINSTALL_UNSAFE` (la carpeta, o la carpeta Forge614, no es una carpeta real; no se borra nada) y `PATH_REMOVE_FAILED` (un perfil de la terminal no se puede reescribir con seguridad; se comprueba antes de cambiar nada). `INVALID_FORGE614_HOME` se responde antes de abrir Engram (salida 1): la variable está definida pero vacía, es relativa o contiene un carácter nulo — la misma regla estricta que aplica Engram, para que un valor mal escrito nunca mande a Atlas a buscar en una carpeta inesperada. El Plan 4 agrega dos códigos de error más una vez que empieza el despacho (`WORKERS_UNREACHABLE`, `WORKERS_FATAL_ERROR`), y la comprobación de solo lectura agrega `READ_ONLY_UNSUPPORTED` y `WORKERS_OUTDATED`; los requisitos se verifican justo después de elegir el motor, antes de abrir cualquier sesión de Engram — ver capítulo 09.

## Límite resuelto

`discoverModules` antes sólo tomaba carpetas del primer nivel, así que una estructura `src/{auth,billing}` se interpretaba como un único módulo `src`, anulando los percentiles en ese patrón común. Esto se resolvió antes de arrancar el Plan 4: el descubrimiento de módulos ahora es recursivo y adaptable (una carpeta que solo contiene subcarpetas nunca es un módulo por sí misma; una carpeta con archivos sueltos y subcarpetas se divide en un módulo de archivos sueltos más uno por subcarpeta), y los nombres de módulo son rutas relativas (`src/auth`) en vez de solo el nombre de la carpeta.
