# Estado de Forge614 Atlas

> Lee este archivo primero, siempre, antes de tocar nada en este repo.
> Este archivo se actualiza cada vez que se cierra un plan. Si algo aquí
> contradice el spec o un plan, el spec manda (ver abajo).

## Qué es Atlas

Atlas analiza un repositorio de código a fondo (línea por línea, módulo por
módulo) usando IA que ya corre en la máquina del usuario (Claude Code,
Codex) en modo headless/no interactivo, usando la suscripción del usuario
— nunca API keys de pago. El conocimiento generado se guarda en
forge614-engram (memoria personal local con SQLite FTS5 y sesiones
progresivas), para que cualquier asistente de IA, en cualquier ventana de
contexto nueva, pueda consultarlo después vía MCP sin releer todo el repo.

Es independiente de forge614-shell: no importa su código, aunque reutiliza
el mismo patrón de detección de motores y de menú interactivo (usando la
librería npm externa `@earendil-works/pi-tui`, no el paquete de shell).

## Fuentes de verdad (en este orden)

1. **`docs/superpowers/specs/2026-09-18-atlas-orchestrator-design.md`** —
   el diseño completo aprobado, 18 secciones. Autoridad máxima.
2. **`docs/superpowers/plans/*.md`** — planes de implementación ya
   ejecutados o en curso, uno por cada plan de la tabla de abajo.
3. **Este archivo (`STATE.md`)** — resumen de continuidad y estado actual,
   para no depender de memoria de conversación ni de que alguien encuentre
   los archivos anteriores por su cuenta.

## Reglas de diseño ya decididas — no reabrir sin razón fuerte

- Los subagentes se lanzan como procesos de CLI (`claude -p`, futuro
  `codex`), **nunca** por API/SDK de pago.
- Razonamiento tope: siempre bajo o medio, **jamás** alto/xhigh/max en
  ningún motor — quemar cuota de más rompería el propósito de la
  herramienta.
- Modelo/razonamiento por nivel (tabla fija, editable por separado, no
  quemada en el código):
  - Ligero: Haiku 4.5 / `gpt-5.6-luna` — razonamiento bajo
  - Estándar: Sonnet 5 / `gpt-5.6-terra` — razonamiento medio
  - Profundo: Opus 5 / `gpt-5.6-sol` — razonamiento medio (nunca alto)
- División del trabajo: por carpeta/módulo del propio proyecto, no por
  tamaño fijo.
- Niveles por percentil dentro del proyecto (no fijos): Ligero ~50%,
  Estándar ~35%, Profundo ~15%.
- Concurrencia de subagentes: máximo 3 a la vez, fijo, no configurable por
  el usuario.
- Selector de motor de IA: **siempre** pregunta con menú de flechas al
  iniciar (estilo Orca/Shell), nunca se guarda ni se recuerda la elección
  entre corridas.
- Si se agota la cuota de la suscripción a medio análisis: pausar, guardar
  de inmediato (no al final) lo ya avanzado, avisar, permitir
  `forge614-atlas resume` después.
- Atlas **no tiene base de datos propia de progreso** — la fuente de
  verdad es Engram (sesiones de memoria progresiva). Guardar cada reporte
  de módulo en cuanto termina, no al final de la corrida.
- Solo el orquestador (Atlas) guarda en Engram, nunca los mandaderos
  directamente — mismo costo en tokens, más consistencia.
- Integración con Engram: importando su SDK de TypeScript directo (ambos
  son Bun/TS), no llamando a su CLI como proceso aparte.
- Al terminar una corrida completa, Atlas debe mostrar un reporte final:
  motor/modelo usado por nivel, total de mandaderos por nivel, tokens
  consumidos, tiempo total, pausas/reanudaciones.
- Instalador: mismo patrón que forge614-engram (binario único compilado,
  autocontenido, sin Node/Bun en ejecución), **no** el patrón de
  forge614-shell (que necesita Node.js). `curl -fsSL .../install.sh | bash`
  instala Atlas, de paso instala/verifica Engram y registra su MCP.

## Cómo se trabaja este proyecto (metodología, seguir igual siempre)

1. Diseño nuevo o cambio grande → skill `superpowers:brainstorming`
   primero, preguntas una por una, sin tocar código hasta tener aprobación
   explícita.
2. Diseño aprobado → skill `superpowers:writing-plans`, plan por tareas
   chicas (TDD: prueba que falla → correrla → implementar → correrla en
   verde → commit), guardado en `docs/superpowers/plans/`.
3. Implementación → skill `superpowers:subagent-driven-development`: un
   subagente implementador por tarea + un subagente revisor por tarea
   (spec + calidad) + rondas de corrección si hay hallazgos
   Important/Critical + revisión final de toda la rama al terminar todas
   las tareas.
4. Cada plan se trabaja en su propia rama de git (nombre tipo
   `atlas/planN-tema`), nunca directo en `main`.
5. Al terminar cada tarea (con cambios y validaciones ya corridas), se
   genera un prompt de traspaso con qué se hizo, qué se logró y qué
   archivos se tocaron — para un agente de documentación aparte (repo +
   Notion) que ya sabe cómo documentar; el prompt no debe explicarle cómo
   documentar.
6. Al cerrar cada plan: skill `superpowers:finishing-a-development-branch`
   — pruebas en verde, luego publicar rama + PR + fusionar a main + borrar
   rama vía `gh` CLI (el usuario ya dio acceso completo a su GitHub por
   CLI para esto).
7. **Al cerrar cada plan, actualizar este archivo** (la tabla de estado y,
   si aplica, esta sección de reglas) antes de pasar al siguiente.

## Estado actual

| # | Plan | Estado | Archivo del plan |
|---|---|---|---|
| 1 | Motor de puntuación de complejidad (`src/modules/scoring/`: descubrimiento de módulos, complejidad ciclomática, fan-in, churn de git, cobertura de pruebas, puntaje compuesto, niveles por percentil) | ✅ Completo, fusionado a main en [PR #1](https://github.com/jotredev/forge614-atlas/pull/1) | `docs/superpowers/plans/2026-09-18-atlas-complexity-scoring.md` |
| 2 | Integración con Engram (SDK, sesiones progresivas, reutilizar detección de asistentes de Engram — requiere agregar una exportación al SDK de forge614-engram, que hoy no la expone) | ⏳ Siguiente — falta el brainstorming de diseño | *(sin escribir todavía)* |
| 3 | Núcleo del CLI (`init`/`resume`, selector de motor, clasificación de módulos) | ⏳ Pendiente | *(sin escribir)* |
| 4 | Despacho de subagentes (headless, concurrencia, cuota agotada, reporte final) | ⏳ Pendiente | *(sin escribir)* |
| 5 | Instalador (`curl \| bash`, encadena Engram, registra MCP) | ⏳ Pendiente | *(sin escribir)* |

### Pendientes que el Plan 3 debe resolver

Documentados con comentario en el código, dejados a propósito sin
implementar en el Plan 1:

- `computeChurn` (`src/modules/scoring/churn.ts`) truena si la carpeta no
  es un repo git o no tiene commits — decidir si debe degradarse en vez de
  interrumpir.
- `discoverModules` (`src/modules/scoring/discovery.ts`) solo mira un
  nivel de profundidad; en un repo típico `src/{auth,billing}` hoy
  colapsa todo en un solo módulo — resolver cómo elegir bien la raíz de
  análisis.

## Siguiente paso

Arrancar el brainstorming del Plan 2 (integración con Engram) con
`superpowers:brainstorming`, empezando por revisar el SDK real de
forge614-engram (`src/index.ts` en ese repo) para confirmar qué falta
exportar.
