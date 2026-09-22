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
```

La salida estándar es siempre JSON con `schemaVersion: 1`; no se imprime texto orientado a humanos. `--engine` es opcional y se valida contra Engines. `--force` abre una sesión nueva y vuelve a incluir módulos ya reportados.

## Flujo de `init`

1. Abre el almacén de Engram y habilita sesiones.
2. Ejecuta el binario real `~/.forge614/engines/bin/forge614-engines` (en Windows usa `.exe`) con `detect` y, para cada agente instalado, `capabilities --agent <id>`.
3. Acepta solamente agentes instalados, con ejecutable y `supportsHeadlessExec: true`. Un `--engine` inválido no se acepta por confianza.
4. Crea o reanuda la sesión de Engram y calcula las señales del Plan 1. Al reanudar, excluye módulos que ya tienen reporte guardado.
5. Devuelve motor, sesión y módulos pendientes con su nivel `ligero`, `estandar` o `profundo`.

Internamente, esta es la lista de módulos que el Plan 4 (capítulo 09) consume para despachar el trabajo de verdad — desde el Plan 4, `init` ya no devuelve este plan por su cuenta y se detiene; lo alimenta directo al despacho y devuelve el resultado real (`"completed"` o `"paused"`, ver capítulo 09):

```json
{ "modules": [{ "name": "auth", "tier": "profundo" }] }
```

## Resultados y fallas (previas al despacho)

Estos resultados siguen cortando el flujo antes de que empiece cualquier despacho, sin cambios desde el Plan 3: `already-complete` indica que la sesión determinista ya se cerró. `engine-ambiguous` lista los candidatos y deja que Shell resuelva una elección ambigua. `engine-unavailable` indica que no hay candidato headless. `engine-invalid` devuelve el identificador solicitado y los candidatos reales.

Los errores operativos también son JSON: `ENGINES_UNREACHABLE` cubre un binario de Engines inaccesible o una respuesta fallida; `ANALYSIS_FAILED` cubre, entre otros casos, un directorio sin Git o sin commits. Esto evita un stack trace crudo, pero no cambia el comportamiento de `computeChurn`. El Plan 4 agrega dos códigos de error más una vez que empieza el despacho (`WORKERS_UNREACHABLE`, `WORKERS_FATAL_ERROR`) — ver capítulo 09.

## Límite resuelto

`discoverModules` antes sólo tomaba carpetas del primer nivel, así que una estructura `src/{auth,billing}` se interpretaba como un único módulo `src`, anulando los percentiles en ese patrón común. Esto se resolvió antes de arrancar el Plan 4: el descubrimiento de módulos ahora es recursivo y adaptable (una carpeta que solo contiene subcarpetas nunca es un módulo por sí misma; una carpeta con archivos sueltos y subcarpetas se divide en un módulo de archivos sueltos más uno por subcarpeta), y los nombres de módulo son rutas relativas (`src/auth`) en vez de solo el nombre de la carpeta.
