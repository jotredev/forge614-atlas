# 09. Despacho Real de Subagentes

> **Estado:** Plan 4/5 completado y fusionado en `main`.
> **Traducción hermana:** [09 (EN). Real Subagent Dispatch](../en/09-subagent-dispatch.md)

## Propósito

El Plan 3 construyó el mostrador del hospital — hace el triage de los pacientes (módulos) y arma la lista priorizada. El Plan 4 es el personal médico caminando de verdad por los pasillos: `forge614-atlas init` ahora despacha cada módulo pendiente a un motor de IA real, guarda cada hallazgo en Engram en cuanto llega, y produce un reporte de cierre real en vez de solo un plan.

El despacho ocurre a través de un nodo separado y dedicado del ecosistema Forge614: **`forge614-workers`**. Atlas nunca le habla directamente a un CLI como `claude` o `codex` — le entrega a `forge614-workers` un lote de tareas y lee de vuelta un flujo de eventos estructurados. `forge614-workers` nunca decide nada ni guarda nada; Atlas es el único que escribe en Engram, tal como ya se estableció en el Plan 2.

## Qué cambió en el contrato público

La salida de `init` ya no se detiene en `"ready"`. Ese estado desapareció. Dos resultados terminales nuevos lo reemplazan:

```json
{
  "schemaVersion": 1,
  "status": "completed",
  "engine": { "id": "claude-code", "executable": "/usr/local/bin/claude" },
  "session": { "sessionId": "atlas:…", "resumed": false },
  "report": {
    "repoName": "/ruta/al/repo/analizado",
    "tierBreakdown": { "deep": 1, "standard": 3, "light": 6 },
    "engineByTier": { "deep": "claude-code", "standard": "claude-code", "light": "claude-code" },
    "totalWorkersByTier": { "deep": 1, "standard": 3, "light": 6 },
    "tokensConsumed": 0,
    "totalTimeMs": 184320,
    "pauseCount": 0,
    "analyzedModuleNames": ["src/auth", "src/billing"],
    "skippedModuleNames": []
  }
}
```

```json
{
  "schemaVersion": 1,
  "status": "paused",
  "engine": { "id": "claude-code", "executable": "/usr/local/bin/claude" },
  "session": { "sessionId": "atlas:…", "resumed": true },
  "analyzedCount": 4,
  "pendingCount": 6
}
```

Dos códigos de error nuevos se suman a los ya existentes `ENGINES_UNREACHABLE`/`ANALYSIS_FAILED`: `WORKERS_UNREACHABLE` (el binario de `forge614-workers` no existe o no es ejecutable — se revisa antes de que arranque cualquier despacho) y `WORKERS_FATAL_ERROR` (todo el lote no pudo correr en absoluto — entrada mal formada, o un binario de `forge614-engines` inalcanzable desde la perspectiva de Workers).

`tokensConsumed` queda deliberadamente en `0` por ahora: `forge614-workers` nunca interpreta el contenido de la respuesta de un motor (ese límite se eligió a propósito, ver el spec de diseño de Workers), así que Atlas todavía no tiene un número real que reportar.

## Orden de despacho

Los módulos se agrupan y despachan en un orden fijo: **Profundo → Estándar → Ligero**. Si la cuota de la suscripción se agota a medias, lo que ya se alcanzó a analizar es lo más valioso (núcleo, autenticación, pagos) — lo que queda para el siguiente `init` es lo menos crítico.

## Resolución de modelo y nivel de razonamiento

Por cada módulo, Atlas consulta la tabla fija (modelo por nivel y motor):

| Nivel | Claude Code | Codex |
|---|---|---|
| Ligero | `claude-haiku-4-5-20251001` | `gpt-5.6-luna` |
| Estándar | `claude-sonnet-5` | `gpt-5.6-terra` |
| Profundo | `claude-opus-5` | `gpt-5.6-sol` |

Antes de incluir un nivel de razonamiento en una tarea, Atlas revisa el campo real `supportsReasoningLevel: boolean` de `capabilities --agent <id>` de `forge614-engines` (agregado en Engines v1.11.0). Hoy Claude Code reporta `false` y Codex reporta `true` — Atlas simplemente nunca le pide un nivel de razonamiento a Claude Code; nunca llega a tener la oportunidad de rechazarlo.

## Leer los archivos reales del proyecto: `readableDir`

`forge614-workers` corre cada tarea en una carpeta temporal aislada y vacía — nunca corre *desde* el proyecto real, así que no hay filtración accidental de configuración/memoria entre módulos ni entre proyectos distintos. Pero la IA de todos modos necesita leer el código real. Cada tarea que arma Atlas trae `readableDir` apuntando a la raíz del proyecto, que el comando `headless` de `forge614-engines` convierte en `--add-dir <ruta>` (Claude Code) o `--add-dir <ruta>` (Codex, con su sandbox por defecto `read-only` intacto).

Esto se verificó con pruebas reales y en vivo, no se asumió:

- **Claude Code:** confirmado que `--add-dir` da acceso de lectura a los archivos reales sin cargar nunca el `CLAUDE.md` propio de ese proyecto — solo carga el `CLAUDE.md` global del propio usuario, lo cual es esperado (es la identidad de la persona, no la del proyecto).
- **Codex:** confirmado que el mismo acceso de lectura funciona, y confirmada una limitación real y aceptada — Codex **sí** puede leer y dejarse influenciar por el `AGENTS.md` del proyecto analizado si decide explorar la carpeta por su cuenta (no existe un equivalente en Codex al `--allowedTools` de Claude Code, que restringe por herramienta). El riesgo es bajo: el sandbox de Codex se mantiene en `read-only`, así que nada se puede escribir ni dañar, solo el tono/contexto de ese análisis puntual podría verse influenciado.

El prompt de análisis siempre pide un resumen narrativo — nunca "el contenido crudo" — porque Claude Code puede rechazar un prompt que se vea como un patrón de exfiltración de datos (confirmado en vivo durante las pruebas de este mismo plan).

## Transmisión del lote en tiempo real

Atlas le manda a `forge614-workers` **un solo lote** por corrida de `init` — nunca una invocación por módulo — con la lista completa y ordenada de tareas por `stdin`. Luego lee los eventos NDJSON de `stdout` conforme llegan:

- `task_completed` → el reporte del módulo se guarda en Engram **de inmediato** (`recordModuleReport`), nunca se acumula hasta el final. Si la salida reportada quedó truncada (`stdoutTruncated: true`, es decir, llegó al límite de bytes), el módulo se trata como saltado en vez de guardado, para que el siguiente `init`/resume lo reintente en vez de quedarse para siempre con un análisis cortado.
- `task_failed` → el módulo se registra como saltado; el despacho continúa con el resto.
- `quota_exhausted` → el despacho se detiene de inmediato. La sesión de Engram queda **abierta a propósito** — ese estado abierto **es** la señal de "esta corrida quedó incompleta" para el siguiente `init`, que retoma automáticamente (el mismo mecanismo que ya construyó el Plan 2). Un contador de pausas, guardado también en Engram (`atlas:meta:pause-count`), se incrementa para que el `pauseCount` del reporte de cierre eventual refleje toda la vida del proyecto, no solo la corrida final.
- `fatal_error` → todo el lote no produjo nada utilizable; se mapea a `WORKERS_FATAL_ERROR`.
- `run_completed` → trae el tiempo agregado usado para `totalTimeMs`.

## Reporte final

Cuando ya se contabilizó cada módulo, Atlas llama al mismo `finalizeRun` que ya construyó el Plan 2, cerrando la sesión con los seis campos fijos del resumen de Engram. `pauseCount` se lee del contador acumulado, así que refleja cada pausa a lo largo de todos los ciclos de `init`/resume de ese proyecto — no solo la corrida final que lo terminó.
