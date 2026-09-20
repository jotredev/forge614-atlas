# 08. Núcleo del CLI y plan de corrida JSON

> **Estado:** Plan 3/5 completado y fusionado en `main` (`2b5272c`).  
> **Traducción hermana:** [08 (EN). CLI Core and JSON Run Plan](../en/08-cli-core-and-run-plan.md)

## Propósito

Atlas funciona aquí como el mostrador de un hospital: recibe un repositorio, confirma qué especialista puede atenderlo y prepara la lista priorizada de pacientes. No realiza el tratamiento. El comando `init` prepara un plan; el despacho de subagentes pertenece al Plan 4 y no existe todavía.

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

Ejemplo de resultado listo para Plan 4:

```json
{
  "schemaVersion": 1,
  "status": "ready",
  "engine": { "id": "claude-code", "executable": "/usr/local/bin/claude" },
  "session": { "sessionId": "atlas:…", "resumed": false },
  "modules": [{ "name": "auth", "tier": "profundo" }]
}
```

## Resultados y fallas

`already-complete` indica que la sesión determinista ya se cerró. `engine-ambiguous` lista los candidatos y deja que Shell resuelva una elección ambigua. `engine-unavailable` indica que no hay candidato headless. `engine-invalid` devuelve el identificador solicitado y los candidatos reales.

Los errores operativos también son JSON: `ENGINES_UNREACHABLE` cubre un binario de Engines inaccesible o una respuesta fallida; `ANALYSIS_FAILED` cubre, entre otros casos, un directorio sin Git o sin commits. Esto evita un stack trace crudo, pero no cambia el comportamiento de `computeChurn`.

## Límite bloqueante conocido

`discoverModules` sólo toma carpetas del primer nivel. Una estructura `src/{auth,billing}` se interpreta como un único módulo `src`; por ello los percentiles quedan anulados en ese patrón común. Debe resolverse antes del Plan 4, que consumirá este plan directamente.
