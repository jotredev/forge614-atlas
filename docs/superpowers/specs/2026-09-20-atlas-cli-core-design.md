# Plan 3: Núcleo del CLI de Atlas — Design

> **Alcance:** Solo `forge614-atlas init` — resolver motor (vía Engines),
> resolver estado de sesión (vía Engram, Plan 2), descubrir y clasificar
> módulos pendientes (Plan 1), y devolver un **plan de corrida** en JSON.
> **No dispara ningún subagente** — eso es 100% del Plan 4.
>
> **No autoridad sobre:** `FORGE614_ECOSYSTEM_CONTRACT.md` y
> `docs/superpowers/specs/2026-09-18-atlas-orchestrator-design.md`. Este
> documento no puede contradecirlos.

## 1. Principio rector: Atlas no interactúa con humanos, nunca

Confirmado explícitamente con el usuario: **toda** interacción humana pasa
por Shell — Atlas no tiene TUI, no dibuja preguntas, y **tampoco redacta
texto pensado para que lo lea una persona**, ni siquiera como mensaje de
respaldo. La única forma soportada de usar `forge614-atlas init` es que
**Shell lo invoque** ya con todas las decisiones humanas resueltas
(motor elegido, confirmación de re-análisis). Un desarrollador puede
correrlo a mano para probar, pero eso no es un flujo de usuario soportado.

Consecuencia de diseño: toda la salida de `init` es **dato estructurado
puro** (JSON con campos como `status`, `code`, ids) — cero prosa. Shell es
quien decide qué palabras mostrarle al humano a partir de esos campos.

## 2. Comando único: `forge614-atlas init [--engine <id>] [--force]`

No existe `resume` como comando aparte. `init` siempre resuelve internamente
si la corrida es nueva, se reanuda, o ya está completa — mismo
comportamiento sin importar cuántas veces se invoque sobre el mismo repo
(ya construido en el Plan 2: `startOrResumeSession`).

- `--engine <id>`: motor a usar (`claude-code` o `codex` por ahora). Shell
  lo pasa ya decidido tras preguntarle al humano, si hizo falta.
- `--force`: repite el análisis de un repo ya completado. Shell lo pasa
  solo después de que el humano confirmó que quiere repetirlo — Atlas
  nunca pregunta esto, solo lo ejecuta si el flag llega.
- Directorio objetivo: `process.cwd()`. No hay flag de directorio en esta
  versión (YAGNI — nada en el diseño actual necesita analizar un repo
  distinto al directorio de trabajo).

## 3. Resolución de motor — Engines es siempre la fuente de verdad

Incluso con `--engine` explícito, Atlas valida contra lo que Engines
realmente reporta — el flag nunca se confía a ciegas.

```text
1. Ejecutar el binario de forge614-engines en su ruta fija del ecosistema
   (~/.forge614/engines/bin/forge614-engines, o
   %USERPROFILE%\.forge614\engines\bin\forge614-engines.exe en Windows —
   NUNCA se busca en PATH, coincide con cómo Engines se instala:
   "no PATH/profile changes").
2. `detect` → lista de agentes con `installed: true/false`.
3. Para cada agente con `installed: true`, `capabilities --agent <id>` →
   ¿`supportsHeadlessExec`?
4. Candidatos = agentes instalados CON soporte headless.
5. Si se pasó --engine:
   - Si el id está en candidatos → resuelto, usar ese.
   - Si no → status "engine-invalid" (con la lista real de candidatos).
6. Si no se pasó --engine:
   - 1 candidato → resuelto automático.
   - 0 candidatos → status "engine-unavailable".
   - 2+ candidatos → status "engine-ambiguous" (con la lista de candidatos).
```

Si el binario de Engines no existe en la ruta esperada, o su salida no es
JSON válido → status "engines-unreachable" (esto SÍ es un fallo genuino,
no una decisión pendiente — Atlas no reintenta ni adivina).

**Orden importante:** la resolución de motor ocurre **antes** de tocar
Engram. Es de solo lectura (no crea nada), así que si falla, `init`
termina sin haber creado ninguna sesión en Engram — evita dejar sesiones
vacías abandonadas por una resolución de motor fallida.

## 4. Resolución de sesión (Engram, Plan 2)

```text
si --force:
  sessionId = deriveForcedSessionId(directorio)
  session = startProjectSession(store, directorio, sessionId)  // siempre nueva
  completados = {} (vacío — forzar significa re-analizar todo)
si no:
  runState = startOrResumeSession(store, directorio)
  si runState.status === "already-complete":
    devolver { status: "already-complete" } inmediatamente, sin clasificar módulos
  session = runState.session
  completados = para cada módulo descubierto, isModuleReportSaved(...)
```

**Nota sobre `session.resumed`:** el Plan 2 (`startOrResumeSession`)
deliberadamente no distingue "sesión recién creada" de "sesión reabierta"
— para su propósito no hace falta. Para el JSON de salida, `resumed` se
deriva de forma barata sin pedirle nada nuevo a Engram: `true` si al menos
un módulo descubierto ya estaba guardado (se excluyó de `modules`),
`false` si ninguno lo estaba. Caso borde aceptado: una sesión reabierta
que todavía no tiene ningún módulo guardado se reporta como `resumed:
false` — es inofensivo, no cambia en nada el comportamiento de Atlas ni
de Shell.

**Decisión deliberada:** el status `"already-complete"` NO incluye fecha
de finalización. Obtenerla requeriría otra capacidad nueva de Engram
(resolver `projectId` desde directorio sin pasar por `startProjectSession`,
que en este caso falla a propósito). No vale la pena para un campo que
Shell puede pedir aparte si de verdad lo necesita — YAGNI.

## 5. Clasificación de módulos (reutiliza el Plan 1 completo, sin cambios)

`discoverModules` → `computeCyclomaticComplexity` + `computeFanIn` +
`computeChurn` + `computeTestCoverageGap` → `computeCompositeScores` →
`assignTiers`.

**Detalle importante encontrado al diseñar en detalle:** `isModuleReportSaved`
filtra por `projectId` (identidad del repo), **no** por `sessionId` — un
reporte guardado en una sesión anterior (ya cerrada) sigue siendo visible
para cualquier sesión nueva del mismo repo. Esto es exactamente lo que
`init` normal necesita (ver un módulo ya guardado sin importar en qué
sesión se guardó), pero es **lo contrario** de lo que `--force` necesita:
forzar significa re-analizar TODO, ignorando lo ya guardado.

Por eso, el paso de filtrado es explícito y condicional:
- `init` normal (sin `--force`): sí filtra por `isModuleReportSaved`.
- `init --force`: NO filtra — todos los módulos descubiertos entran al
  plan, sin importar si ya tenían un reporte de una sesión anterior.

## 6. Forma exacta del plan de corrida (JSON)

Mismo patrón que ya usa `forge614-engines`
(`{schemaVersion, ...datos}` a stdout). `schemaVersion` empieza en `1`.

```typescript
type InitOutcome =
  | { schemaVersion: 1; status: "ready";
      engine: { id: string; executable: string };
      session: { sessionId: string; resumed: boolean };
      modules: { name: string; tier: "ligero" | "estandar" | "profundo" }[] }
  | { schemaVersion: 1; status: "already-complete" }
  | { schemaVersion: 1; status: "engine-ambiguous";
      candidates: { id: string; executable: string }[] }
  | { schemaVersion: 1; status: "engine-unavailable" }
  | { schemaVersion: 1; status: "engine-invalid"; requestedId: string;
      candidates: { id: string; executable: string }[] }
  | { schemaVersion: 1; error: { code: "ENGINES_UNREACHABLE"; message: string } }
```

Todos los `status` de arriba (incluido `already-complete` y los de motor)
salen con código de salida `0` — son resultados legítimos y esperados del
proceso de resolución, no fallos. Solo `error` (Engines inalcanzable, JSON
inválido) sale con código de salida `1`, siguiendo exactamente el mismo
patrón que ya usa `forge614-engines` (`errorCodeFor`/`printJson` con
`error`).

## 7. Estructura de archivos

- `src/modules/engines-client/binary-path.ts` — `resolveEnginesBinaryPath(platform, home): string`.
- `src/modules/engines-client/detect.ts` — `detectAgents(binaryPath): Promise<AgentDetection[]>` (spawnSync + parseo JSON del binario real).
- `src/modules/engines-client/capabilities.ts` — `getCapabilities(binaryPath, agentId): Promise<Capabilities>`.
- `src/modules/engines-client/types.ts` — `AgentDetection`, `Capabilities`.
- `src/modules/cli/resolve-engine.ts` — función **pura**: `resolveEngine(agents, capabilitiesById, requestedId?): EngineResolution`. No hace I/O — recibe los datos ya obtenidos, fácil de testear sin subprocesos.
- `src/modules/cli/build-run-plan.ts` — orquesta descubrimiento + puntuación + tiers + filtrado por Engram → lista de módulos pendientes con su tier.
- `src/modules/cli/init.ts` — `runInitCommand(options): Promise<InitOutcome>`, el orquestador de todo (motor → sesión → módulos).
- `src/modules/cli/types.ts` — `InitOutcome` y tipos relacionados.
- `src/interfaces/cli/commands.ts` — `runInit()` (llama a `runInitCommand` con `process.cwd()` y los flags parseados) + `printJson()`.
- `src/interfaces/cli/main.ts` — entrypoint (`#!/usr/bin/env bun`), parseo de argv, dispatch a `commands.ts`. Mismo patrón que `forge614-engines`/`forge614-engram`.
- `package.json`: agrega `"build": "bun build ./src/interfaces/cli/main.ts --compile --outfile dist/forge614-atlas"` (mismo patrón que Engines/Engram). La distribución real del binario compilado es trabajo del Plan 5 (Instalador) — este script solo lo hace posible.

## 8. Testing

- `resolve-engine.ts`: puro, tests con datos de fixture, sin subprocesos.
- `engines-client/*`: contra el **binario real** de `forge614-engines`
  instalado en esta máquina (`~/.forge614/engines/bin/forge614-engines`,
  confirmado presente y funcional) — sin mocks, mismo principio que el
  resto del proyecto. **Dependencia de entorno explícita:** estos tests
  requieren `forge614-engines` instalado; si no está, fallan con un error
  claro de "comando no encontrado", no silenciosamente.
- `build-run-plan.ts` y `init.ts`: Engram real en directorio temporal
  (mismo patrón que el Plan 2), combinado con módulos de prueba reales en
  disco (mismo patrón que el Plan 1).

## 9. Fuera de alcance de este documento

- Disparar o coordinar subagentes headless (Plan 4).
- El instalador que realmente coloca el binario compilado de Atlas en
  `~/.forge614/atlas/` (Plan 5).
- Cualquier flujo de Shell mismo (fuera de este repo).
- Un flag de directorio distinto a `process.cwd()` (YAGNI por ahora).
