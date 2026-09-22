# Plan 4 — Despacho real de subagentes (Atlas ↔ forge614-workers)

Status: Diseño en revisión. Complementa (no reemplaza) `2026-09-18-atlas-orchestrator-design.md` —
donde este documento y el spec original choquen, este documento gana en lo específico a la
integración con `forge614-workers` (que no existía cuando se escribió el spec original); todo lo
demás del spec original (percentiles, señales de puntuación, forma del reporte guardado, etc.)
sigue vigente sin cambios.

## 1. Qué resuelve este plan

Hasta el Plan 3, `forge614-atlas init` arma un plan de corrida (`RunPlanModule[]`, con `{name, tier}`)
pero nunca lo ejecuta — solo lo devuelve como JSON. Este plan extiende `init` para que **de verdad**
despache cada módulo a `forge614-workers`, guarde cada reporte en Engram en cuanto termina, maneje
la pausa por cuota agotada, y produzca el reporte final ya definido en `finalize-run.ts`.

No se agrega ningún comando nuevo — `init` sigue siendo el único comando (ya decidido en el Plan 3);
correrlo de nuevo sobre un proyecto con una sesión abierta ya retoma automáticamente lo que falta
(`startOrResumeSession` + `skipCompleted: true`, ya implementado).

## 2. Dependencia externa ya resuelta: `readableDir`

`forge614-engines` (headless) y `forge614-workers` (tareas) ya soportan un campo/bandera
`readableDir`/`--readable-dir`, verificado con pruebas reales contra ambos motores:

- **Claude Code:** `--add-dir <ruta>` antes de `-p`. Confirmado que no carga el `CLAUDE.md` del
  proyecto real analizado — solo el `CLAUDE.md` global del usuario.
- **Codex:** `--add-dir <ruta>`, con el sandbox por defecto de `codex exec` en `read-only` (nunca pasar
  `--sandbox workspace-write`/`danger-full-access`). **Limitación aceptada y documentada:** Codex sí
  puede leer y dejarse influenciar por el `AGENTS.md` del proyecto real si decide explorar la carpeta
  por su cuenta — no existe forma técnica de impedirlo (investigado a fondo, Codex no tiene equivalente
  a `--allowedTools`). Riesgo bajo: `read-only` impide cualquier escritura o daño real.
- **Hallazgo adicional de las pruebas reales:** Claude Code puede rechazar un prompt que se vea como
  "dame el contenido crudo sin contexto" por parecer un patrón de exfiltración de datos. El prompt de
  análisis (sección 5) debe pedir siempre un análisis narrativo genuino, nunca un volcado de contenido.

`readableDir` se manda en cada tarea apuntando a la **raíz del proyecto analizado** (no solo la
carpeta del módulo específico), para que la IA pueda seguir referencias a otros archivos si de verdad
lo necesita para entender dependencias — aunque el foco principal siga siendo los archivos exactos
del módulo, listados explícitamente en el prompt.

## 3. Una sola invocación por corrida

Atlas arma la lista completa de tareas (una por módulo pendiente) y llama a `forge614-workers` **una
sola vez** por corrida de `init`, no una vez por módulo. Razón: el gasto de tokens es idéntico en
ambos casos (una llamada a la IA por módulo de todos modos), pero una sola invocación evita
reimplementar en Atlas la lógica de "detener todo si se acaba la cuota" que Workers ya trae resuelta
internamente.

## 4. Orden de despacho

Los módulos se agrupan y despachan en este orden fijo: **Profundo → Estándar → Ligero**. Si la cuota
se agota a medias, lo que ya quedó cubierto es lo más valioso (núcleo, autenticación, pagos); lo que
falta para el siguiente `init`/resume es lo menos crítico.

## 5. El prompt de análisis

Plantilla fija (no configurable por el usuario en v1), instruyendo un análisis narrativo tipo
"cómo se lo explicaría un desarrollador senior a otro" (ya definido en el spec original, sección 15):
qué hace el módulo, decisiones y patrones clave, dependencias importantes. El prompt incluye:

- La lista exacta de rutas absolutas de los archivos del módulo (ya la tiene `ModuleDescriptor.files`
  del Plan 1 — hay que recuperarla de nuevo en este punto, ya que `RunPlanModule` la descarta a
  `{name, tier}`; ver sección 7).
- Instrucción explícita de leer esos archivos exactos primero; puede explorar el resto del proyecto
  (vía `readableDir`) solo si necesita entender una dependencia externa al módulo.
- Nunca pedir "el contenido tal cual" — siempre pedir el análisis/resumen narrativo (evita el rechazo
  por patrón de exfiltración ya confirmado con Claude Code).

## 6. Resolución de modelo/razonamiento por tarea

Por cada módulo, según su nivel (`tier`) y el motor ya resuelto (`engine.id`):

1. Buscar en la tabla fija de `STATE.md` (Ligero/Estándar/Profundo × Claude Code/Codex) el modelo
   correspondiente.
2. Antes de incluir `reasoningLevel` en la tarea, confirmar con `getCapabilities` (ya existe, Plan 3)
   el campo `supportsReasoningLevel: boolean` (agregado en `forge614-engines` v1.11.0, confirmado real:
   `false` para `claude-code`, `true` para `codex`). Si es `false`, la tarea se manda **sin**
   `reasoningLevel` — nunca se intenta y se deja que Workers falle la tarea; se evita desde antes de
   construirla.
3. `timeoutMs` se omite (Workers ya aplica un default razonable) — no hay necesidad identificada hoy
   de un valor distinto por tarea.

## 7. Recuperar la lista de archivos por módulo

`buildRunPlan` (Plan 3) descarta la lista de archivos de cada módulo al devolver solo
`{name, tier}`. Este plan necesita esa lista para construir el prompt (sección 5). Se resuelve
llamando de nuevo a `discoverModules(directory)` en el punto de despacho y cruzando por `name` contra
los módulos del plan — no se modifica `RunPlanModule` ni `buildRunPlan` (evita tocar el contrato ya
usado en otros lugares); es una segunda pasada barata (misma función determinista, sin llamadas a
IA ni a git).

## 8. Flujo de streaming con Workers

Atlas invoca `forge614-workers` como subproceso, escribe el JSON `{enginesBin, tasks}` por `stdin`, y
lee `stdout` línea por línea como NDJSON:

- `task_completed` → extrae el `taskId` (= nombre del módulo), toma el texto de `stdout` de ese
  evento como el reporte, y llama a `recordModuleReport` **de inmediato** (nunca se acumula para el
  final — ya es la regla del spec original, sección 12/13).
- `task_failed` → se registra el nombre del módulo como saltado/fallido (va a
  `skippedModuleNames` del reporte final); no detiene el resto de la corrida (Workers ya sigue solo).
- `quota_exhausted` → se marca la corrida como pausada. Atlas **no llama a `finalizeRun`** — deja la
  sesión abierta a propósito (esa es la señal de "quedó a medias", ya documentada en
  `finalize-run.ts`); el siguiente `init` la retoma automáticamente.
- `run_completed` → se usa para los conteos agregados del reporte final (totales por resultado).
- `fatal_error` → se mapea a un nuevo código de error estructurado (`WORKERS_FATAL_ERROR`), mismo
  patrón que `ENGINES_UNREACHABLE`/`ANALYSIS_FAILED` ya existentes en `InitOutcome`.

El código de salida del proceso de Workers (0/75/2) se usa solo como verificación de integridad
final, no como señal primaria — las decisiones se toman por los eventos NDJSON conforme llegan.

## 9. Conteo de pausas entre corridas (`pauseCount`)

Atlas no tiene base de datos propia. Para que `finalizeRun` reciba un `pauseCount` correcto que
abarque **todas** las pausas de la vida completa del proyecto (no solo la corrida actual), se guarda
un contador pequeño en Engram usando el mismo mecanismo ya existente de temas por clave (igual patrón
que los reportes de módulo, pero con un tema propio, ej. `atlas:meta:pause-count`): cada vez que la
corrida termina en `quota_exhausted`, se incrementa ese contador antes de salir; al llamar
`finalizeRun` en la corrida que por fin completa todo, se lee ese contador para el campo
`pauseCount`.

## 10. Nuevas salidas de `InitOutcome`

Las salidas ya existentes de rechazo temprano (`already-complete`, `engine-ambiguous`,
`engine-unavailable`, `engine-invalid`, `error` con `ENGINES_UNREACHABLE`/`ANALYSIS_FAILED`) no
cambian. `ready` deja de significar "aquí está el plan, corre tú" y pasa a significar "ya se
ejecutó" — se reemplaza por dos salidas nuevas:

- `status: "completed"` — corrida terminada por completo. Incluye `engine`, `session`, y el
  `FinalReport` ya definido en `finalize-run.ts` (tal cual, sin envolvente nueva).
- `status: "paused"` — se agotó la cuota a medias. Incluye `engine`, `session`, y conteos parciales
  (cuántos módulos se alcanzaron a analizar, cuántos faltan) para que quien consuma el JSON (Shell)
  pueda avisarle al usuario sin necesidad de volver a preguntarle nada a Engram.
- Nuevo código de error `WORKERS_UNREACHABLE` (el binario de `forge614-workers` no existe o falla al
  arrancar) y `WORKERS_FATAL_ERROR` (ver sección 8), mismo patrón que los códigos de error ya
  existentes.

## 11. Módulos nuevos de código

- `src/modules/workers-client/binary-path.ts` — resuelve la ruta del binario de `forge614-workers`,
  mismo patrón que `resolveEnginesBinaryPath` (Plan 3) para `forge614-engines`.
- `src/modules/workers-client/run-batch.ts` — invoca el subproceso, escribe `stdin`, expone los
  eventos NDJSON conforme llegan (streaming, no esperar a que termine todo para empezar a procesar).
- `src/modules/cli/dispatch-modules.ts` — arma las tareas (orden por tier, resolución de
  modelo/razonamiento, `readableDir`, prompt), consume `run-batch`, llama a `recordModuleReport`/
  `finalizeRun`/el contador de pausas, y devuelve el resultado que `runInitCommand` traduce a
  `InitOutcome`.
- `runInitCommand` (Plan 3, `src/modules/cli/init.ts`) se modifica para, en la rama que hoy devuelve
  `status: "ready"`, llamar a `dispatch-modules` y devolver `"completed"`/`"paused"` en su lugar.

## 12. Salida y comunicación humana

Sin cambios respecto a la regla ya fija: Atlas nunca imprime texto para humanos, solo JSON
estructurado por `stdout` (mismo patrón que `init` ya usa). Traducir esto a lenguaje humano es
trabajo de Shell, no de Atlas.

## 13. Pruebas

Igual que el resto del proyecto: tests reales, sin mocks, contra los binarios instalados de
`forge614-engines` y `forge614-workers` en esta máquina, y Engram real en un directorio temporal.
Casos a cubrir: orden de despacho por tier, guardado inmediato de cada reporte (no acumulado),
corrida pausada por cuota (sesión queda abierta, no se llama `finalizeRun`), resume subsecuente que
retoma solo lo pendiente, contador de pausas correcto tras múltiples pausas, y que nunca se construye
una tarea con `reasoningLevel` para un motor que no lo soporta.
