# Estado de Forge614 Atlas

> Lee este archivo primero, siempre, antes de tocar nada en este repo.
> Este archivo se actualiza cada vez que se cierra un plan. Si algo aquí
> contradice el contrato del ecosistema, el spec o un plan, manda el de
> mayor autoridad según el orden de "Fuentes de verdad" (ver abajo).

## Qué es Atlas

Atlas analiza un repositorio de código a fondo (línea por línea, módulo por
módulo) usando IA que ya corre en la máquina del usuario (Claude Code,
Codex) en modo headless/no interactivo, usando la suscripción del usuario
— nunca API keys de pago. El conocimiento generado se guarda en
forge614-engram (memoria personal local con SQLite FTS5 y sesiones
progresivas), para que cualquier asistente de IA, en cualquier ventana de
contexto nueva, pueda consultarlo después vía MCP sin releer todo el repo.

Atlas **no tiene TUI propia y no detecta motores de IA por su cuenta**
(ver `FORGE614_ECOSYSTEM_CONTRACT.md`): Shell es la única experiencia
visual del ecosistema, y Engines es el único detector de motores/asistentes
instalados. Atlas solo consume esos dos contratos.

## Fuentes de verdad (en este orden)

1. **`FORGE614_ECOSYSTEM_CONTRACT.md`** (raíz de este repo) — contrato de
   todo el ecosistema Forge614 (jerarquía de productos, quién tiene TUI,
   quién detecta motores, límites de instalación/desinstalación). Autoridad
   máxima; el mismo archivo, sin cambios, vive en la raíz de
   forge614-shell, forge614-engram y forge614-engines. Cualquier decisión
   de este documento que choque con él pierde.
2. **`docs/superpowers/specs/2026-09-18-atlas-orchestrator-design.md`** —
   el diseño completo aprobado de Atlas, 18 secciones. Autoridad máxima
   dentro del scope propio de Atlas (no puede contradecir el contrato del
   ecosistema).
3. **`docs/superpowers/plans/*.md`** — planes de implementación ya
   ejecutados o en curso, uno por cada plan de la tabla de abajo.
4. **Este archivo (`STATE.md`)** — resumen de continuidad y estado actual,
   para no depender de memoria de conversación ni de que alguien encuentre
   los archivos anteriores por su cuenta.

## Reglas de diseño ya decididas — no reabrir sin razón fuerte

- Los subagentes se lanzan como procesos de CLI (`claude -p`, futuro
  `codex`), **nunca** por API/SDK de pago. Atlas no decide esto por sí
  mismo: le pregunta a `forge614-engines` qué motores están disponibles y
  son seguros para correr sin pantalla (headless); Atlas no implementa un
  segundo detector de motores (regla del contrato del ecosistema).
- Razonamiento tope: siempre bajo o medio, **jamás** alto/xhigh/max en
  ningún motor — quemar cuota de más rompería el propósito de la
  herramienta.
- Modelo/razonamiento por nivel (tabla fija, editable por separado, no
  quemada en el código):
  - Ligero: Haiku 4.5 / `gpt-5.6-luna` — razonamiento bajo
  - Estándar: Sonnet 5 / `gpt-5.6-terra` — razonamiento medio
  - Profundo: Opus 5 / `gpt-5.6-sol` — razonamiento medio (nunca alto)
  - **Límite real confirmado en `forge614-engines` v1.5.0:** el flag
    `--reasoning-level` del comando `headless` solo lo soporta Codex
    (`-c model_reasoning_effort=<level>`). Con Claude Code, pedirlo
    lanza `REASONING_LEVEL_UNSUPPORTED` — ese motor solo permite elegir
    `--model`, el nivel de razonamiento queda en el default del modelo.
    **Resuelto en el diseño de `forge614-workers`** (repo separado, spec en
    `docs/superpowers/specs/2026-09-20-forge614-workers-design.md` de ese
    repo): es responsabilidad de Atlas consultar `forge614-engines
    capabilities`/`agents list` antes de armar una tarea, para nunca pedir
    `--reasoning-level` a un motor que no lo soporta. Workers solo falla la
    tarea si de todos modos se lo piden, nunca reintenta ni adivina.
- División del trabajo: por carpeta/módulo del propio proyecto, no por
  tamaño fijo.
- Niveles por percentil dentro del proyecto (no fijos): Ligero ~50%,
  Estándar ~35%, Profundo ~15%.
- Despacho de subagentes: secuencial, 1 a la vez (no en paralelo).
  Decisión tomada explícitamente para minimizar el consumo de tokens de
  las suscripciones de IA sobre la velocidad total del análisis. (Regla
  anterior de "máximo 3 en
  paralelo" descartada el 2026-09-20.)
- Selector de motor de IA: Atlas nunca dibuja este menú. Shell no es la
  puerta obligatoria para todo (el día a día — programar, usar Engram vía
  MCP desde cualquier asistente en cualquier terminal — no pasa por Shell
  para nada); Shell solo se levanta cuando hay una decisión **ambigua**
  que Atlas no puede resolver por sí solo (ej. hay 2+ motores instalados y
  ninguno fue indicado por flag). Si solo hay un motor disponible, o el
  usuario ya lo indicó explícito (`--engine claude`), Atlas corre de
  punta a punta sin tocar Shell. Nunca se guarda ni se recuerda la
  elección entre corridas.
- Si se agota la cuota de la suscripción a medio análisis: pausar, guardar
  de inmediato (no al final) lo ya avanzado, avisar, permitir
  `forge614-atlas resume` después.
- Atlas **no tiene base de datos propia de progreso** — la fuente de
  verdad es Engram (sesiones de memoria progresiva). Guardar cada reporte
  de módulo en cuanto termina, no al final de la corrida.
- Solo el orquestador (Atlas) guarda en Engram, nunca los mandaderos
  directamente — mismo costo en tokens, más consistencia.
- Integración con Engram, según el tipo de operación (no es una regla
  única — cada modo resuelve un problema distinto):
  - **Instalar o configurar Engram** (verificar que exista, correr su
    `curl | bash`, correr `forge614-engram setup`): como subproceso de
    CLI, igual que lo haría una persona. Es una conversación de una
    sola vez con el humano; reimplementarla importando `runSetup` con
    un `SetupIO` propio solo duplica esa lógica y la deja frágil ante
    cualquier cambio futuro en el wizard de Engram, sin ninguna
    ganancia real a cambio.
  - **Operación normal en tiempo de ejecución** (guardar reporte de
    módulo, iniciar/cerrar sesión progresiva): importando su SDK de
    TypeScript directo (ambos son Bun/TS), nunca como subproceso. Esto
    pasa decenas o cientos de veces por corrida sin humano de por medio
    — por terminal sería mucho más lento (arrancar Bun y abrir/cerrar
    SQLite en cada llamada), perdería el chequeo de tipos de TypeScript,
    y no permitiría mantener una sola conexión de base de datos viva
    durante toda la corrida. La detección de qué asistentes/motores de
    IA hay instalados **no es parte de este SDK** — es responsabilidad
    exclusiva de `forge614-engines` (contrato del ecosistema, sección 6
    y 11.4: Engram debe dejar de poseer esa lógica).
- Al terminar una corrida completa, Atlas debe mostrar un reporte final:
  motor/modelo usado por nivel, total de mandaderos por nivel, tokens
  consumidos, tiempo total, pausas/reanudaciones.
- Instalador: mismo patrón que forge614-engram (binario único compilado,
  autocontenido, sin Node/Bun en ejecución), **no** el patrón de
  forge614-shell (que necesita Node.js). `curl -fsSL .../install.sh | bash`
  instala Atlas y de paso instala/verifica Engram — pero Atlas **no
  registra el MCP por su cuenta**. Eso pasa por `forge614-engines`
  (detecta y arma el plan) con confirmación de Shell antes de aplicarlo
  (contrato del ecosistema, secciones 5 y 8: "installing a binary never
  silently configures AI integrations").

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
| 2 | Integración con Engram (SDK, sesiones progresivas — la detección de motores/asistentes YA NO es parte de este plan, se movió a `forge614-engines`) | ✅ Completo (parte de SDK/sesiones) — fusionado desde la rama `atlas/plan2-engram-sesiones` (dependencia del SDK, ciclo de vida de sesión, guardado de reporte por módulo, cierre de corrida); 🚫 Bloqueado (parte de detección de motores/asistentes) — no puede avanzar hasta que `forge614-engines` exista y publique su contrato (regla de orden obligatorio, contrato del ecosistema sección 11) | `docs/superpowers/plans/2026-09-19-atlas-engram-integration.md` |
| 3 | Núcleo del CLI (`init`/`resume`, clasificación de módulos) — el selector de motor ya no lo dibuja Atlas, lo presenta Shell | ✅ Completo, fusionado a main | `docs/superpowers/plans/2026-09-20-atlas-cli-core.md` |
| 4 | Despacho de subagentes (headless, concurrencia, cuota agotada, reporte final) | ⏳ Pendiente | *(sin escribir)* |
| 5 | Instalador (`curl \| bash`, encadena Engram, registra MCP) | ⏳ Pendiente | *(sin escribir)* |

### Dependencia: forge614-engines

Ya existe y está en **v1.5.0**. Es un proyecto separado, propio del
ecosistema Forge614 (ver `FORGE614_ECOSYSTEM_CONTRACT.md`), no parte de
los 5 planes de Atlas: detecta motores/asistentes de IA instalados
(ejecutable, configuración, capacidades), sin TUI propia y sin escribir
configuración por su cuenta. Shell y Atlas lo consumen. Comandos CLI
relevantes para Plan 4 / `forge614-workers`: `detect`, `capabilities
--agent <id>`, y `headless --agent <id> --executable <ruta> --prompt
<texto> [--timeout-ms] [--model <model-id>] [--reasoning-level
<low|medium|high>]` (los dos últimos flags agregados en v1.5.0,
aditivos — ver límite de Claude Code arriba, en la tabla de
modelo/razonamiento).

### Pendientes antes del Plan 4

Documentados con comentario en el código, dejados a propósito sin
implementar en el Plan 1:

- `computeChurn` (`src/modules/scoring/churn.ts`) truena si la carpeta no
  es un repo git o no tiene commits. **Resuelto del lado de Atlas por el
  Plan 3** (ronda final de revisión, Fix 2): `runInitCommand` ahora
  envuelve la fase de análisis (`buildRunPlan`, tanto en la rama normal
  como en `--force`) en un try/catch que produce un `InitOutcome` de
  error estructurado (`status: "error"`, `error.code: "ANALYSIS_FAILED"`)
  en vez de dejar escapar la excepción como un stack trace crudo. Sigue
  abierta, como pregunta de diseño separada y deliberadamente NO atendida
  por este fix, la decisión de si `computeChurn` mismo debería degradarse
  a cero en vez de lanzar — eso implicaría tocar `src/modules/scoring/`
  (Plan 1), fuera de alcance de este fix.
- `discoverModules` (`src/modules/scoring/discovery.ts`) solo miraba un
  nivel de profundidad; en un repo típico `src/{auth,billing}` colapsaba
  todo en un solo módulo. **Resuelto** (rama `atlas/fix-discover-modules-depth`):
  ahora cada carpeta se evalúa recursivamente — si solo contiene
  subcarpetas (sin código directo), se sigue bajando en vez de tratarla
  como un módulo único; si tiene código directo Y subcarpetas (carpeta
  mixta), los archivos sueltos forman su propio módulo y cada subcarpeta
  se evalúa aparte. El nombre de cada módulo pasa a ser su ruta relativa
  a la raíz analizada (ej. `src/auth`), no solo el nombre de la carpeta,
  para evitar choques entre carpetas del mismo nombre en ramas distintas.
  Ya no bloquea el Plan 4.

## Siguiente paso

La parte de integración con Engram del Plan 2 (SDK, ciclo de vida de
sesión, guardado de reporte por módulo, cierre de corrida) ya quedó
completa y fusionada (`atlas/plan2-engram-sesiones`). Lo único que sigue
bloqueado es la parte de detección de motores/asistentes, necesaria para el
selector de motor del CLI del Plan 3: hay que crear `forge614-engines`
primero (bloqueante, regla de orden obligatorio del contrato del
ecosistema, sección 11). Hasta que exista, el Plan 3 no puede completar su
lógica de selección de motor, aunque sí puede avanzar en todo lo demás que
no dependa de Engines.
