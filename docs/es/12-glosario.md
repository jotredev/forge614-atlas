# 12. Glosario

> **Estado:** vigente para la versión 1.1.1 (rama `work/1.1.1`, aún sin publicar).
> **Traducción hermana:** [12 (EN). Glossary](../en/12-glossary.md)

Términos propios de Atlas que aparecen en los manuales y en lo que imprime. Cada uno remite al capítulo que lo explica a fondo. Los errores y estados de la salida están en el [capítulo 11](11-resolucion-de-errores.md).

## Módulo

La unidad que Atlas puntúa y manda a analizar: una carpeta con archivos de código. Su nombre es la ruta relativa a la raíz del proyecto (`src/auth`), así dos carpetas con el mismo nombre en lugares distintos no se confunden. Se explica en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md) («Límite resuelto») y en el [capítulo 03](03-senales-metricas-y-formulas.md).

## Carpeta mixta

Una carpeta que tiene archivos de código sueltos y también subcarpetas. Atlas la parte: los archivos sueltos forman un módulo y cada subcarpeta se evalúa aparte; una carpeta que solo tiene subcarpetas nunca es un módulo por sí misma. Se explica en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md) («Límite resuelto»).

## Señal

Cada medida objetiva que Atlas saca de un módulo (de su código y, en el caso del churn, del historial de Git) para decidir cuánta atención merece: complejidad ciclomática, fan-in, churn y brecha de cobertura de pruebas. Dan el mismo resultado con el mismo código y el mismo historial. Se explica en el [capítulo 03](03-senales-metricas-y-formulas.md).

## Complejidad ciclomática

Cuántos caminos distintos puede seguir el código de un módulo (regla de McCabe): cada archivo empieza en 1 y suma uno por cada `if`, `? :`, ciclo, `catch`, `case` (no `default`), `&&`, `||` y `??`. Es la suma de sus archivos, sin contar los de pruebas, y pesa 35 % en la puntuación. Se explica en el [capítulo 03](03-senales-metricas-y-formulas.md), sección 2.2.

## Fan-in

Cuántos módulos distintos dependen de un módulo (lo importan). Un módulo del que dependen muchos es más delicado de cambiar; pesa 35 % en la puntuación. Se explica en el [capítulo 03](03-senales-metricas-y-formulas.md), sección 2.3.

## Churn

Cuántas veces cambiaron los archivos de un módulo en el historial de Git (una vez por cada commit en que aparece cada archivo). Por eso `init` necesita un repositorio con commits; pesa 30 % en la puntuación. Se explica en el [capítulo 03](03-senales-metricas-y-formulas.md), sección 2.4.

## Brecha de cobertura de pruebas

La parte de los archivos de un módulo que no tiene un archivo de prueba hermano (`x.test.ts` o `x.spec.ts` junto a `x.ts`): 0 si todos lo tienen, 1 si ninguno. No suma: multiplica la puntuación hasta un 20 % más. Se explica en el [capítulo 03](03-senales-metricas-y-formulas.md), secciones 2.5 y 4.

## Normalización Min-Max

Llevar cada señal a una escala de 0 a 1 (el módulo con el valor más bajo da 0 y el más alto da 1) para poder sumar señales que miden cosas distintas. Si todos los módulos tienen el mismo valor, da 0. Se explica en el [capítulo 03](03-senales-metricas-y-formulas.md), sección 3.

## Puntuación compuesta

El número que ordena los módulos: 0,35 × complejidad + 0,35 × fan-in + 0,30 × churn (ya normalizados), multiplicado por 1 + 0,20 × brecha de pruebas. Se explica en el [capítulo 03](03-senales-metricas-y-formulas.md), sección 4.

## Percentil

La posición de un módulo dentro de la lista ordenada por puntuación, en vez de un umbral fijo. Así el reparto en niveles se adapta a cada proyecto, sea grande o pequeño. Se explica en el [capítulo 04](04-clasificacion-niveles-y-percentiles.md).

## Nivel (tier)

La cantidad de análisis que recibe un módulo: `profundo` (cerca del 15 % de arriba, al menos uno), `estandar` (cerca del 35 % siguiente) y `ligero` (el resto). El nivel decide qué modelo de IA lo analiza y en qué orden se despacha; el reporte final usa los nombres en inglés `deep`, `standard` y `light`. Se explica en el [capítulo 04](04-clasificacion-niveles-y-percentiles.md) y en el [capítulo 09](09-despacho-de-subagentes.md).

## Plan de corrida

La lista de módulos pendientes con su nivel que arma `init` antes de despachar (`{ "modules": [{ "name": "auth", "tier": "profundo" }] }`; el resultado interno de `buildRunPlan` lleva además `resumed`, que dice si la corrida continúa una anterior). Al retomar una sesión deja fuera los módulos que ya tienen reporte. Se explica en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md).

## Motor (engine)

El asistente de IA de la persona que hace el análisis: hoy `claude-code` (Claude Code) o `codex` (Codex). Es candidato si Forge614 Engines lo ve instalado, con ejecutable y capaz de correr sin pantalla (headless); se elige con `init --engine <id>`. Se explica en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md) y en el [capítulo 09](09-despacho-de-subagentes.md).

## Ayudante de solo lectura

Cada análisis de un módulo corre como un ayudante (subagente: una ejecución aparte del motor) que puede leer el proyecto pero no escribir en él. Lo garantiza el candado `readOnly: true`, que Atlas pone siempre; si Engines o Workers no pueden cumplirlo, Atlas no empieza (`READ_ONLY_UNSUPPORTED`, `WORKERS_OUTDATED`). Se explica en el [capítulo 09](09-despacho-de-subagentes.md).

## Lote de Workers

El conjunto de tareas, una por módulo, que Atlas entrega de una vez a Forge614 Workers, el programa que las corre y devuelve un evento por cada resultado. Las tareas van ordenadas por nivel: primero `profundo`, luego `estandar` y al final `ligero`. Se explica en el [capítulo 09](09-despacho-de-subagentes.md).

## Reporte de módulo

El resumen que escribe el ayudante sobre un módulo; Atlas lo guarda en Engram en cuanto llega, con la clave de tema `atlas:module:<nombre del módulo>`. Se explica en el [capítulo 09](09-despacho-de-subagentes.md).

## Módulo omitido

Un módulo que el lote no dejó con reporte: su tarea falló, su respuesta llegó cortada o Engram rechazó guardarla. Aparece en `skippedModuleNames` del reporte final; si la corrida terminó, solo se vuelve a analizar con `init --force`. Se explica en el [capítulo 09](09-despacho-de-subagentes.md).

## Reporte rechazado

Un reporte de módulo que Engram se negó a guardar porque su texto parece un secreto (`SECRET_REJECTED`). El análisis sigue; el módulo cuenta como omitido y su nombre sale también en `rejectedReportModuleNames`. Se explica en el [capítulo 09](09-despacho-de-subagentes.md).

## Sesión de Atlas

El registro en Engram de una corrida de `init` sobre un proyecto. Mientras está abierta, el siguiente `init` la retoma; cuando se cierra con el reporte final, `init` responde `already-complete` hasta que se use `--force`, que abre una sesión nueva. Se explica en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md) y en el [capítulo 09](09-despacho-de-subagentes.md).

## Sesión pausada

Una sesión que quedó abierta porque se agotó la cuota de la suscripción de IA (`init` responde `paused`). Lo ya analizado queda guardado y un contador de pausas en Engram (`atlas:meta:pause-count`) suma uno; el siguiente `init` sigue donde se quedó. Se explica en el [capítulo 09](09-despacho-de-subagentes.md) y en el [capítulo 11](11-resolucion-de-errores.md).

## Engram

La memoria compartida de Forge614: guarda en la computadora de la persona las sesiones y los reportes de módulo de Atlas. Atlas lleva la librería de Engram dentro de su binario, por eso `init` abre su base antes de analizar. Se explica en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md) y en el [capítulo 09](09-despacho-de-subagentes.md).

## Engines

Forge614 Engines: el programa que le dice a Atlas qué asistentes de IA hay instalados (`detect`) y qué sabe hacer cada uno (`capabilities`), y que arma los comandos que Workers corre. Atlas lo busca en `<FORGE614_HOME>/engines/bin/forge614-engines`. Se explica en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md).

## Workers

Forge614 Workers: el programa que recibe el lote de tareas de Atlas, las corre una tras otra con el motor elegido y devuelve un evento por cada resultado. Atlas lo busca en `<FORGE614_HOME>/workers/bin/forge614-workers` y exige la versión 1.0.0 o posterior. Se explica en el [capítulo 09](09-despacho-de-subagentes.md).

## `FORGE614_HOME`

La variable de entorno que dice dónde viven los productos Forge614; si no está definida se usa `~/.forge614`. Atlas se instala en `<FORGE614_HOME>/atlas` y busca Engines en `<FORGE614_HOME>/engines/bin` y Workers en `<FORGE614_HOME>/workers/bin`; un valor vacío o relativo es el error `INVALID_FORGE614_HOME`. Se explica en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md) y en el [capítulo 10](10-instalador-y-release.md).

## Bloque de PATH

Las líneas que el instalador agrega al perfil de la terminal (`~/.zshrc`, `~/.bashrc`, `~/.bash_profile` o el archivo de fish) entre `# >>> forge614-atlas PATH >>>` y `# <<< forge614-atlas PATH <<<`, para que el comando `forge614-atlas` funcione en una terminal nueva. `uninstall` quita solo ese bloque. Se explica en el [capítulo 10](10-instalador-y-release.md) y en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md).

## Sobre de error

La forma fija de las respuestas de error de Atlas (`UNKNOWN_COMMAND` lleva `argv` en vez de `message`): `{ "schemaVersion": 1, "status": "error", "error": { "code": "…", "message": "…" } }`. El `code` es estable y es lo que un programa debe leer. Se explica en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md) y en el [capítulo 11](11-resolucion-de-errores.md).

## `schemaVersion`

El número de versión de la forma de las respuestas JSON de Atlas; hoy es 1. Sube solo cuando una respuesta cambia de forma incompatible. Se explica en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md).
