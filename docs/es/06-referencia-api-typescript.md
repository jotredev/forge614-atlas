# 06. Referencia de API Pública en TypeScript

> **Documento Oficial de Referencia Técnica — Ecosistema Forge614**  
> **Proyecto:** Forge614 Atlas (Orquestador de Contextualización Profunda)  
> **Punto de Entrada:** `src/index.ts` (`"exports": "./src/index.ts"` en `package.json`)  
> **Compatibilidad:** Bun >= 1.3.9 | TypeScript 5.9.3 en modo estricto\
> **Traducción hermana:** [06 (EN). TypeScript Public API Reference](../en/06-typescript-api-reference.md)

---

## 1. Declaración de Tipos e Interfaces

`src/index.ts` exporta 18 tipos. Cada uno se muestra con su definición tal como está en el código (con sus comentarios, que en el código están en español) y el archivo y la línea donde está definido. `MemoryStore`, `Session` y `SessionSaveResult`, que aparecen en las firmas, son tipos de Engram (`forge614-engram`), no de Atlas.

### `ModuleDescriptor`
Un módulo descubierto en disco con sus archivos de código. Definido en `src/modules/scoring/discovery.ts:33`.

```typescript
/**
 * Descriptor canónico de un módulo descubierto en disco.
 */
export interface ModuleDescriptor {
  /** Nombre del módulo: su ruta relativa a la raíz escaneada, con `/` (por ejemplo `auth` o `src/auth`) */
  name: string;
  /** Ruta absoluta en el sistema de archivos hacia la carpeta del módulo */
  path: string;
  /** Lista exhaustiva y ordenada alfabéticamente de archivos fuente TypeScript/JavaScript */
  files: string[];
}
```

### `ModuleSignals`
Las cuatro mediciones en bruto de un módulo, antes de normalizarlas. Definido en `src/modules/scoring/composite-score.ts:13`.

```typescript
/**
 * Señales cuantitativas sin procesar recopiladas para un módulo determinado.
 */
export interface ModuleSignals {
  /** Nombre identificador del módulo */
  name: string;
  /** Suma acumulada de complejidad ciclomática de código productivo */
  cyclomatic: number;
  /** Cantidad de otros módulos que dependen de este (cuántas flechas de dependencia le llegan) */
  fanIn: number;
  /** Total de cambios de archivos de este módulo en el historial de Git */
  churn: number;
  /** Parte de los archivos fuente del módulo que no tiene archivo de pruebas al lado, de 0.0 (todos lo tienen) a 1.0 (ninguno) */
  testGap: number;
}
```

### `ModuleScore`
La puntuación compuesta de un módulo. Definido en `src/modules/scoring/composite-score.ts:29`.

```typescript
/**
 * Puntuación de complejidad compuesta final calculada para un módulo.
 */
export interface ModuleScore {
  /** Nombre del módulo */
  name: string;
  /** Puntuación escalar no negativa resultante de la normalización y ponderación */
  score: number;
}
```

### `Tier`
El nivel de análisis de un módulo. Definido en `src/modules/scoring/tiers.ts:17`.

```typescript
/**
 * Nivel de análisis que Atlas asigna a un módulo: `"profundo"` (los de mayor puntuación), `"estandar"` (los intermedios) y
 * `"ligero"` (el resto).
 * Cada nivel usa un modelo distinto de Workers en `resolveTaskConfig`, define el orden de despacho (primero `profundo`) y
 * se cuenta por separado en el informe final; no cambia el texto del análisis que se le pide al modelo.
 */
export type Tier = "ligero" | "estandar" | "profundo";
```

### `TieredModule`
Un módulo con su puntuación y su nivel. Definido en `src/modules/scoring/tiers.ts:22`.

```typescript
/**
 * Módulo evaluado con su puntuación compuesta y el nivel de análisis asignado.
 */
export interface TieredModule extends ModuleScore {
  /** Nivel de análisis asignado según el lugar del módulo en la lista ordenada por puntuación. */
  tier: Tier;
}
```

### `RunState`
Si la sesión de Atlas de un repositorio está abierta o ya terminó. Definido en `src/modules/memory/run-state.ts:10`.

```typescript
/** Distingue una sesión abierta, incluida su referencia, de una corrida que ya había terminado. */
export type RunState =
  | { status: "active"; session: Session }
  | { status: "already-complete" };
```

### `FinalReport`
Los conteos y nombres con que se cierra una corrida terminada; también es el campo `report` de la respuesta `completed` de `init`. Definido en `src/modules/memory/finalize-run.ts:8`.

```typescript
/** Datos de módulos, niveles, consumo y pausas necesarios para el resumen final de Atlas. */
export interface FinalReport {
  /** Nombre o ruta del proyecto (`dispatchModules` manda la ruta de la carpeta); aparece en el objetivo (`goal`) del resumen. */
  repoName: string;
  /** Número de módulos analizados con éxito en esta corrida en cada nivel de análisis (los saltados no se cuentan, ni los que ya tenían informe de una corrida anterior). */
  tierBreakdown: { deep: number; standard: number; light: number };
  /** Nombre del motor elegido para cada nivel. */
  engineByTier: Record<"deep" | "standard" | "light", string>;
  /** Número de trabajadores (ayudantes de IA, uno por módulo) que terminaron su módulo en esta corrida en cada nivel. */
  totalWorkersByTier: Record<"deep" | "standard" | "light", number>;
  /** Total de tokens (las unidades de texto que procesa la IA) consumidos por los trabajadores; hoy `dispatchModules` manda 0 porque Workers no los cuenta. */
  tokensConsumed: number;
  /** Duración acumulada de la corrida en milisegundos. */
  totalTimeMs: number;
  /** Número de pausas por cuota registradas para el proyecto. */
  pauseCount: number;
  /** Nombres de los módulos cuyo informe se guardó en Engram en esta corrida. */
  analyzedModuleNames: string[];
  /** Nombres de módulos saltados o fallidos que quedan en los pasos siguientes. */
  skippedModuleNames: string[];
  /**
   * Subconjunto de `skippedModuleNames` cuyo reporte Engram rechazó con `SECRET_REJECTED` por parecer
   * un secreto. Campo aditivo: quien lee el resultado y no lo conoce puede ignorarlo.
   */
  rejectedReportModuleNames?: string[];
}
```

### `AgentDetection`
Un asistente de IA tal como lo informa Engines. Definido en `src/modules/engines-client/detect.ts:12`.

```typescript
/** Un agente tal como lo informa Forge614 Engines: si está instalado, dónde está su programa y su carpeta de configuración. */
export interface AgentDetection {
  /** Identificador del agente (por ejemplo `claude-code`). */
  id: string;
  /** Nombre para mostrar (por ejemplo `Claude Code`); Atlas no lo consulta hoy. */
  label: string;
  /** `true` si Engines dio el agente por instalado; `init` solo pide capacidades de los instalados y `resolveEngine` solo propone esos. */
  installed: boolean;
  /** Ruta del programa del agente; puede faltar, y `resolveEngine` descarta al agente que no la trae. */
  executable?: string;
  /** Carpeta de configuración del agente que Engines informa; Atlas no la consulta hoy. */
  configDir: string;
  /** Lo que Engines informa sobre si esa carpeta de configuración existe; Atlas no lo consulta hoy. */
  configFound: boolean;
}
```

### `Capabilities`
Lo que Engines declara que sabe hacer un asistente. Definido en `src/modules/engines-client/capabilities.ts:12`.

```typescript
/** Lo que Forge614 Engines declara que sabe hacer un agente. */
export interface Capabilities {
  /** Identificador del agente (por ejemplo `claude-code`) que Engines devuelve en su respuesta; `init` indexa por el `id` de la detección, no por este. */
  id: string;
  /** Nombre para mostrar del agente (por ejemplo `Claude Code`); Atlas no lo consulta hoy. */
  label: string;
  /** `true` si Engines declara que el agente admite MCP (el protocolo para darle herramientas externas); Atlas no lo consulta hoy. */
  supportsMcp: boolean;
  /** `true` si Engines declara que el agente admite hooks (comandos que se ejecutan en momentos fijos de su trabajo); Atlas no lo consulta hoy. */
  supportsHooks: boolean;
  /** `true` si el agente puede ejecutarse sin pantalla (headless: sin ventana ni persona delante); `resolveEngine` solo propone agentes con `true`. */
  supportsHeadlessExec: boolean;
  /** `true` si el agente acepta un nivel de razonamiento; `resolveTaskConfig` solo manda `reasoningLevel` a Workers cuando es `true`. */
  supportsReasoningLevel: boolean;
  /**
   * `true` solo si Engines garantiza ayudantes de solo lectura para este agente (Engines 1.17.0 o
   * posterior). Si Engines no trae el campo, se lee como `false`.
   * `checkDispatchRequirements` rechaza el inicio de `init` cuando no es `true`.
   */
  supportsReadOnly: boolean;
}
```

### `EngineResolution`
El resultado de elegir el motor de `init`. Definido en `src/modules/cli/resolve-engine.ts:9`.

```typescript
/** Resultado de resolver el motor: elegido, inexistente, ambiguo o distinto del identificador solicitado. */
export type EngineResolution =
  | { status: "resolved"; id: string; executable: string }
  | { status: "engine-ambiguous"; candidates: { id: string; executable: string }[] }
  | { status: "engine-unavailable" }
  | { status: "engine-invalid"; requestedId: string; candidates: { id: string; executable: string }[] };
```

### `RunPlanModule`
Un módulo del plan de corrida. Definido en `src/modules/cli/build-run-plan.ts:20`.

```typescript
/**
 * Un módulo incluido en el plan de corrida: qué analizar y con cuánta profundidad.
 */
export interface RunPlanModule {
  /** Nombre del módulo tal como lo entrega `discoverModules`: su ruta relativa a la raíz del proyecto (p. ej. `src/auth`). */
  name: string;
  /** Nivel de profundidad (`ligero`, `estandar` o `profundo`) que `assignTiers` le dio según su puntuación. */
  tier: Tier;
}
```

### `RunPlanResult`
El plan de corrida completo. Definido en `src/modules/cli/build-run-plan.ts:30`.

```typescript
/**
 * Resultado de `buildRunPlan`: los módulos por analizar y si la corrida es una continuación.
 */
export interface RunPlanResult {
  /** Módulos pendientes, ordenados de mayor a menor puntuación (el orden en que los entrega `assignTiers`). */
  modules: RunPlanModule[];
  /** `true` solo si se pidió saltar los ya guardados y al menos un módulo se omitió por tener su reporte guardado. */
  resumed: boolean;
}
```

### `RunInitOptions`
Las opciones de `runInitCommand`. Definido en `src/modules/cli/init.ts:18`.

```typescript
/** Opciones de `init`. */
export interface RunInitOptions {
  /** Carpeta del proyecto a contextualizar. */
  directory: string;
  /** Ruta del binario de Forge614 Engines. */
  enginesBinaryPath: string;
  /** Ruta del binario de Forge614 Workers. */
  workersBinaryPath: string;
  /** Motor pedido con `--engine`; si falta y hay varios, `init` responde `engine-ambiguous`. */
  requestedEngineId?: string;
  /** Si es `true`, rehace un análisis que ya estaba completo (`--force`). */
  force: boolean;
  /** Tope, en milisegundos, para `forge614-workers --version` al iniciar (por defecto 10 s); se baja en las pruebas. */
  workersVersionTimeoutMs?: number;
}
```

### `InitOutcome`
Todo lo que `init` puede responder; la tabla de sus estados y campos está en el [capítulo 13](13-archivos-de-datos.md) y el detalle en el [capítulo 08](08-nucleo-cli-y-plan-de-corrida.md). Definido en `src/modules/cli/init.ts:43`. `InitErrorCode` (`init.ts:34`) no lo exporta `src/index.ts`; se copia aquí porque `InitOutcome` la usa.

```typescript
/** Códigos de error que `init` puede devolver en su sobre de error. */
export type InitErrorCode =
  | "ENGINES_UNREACHABLE"
  | "ANALYSIS_FAILED"
  | "WORKERS_UNREACHABLE"
  | "WORKERS_FATAL_ERROR"
  | "READ_ONLY_UNSUPPORTED"
  | "WORKERS_OUTDATED";

/** Todo lo que `init` puede responder; cada variante lleva `schemaVersion: 1`. */
export type InitOutcome =
  | {
      schemaVersion: 1;
      status: "completed";
      engine: { id: string; executable: string };
      session: { sessionId: string; resumed: boolean };
      report: FinalReport;
    }
  | {
      schemaVersion: 1;
      status: "paused";
      engine: { id: string; executable: string };
      session: { sessionId: string; resumed: boolean };
      analyzedCount: number;
      pendingCount: number;
    }
  | { schemaVersion: 1; status: "already-complete" }
  | { schemaVersion: 1; status: "engine-ambiguous"; candidates: { id: string; executable: string }[] }
  | { schemaVersion: 1; status: "engine-unavailable" }
  | { schemaVersion: 1; status: "engine-invalid"; requestedId: string; candidates: { id: string; executable: string }[] }
  | {
      schemaVersion: 1;
      status: "error";
      error: { code: InitErrorCode; message: string };
    };
```

### `TaskModelConfig`
El modelo (y el nivel de razonamiento) que se manda a Workers para una tarea. Definido en `src/modules/cli/task-config.ts:13`.

```typescript
/** Configuración que se entrega a Workers para una tarea ya clasificada por nivel y motor. */
export interface TaskModelConfig {
  /** Nombre exacto del modelo que el motor debe ejecutar. */
  model: string;
  /** Intensidad de razonamiento que se manda solo cuando Engines declara que el motor la acepta. */
  reasoningLevel?: "low" | "medium";
}
```

### `DispatchResult`
Cómo terminó el despacho del lote. Definido en `src/modules/cli/dispatch-modules.ts:41`.

```typescript
/** Resultado de mandar el lote de módulos a Workers. */
export type DispatchResult =
  | { status: "completed"; report: FinalReport }
  | { status: "paused"; analyzedCount: number; pendingCount: number }
  | { status: "fatal_error"; message: string }
  // Segunda defensa: Workers se negó a correr tareas por falta de candado de solo lectura. No es un
  // módulo omitido: el análisis no se hizo y la sesión se deja abierta.
  | { status: "read_only_unsupported" };
```

### `WorkersTask`
Los datos de un módulo que Atlas entrega a Workers. Definido en `src/modules/workers-client/run-batch.ts:12`. `WorkersReasoningLevel` (`run-batch.ts:9`) no lo exporta `src/index.ts`; se copia aquí porque `WorkersTask` la usa.

```typescript
/** Niveles de razonamiento que Workers acepta; Engines (el programa que sabe qué admite cada agente) valida cuáles admite el agente elegido. */
export type WorkersReasoningLevel = "low" | "medium" | "high" | "xhigh" | "max";

/** Datos de un módulo que Atlas entrega a Workers para ejecutar un trabajador. */
export interface WorkersTask {
  /** Identificador de la tarea; Atlas usa el nombre del módulo para reconocer sus eventos. */
  id: string;
  /** Identificador del agente seleccionado para esta tarea. */
  agentId: string;
  /** Ruta del programa que inicia ese agente. */
  executable: string;
  /** Instrucción de análisis que recibe el agente. */
  prompt: string;
  /** Carpeta extra a la que se da acceso al agente (Workers la pasa a Engines como `--readable-dir`); por sí sola no limita al agente a solo lectura, para eso está `readOnly`. */
  readableDir?: string;
  /**
   * Si es `true`, Workers pide a Engines el candado de solo lectura y se niega a correr la tarea
   * (`READ_ONLY_UNSUPPORTED`) si Engines no lo garantiza. Atlas lo manda siempre en `true`.
   */
  readOnly?: boolean;
  /** Modelo elegido para el nivel del módulo, cuando se especifica. */
  model?: string;
  /** Nivel de razonamiento enviado solo cuando la configuración lo incluye. */
  reasoningLevel?: WorkersReasoningLevel;
  /** Límite de tiempo de la tarea en milisegundos; si se omite, Workers usa 10 minutos (600000). Atlas no lo manda. */
  timeoutMs?: number;
}
```

### `WorkersEvent`
Cada línea que Workers imprime mientras corre el lote. Definido en `src/modules/workers-client/run-batch.ts:42`.

```typescript
/**
 * Un evento que Workers imprime como una línea de NDJSON (un objeto JSON por línea) mientras corre el lote. `task_failed`
 * con `reason: "engine_unsupported"` y `stderr` (la salida de errores de la tarea) que empieza con `READ_ONLY_UNSUPPORTED` es la negativa a
 * correr una tarea sin candado de solo lectura. `fatal_error` puede aparecer antes de iniciar tareas por entrada inválida
 * o Engines ausente, o después de eventos de tarea si falla inesperadamente el control del lote.
 */
export type WorkersEvent =
  | { event: "task_started"; taskId: string; agentId: string; startedAt: string }
  | {
      event: "task_completed";
      taskId: string;
      exitCode: number;
      durationMs: number;
      stdout: string;
      stdoutBytes: number;
      stdoutTruncated: boolean;
      stderr: string;
      stderrBytes: number;
      stderrTruncated: boolean;
    }
  | {
      event: "task_failed";
      taskId: string;
      reason: "timeout" | "engine_unsupported" | "spawn_error" | "generic_error";
      exitCode: number | null;
      stdout: string;
      stdoutBytes: number;
      stdoutTruncated: boolean;
      stderr: string;
      stderrBytes: number;
      stderrTruncated: boolean;
    }
  | {
      event: "quota_exhausted";
      taskId: string;
      agentId: string;
      matchedPattern: string;
      stdout: string;
      stdoutBytes: number;
      stdoutTruncated: boolean;
      stderr: string;
      stderrBytes: number;
      stderrTruncated: boolean;
    }
  | {
      event: "run_completed";
      totalTasks: number;
      completed: number;
      failed: number;
      notStarted: number;
      pausedByQuota: boolean;
      totalDurationMs: number;
    }
  | { event: "fatal_error"; reason: "invalid_input" | "engines_bin_not_found" | "unexpected_error"; message: string };
```

---

## 2. Catálogo de Funciones Exportadas

`src/index.ts` exporta 30 funciones; este capítulo tiene una ficha por cada una, agrupadas por módulo (2.1 a 2.6 son las del motor de puntuación, `src/modules/scoring`; 2.7 a 2.10, las de sesiones, motores, Workers y despacho). Cada ficha da la firma tal como está en el código, qué hace, qué devuelve, cuándo lanza un error y quién la usa dentro de Atlas (archivo y línea). Todas las usa el código de Atlas, no solo sus pruebas.

### 2.1 Descubrimiento de Módulos

#### `discoverModules(root: string): ModuleDescriptor[]`
Recorre las carpetas de `root` y decide cuáles son módulos: una carpeta que solo tiene subcarpetas no es módulo y se baja a sus subcarpetas; una con archivos de código sueltos y subcarpetas (mixta) da un módulo con sus archivos sueltos más uno por subcarpeta; una sin subcarpetas es un módulo si tiene al menos un archivo de código. El nombre de cada módulo es su ruta relativa a `root` (`src/auth`). Se saltan `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `out`, `.forge614` y cualquier carpeta cuyo nombre empiece con punto; los archivos que están directamente en `root` no forman módulo. Definida en `src/modules/scoring/discovery.ts:79`.

```typescript
import { discoverModules } from "forge614-atlas";

const modules = discoverModules("/ruta/a/mi-proyecto");
console.log(`Módulos descubiertos: ${modules.length}`);
```

- **Devuelve:** la lista de `ModuleDescriptor` ordenada alfabéticamente por nombre. En cada uno, `files` son las rutas de los `*.ts`, `*.tsx`, `*.js` y `*.jsx` que están directamente en su carpeta (los archivos de prueba incluidos), ordenadas; son absolutas si `root` lo es.
- **Lanza:** el error del sistema de archivos (por ejemplo `ENOENT`) si `root` no existe o no se puede leer; no lo atrapa.
- **La usan:** `src/modules/cli/build-run-plan.ts:54` y `src/modules/cli/module-files.ts:16`.

#### `isTestFile(filePath: string): boolean`
Dice si una ruta es un archivo de prueba. Definida en `src/modules/scoring/discovery.ts:52`.

- **Devuelve:** `true` si el nombre termina en `.test` o `.spec` seguido de `ts`, `tsx`, `js` o `jsx` (`/\.(test|spec)\.[tj]sx?$/`). Solo mira el texto de la ruta: no comprueba que el archivo exista.
- **Lanza:** nunca.
- **La usan:** `src/modules/scoring/cyclomatic.ts:120`, `src/modules/scoring/fan-in.ts:156` y `src/modules/scoring/test-coverage-gap.ts:72`, para dejar los archivos de prueba fuera de sus cuentas.

---

### 2.2 Métricas de Complejidad

#### `fileCyclomaticComplexity(sourceText: string, fileName = "module.ts"): number`
Lee un texto de TypeScript con el analizador del compilador (su AST, el árbol de sintaxis abstracta: el código ya leído como árbol) y calcula la complejidad ciclomática de McCabe de todo el archivo (cuántos caminos distintos tiene el código): parte de 1 y suma uno por cada `if`, expresión `? :`, bucle (`while`, `do`, `for`, `for…in`, `for…of`), `catch`, `case` (no `default`), `&&`, `||` y `??`. Es una sola cuenta para el archivo entero, no una por función. `fileName` solo decide cómo se lee el texto (por ejemplo, `.tsx` admite JSX). Definida en `src/modules/scoring/cyclomatic.ts:43`.

- **Devuelve:** un entero de 1 o más.
- **Lanza:** nada propio: recibe el texto, no lee archivos.
- **La usa:** `src/modules/scoring/cyclomatic.ts:128`, desde `computeCyclomaticComplexity`.

#### `computeCyclomaticComplexity(modules: ModuleDescriptor[]): Map<string, number>`
Suma la complejidad ciclomática de los archivos de cada módulo, dejando fuera los de prueba (`isTestFile`). Definida en `src/modules/scoring/cyclomatic.ts:110`.

- **Devuelve:** un mapa con una entrada por módulo (nombre → suma); un módulo sin archivos productivos da 0.
- **Lanza:** el error del sistema de archivos (por ejemplo `ENOENT`) si no puede leer un archivo del módulo; no lo atrapa.
- **La usa:** `src/modules/cli/build-run-plan.ts:61`.

---

### 2.3 Centralidad y Dependencias

#### `computeFanIn(modules: ModuleDescriptor[]): Map<string, number>`
Lee los `import`, los `export … from` y los `require` relativos (los que empiezan con `.`) de los archivos productivos de cada módulo, los sigue hasta el archivo real en disco (probando, en este orden, la ruta tal cual —si es una carpeta, la carpeta misma cuenta—, la ruta con `.ts`, `.tsx`, `.js` y `.jsx`, y `index.ts`, `index.tsx` e `index.js` dentro de ella) y cuenta, para cada módulo, cuántos otros módulos distintos lo importan. Un módulo cuenta una sola vez aunque tenga muchos imports hacia el mismo destino, y las dependencias de un módulo consigo mismo no cuentan. Un import que no apunta a un archivo o carpeta existente se ignora (también uno escrito con `.js` cuando el archivo es `.ts`). Si varios módulos contienen el archivo importado (una carpeta mixta da `src` y `src/auth`), el import se atribuye al más específico, el de ruta más larga (`src/auth`). Definida en `src/modules/scoring/fan-in.ts:144`.

- **Devuelve:** un mapa con una entrada por módulo (nombre → cuántos otros módulos lo usan); empieza en 0.
- **Lanza:** el error del sistema de archivos (por ejemplo `ENOENT`) si no puede leer un archivo del módulo; no lo atrapa.
- **La usa:** `src/modules/cli/build-run-plan.ts:62`.

---

### 2.4 Volatilidad Histórica

#### `computeChurn(repoRoot: string, modules: ModuleDescriptor[]): Map<string, number>`
Ejecuta `git -c core.quotepath=false log --format= --name-only` en `repoRoot` y suma una unidad al módulo por cada archivo suyo que aparece en cada commit. Cuenta también archivos que ya no existen si su ruta quedó dentro de la carpeta del módulo; si varios módulos contienen el archivo (una carpeta mixta da `src` y `src/auth`), se cuenta en el más específico, el de ruta más larga (`src/auth`). Definida en `src/modules/scoring/churn.ts:46`.

> [!CAUTION]
> Lanza un error si `git log` falla en `repoRoot` (por ejemplo, si no es un repositorio de Git o si el repositorio no tiene commits). `repoRoot` debe ser la raíz del repositorio: `git log --name-only` imprime las rutas desde la raíz del repositorio, así que desde una subcarpeta no falla, pero las rutas no coinciden con las carpetas de los módulos y el churn queda en 0. `runInitCommand` convierte el error en el resultado JSON estructurado `ANALYSIS_FAILED`; `computeChurn` no degrada a cero por sí mismo.

- **Devuelve:** un mapa con una entrada por módulo (nombre → total de cambios de archivos); empieza en 0.
- **Lanza:** `Error` con el mensaje `git log failed in <repoRoot>: <salida de error de git>` si git termina con código distinto de 0 (sin repositorio o sin commits) o no se puede ejecutar.
- **La usa:** `src/modules/cli/build-run-plan.ts:63`.

---

### 2.5 Brecha de Pruebas

#### `computeTestCoverageGap(modules: ModuleDescriptor[]): Map<string, number>`
Para cada archivo productivo de un módulo, comprueba en disco si existe su archivo de prueba hermano (`x.test.ts` o `x.spec.ts` junto a `x.ts`, con la misma extensión) y calcula la parte que no lo tiene. Solo mira si el archivo existe; no mide cuánto código ejecutan esas pruebas. Definida en `src/modules/scoring/test-coverage-gap.ts:67`.

- **Devuelve:** un mapa con una entrada por módulo (nombre → número de 0.0, todos tienen prueba, a 1.0, ninguno); un módulo sin archivos productivos da 0.
- **Lanza:** nada propio.
- **La usa:** `src/modules/cli/build-run-plan.ts:64`.

---

### 2.6 Puntuación y Clasificación

#### `computeCompositeScores(signals: ModuleSignals[]): ModuleScore[]`
Lleva la ciclomática, el fan-in y el churn de cada módulo a la escala de 0 a 1 (normalización Min-Max: si todos los valores son iguales, da 0), los pondera con $0.35 / 0.35 / 0.30$ y multiplica el resultado por $(1 + 0.20 \cdot testGap)$. No ordena. Definida en `src/modules/scoring/composite-score.ts:67`.

- **Devuelve:** una puntuación por módulo, en el mismo orden que `signals`; con una lista vacía devuelve una lista vacía.
- **Lanza:** nunca.
- **La usa:** `src/modules/cli/build-run-plan.ts:76`.

#### `assignTiers(scores: ModuleScore[]): TieredModule[]`
Ordena los módulos de mayor a menor puntuación (con empate, por nombre) y reparte los niveles: `profundo` los primeros `max(1, redondeo(total × 0.15))`, `estandar` los siguientes `redondeo(total × 0.35)` y `ligero` el resto. Con 10 módulos son 2, 4 y 4; con 3, uno de cada nivel. No cambia la lista que recibe. Definida en `src/modules/scoring/tiers.ts:53`.

- **Devuelve:** una copia ordenada, cada módulo con su `tier`; con una lista vacía, una lista vacía.
- **Lanza:** nunca.
- **La usa:** `src/modules/cli/build-run-plan.ts:76`.

---

### 2.7 Sesiones y reportes en Engram (`src/modules/memory`)

Estas funciones usan un `MemoryStore` y una `Session` de Engram; `MemoryStore` y `Session` son tipos de Engram, no de Atlas.

#### `moduleTopicKey(moduleName: string): string`
Arma la clave de tema (el identificador estable de un informe dentro de un proyecto) bajo la que se guarda el reporte de un módulo. Definida en `src/modules/memory/module-topic.ts:10`.

- **Devuelve:** `atlas:module:<nombre>`, con el nombre sin modificar (incluida su ruta relativa si es un módulo anidado).
- **Lanza:** nunca.
- **La usan:** `src/modules/memory/module-report.ts:28` y `src/modules/memory/run-state.ts:43`.

#### `deriveSessionId(directory: string): string`
Calcula el identificador estable de la sesión de un repositorio. Parte de su carpeta común de Git (`git rev-parse --path-format=absolute --git-common-dir`, resuelta a su ruta real) o, si Git no la da, de la ruta real de `directory`; así el mismo repositorio da el mismo identificador desde la raíz, desde una subcarpeta o desde otro `worktree` (otra carpeta de trabajo del mismo repositorio). Definida en `src/modules/memory/session-id.ts:53`.

- **Devuelve:** `atlas:` y los primeros 16 caracteres hexadecimales del SHA-256 (un resumen estable) de esa ruta.
- **Lanza:** el error del sistema de archivos (por ejemplo `ENOENT`, la ruta no existe) si no puede resolver la ruta real.
- **La usan:** `src/modules/memory/run-state.ts:23` y `src/modules/memory/session-id.ts:67`.

#### `deriveForcedSessionId(directory: string): string`
Calcula el identificador de la corrida forzada (`--force`): el estable seguido de la hora. Una sesión cerrada no puede reabrirse con el mismo identificador, así que se genera uno distinto cada vez. Definida en `src/modules/memory/session-id.ts:66`.

- **Devuelve:** `atlas:<16 hexadecimales>:<milisegundos desde 1970>`.
- **Lanza:** lo mismo que `deriveSessionId`.
- **La usa:** `src/modules/cli/init.ts:199`.

#### `startOrResumeSession(store: MemoryStore, directory: string): RunState`
Abre la sesión de Atlas del repositorio con su identificador estable o retoma la que ya está abierta; es también donde Engram escribe `.forge614/project.json` (ver el [capítulo 13](13-archivos-de-datos.md)). Definida en `src/modules/memory/run-state.ts:22`.

- **Devuelve:** `{ status: "active", session }`, o `{ status: "already-complete" }` si Engram responde `SESSION_CONFLICT` (en la práctica, el identificador ya pertenece a una sesión cerrada).
- **Lanza:** los demás errores de Engram sin cambiarlos (por ejemplo `MIGRATION_REQUIRED`, si la base no admite sesiones, o `PROJECT_FILE_INVALID`, si el archivo `.forge614/project.json` existente no es válido) y el `ENOENT` de `deriveSessionId`.
- **La usa:** `src/modules/cli/init.ts:210`.

#### `isModuleReportSaved(store: MemoryStore, projectId: string, moduleName: string): boolean`
Consulta si ya existe un reporte guardado de ese módulo bajo su clave de tema. Definida en `src/modules/memory/run-state.ts:42`.

- **Devuelve:** `true` si Engram tiene una memoria con esa clave en el proyecto; `false` si no.
- **Lanza:** no captura los errores de Engram.
- **La usa:** `src/modules/cli/build-run-plan.ts:80`, para dejar fuera los módulos ya reportados.

#### `recordModuleReport(store: MemoryStore, directory: string, session: Session, moduleName: string, reportText: string): SessionSaveResult`
Guarda el texto del reporte de un módulo como una memoria de tipo `fact`, con la clave de tema del módulo y el título `Atlas: <módulo>`, ligada a la sesión. Si ya había una memoria con esa clave, pasa su versión actual para actualizarla en lugar de chocar (así una re-corrida con `--force` no falla). Definida en `src/modules/memory/module-report.ts:21`.

- **Devuelve:** el resultado del guardado de Engram, con la memoria creada o actualizada.
- **Lanza:** `SECRET_REJECTED` si Engram detecta algo que parece un secreto; `VERSION_CONFLICT` (la versión esperada de la memoria ya no es la vigente) si otra escritura cambió la versión entre la lectura y el guardado.
- **La usa:** `src/modules/cli/dispatch-modules.ts:118`.

#### `finalizeRun(store: MemoryStore, session: Session, report: FinalReport): void`
Guarda el resumen final de una corrida terminada en Engram y cierra la sesión. Solo debe llamarse cuando la corrida terminó del todo: una corrida pausada deja la sesión abierta a propósito y nunca la llama, porque una sesión cerrada no se puede reabrir con el mismo identificador. Definida en `src/modules/memory/finalize-run.ts:52`.

- **Devuelve:** nada (`void`).
- **Lanza:** `SUMMARY_TOPIC_CONFLICT` si el tema reservado del resumen ya pertenece a otro recuerdo; `SESSION_NOT_FOUND` si la sesión no existe para ese proyecto o `SESSION_KIND` si es una sesión manual (no se cierra así).
- **La usa:** `src/modules/cli/dispatch-modules.ts:198`.

#### `readPauseCount(store: MemoryStore, projectId: string | null): number`
Lee el contador de pausas por cuota del proyecto (la memoria con la clave `atlas:meta:pause-count`). Definida en `src/modules/memory/pause-count.ts:15`.

- **Devuelve:** el entero con que empieza el contenido guardado (de `12abc` toma 12); 0 si no hay memoria o no empieza con un entero.
- **Lanza:** no captura los errores de Engram.
- **La usa:** `src/modules/cli/dispatch-modules.ts:192`.

#### `recordPause(store: MemoryStore, directory: string, session: Session): number`
Suma una pausa al contador y lo guarda ligado a la sesión. Definida en `src/modules/memory/pause-count.ts:30`.

- **Devuelve:** el total nuevo después del guardado.
- **Lanza:** `VERSION_CONFLICT` si otro guardado cambió la versión leída; propaga los demás errores de Engram (por ejemplo `SESSION_CLOSED`, la sesión ya está cerrada).
- **La usa:** `src/modules/cli/dispatch-modules.ts:161`.

---

### 2.8 Cliente de Engines (`src/modules/engines-client`)

#### `detectAgents(binaryPath: string): AgentDetection[]`
Corre `<binario de Engines> detect` y lee el JSON que responde. Definida en `src/modules/engines-client/detect.ts:35`.

- **Devuelve:** la lista `agents` de la respuesta, tal cual (no se valida la forma de cada agente).
- **Lanza:** `Error` con el mensaje `forge614-engines detect failed: <detalle>` si Engines no arranca o sale con código distinto de 0 (el detalle es su salida de error, el mensaje de arranque o `exit code <n>`); y el `SyntaxError` de `JSON.parse` si la respuesta no es JSON válido. `init` lo responde como `ENGINES_UNREACHABLE`.
- **La usa:** `src/modules/cli/init.ts:167`.

#### `getCapabilities(binaryPath: string, agentId: string): Capabilities`
Corre `<binario de Engines> capabilities --agent <id>` y lee el JSON que responde. Definida en `src/modules/engines-client/capabilities.ts:42`.

- **Devuelve:** las capacidades del agente; `supportsReadOnly` solo es `true` si Engines lo informa como `true` (si falta, por ejemplo con un Engines anterior a 1.17.0, vale `false`).
- **Lanza:** `Error` con el mensaje `forge614-engines capabilities failed for <agentId>: <detalle>` si Engines no arranca o sale con código distinto de 0; y el `SyntaxError` de `JSON.parse` si la respuesta no es JSON válido.
- **La usa:** `src/modules/cli/init.ts:176`, para cada agente instalado.

#### `resolveEnginesBinaryPath(platform: NodeJS.Platform, forgeHome: string): string`
Arma la ruta del programa de Engines. Definida en `src/modules/engines-client/binary-path.ts:17`.

- **Devuelve:** `<forgeHome>/engines/bin/forge614-engines`, con `.exe` y las barras de Windows cuando `platform` es `win32` (el separador se elige por la plataforma pedida, no por la del sistema que corre el código).
- **Lanza:** nunca.
- **La usa:** `src/interfaces/cli/commands.ts:57`.

---

### 2.9 Cliente de Workers (`src/modules/workers-client`)

#### `resolveWorkersBinaryPath(platform: NodeJS.Platform, forgeHome: string): string`
Arma la ruta del programa de Workers. Definida en `src/modules/workers-client/binary-path.ts:13`.

- **Devuelve:** `<forgeHome>/workers/bin/forge614-workers`, con `.exe` y las barras de Windows cuando `platform` es `win32`.
- **Lanza:** nunca.
- **La usa:** `src/interfaces/cli/commands.ts:58`.

#### `runWorkersBatch(workersBinaryPath: string, enginesBin: string, tasks: WorkersTask[], onEvent: (event: WorkersEvent) => void): Promise<number>`
Lanza Workers, le escribe el lote (`{ enginesBin, tasks }`) por la entrada estándar y entrega cada evento que imprime (una línea de NDJSON, es decir, un objeto JSON por línea) a `onEvent`, en orden. Workers corre las tareas una tras otra, en el orden recibido. Si una línea no es JSON válido o `onEvent` lanza un error, mata a Workers y rechaza. Definida en `src/modules/workers-client/run-batch.ts:101`.

- **Devuelve:** una promesa con el código de salida de Workers: `0` si el lote terminó sin pausa por cuota (aunque alguna tarea haya fallado), `75` si se pausó por cuota, `2` por entrada inválida o Engines ausente y `1` por un fallo inesperado (también `1` si Workers terminó por una señal del sistema).
- **Lanza:** rechaza la promesa si no se puede lanzar Workers, si una línea no es JSON válido (`runWorkersBatch: failed to parse NDJSON line from forge614-workers: …`) o si `onEvent` lanza (`runWorkersBatch: onEvent handler threw while processing a "<evento>" event`, con el error original en `cause`).
- **La usa:** `src/modules/cli/dispatch-modules.ts:147`.

---

### 2.10 Núcleo del CLI y despacho (`src/modules/cli`)

#### `resolveEngine(agents: AgentDetection[], capabilitiesById: Map<string, Capabilities>, requestedId?: string): EngineResolution`
Elige el motor que `init` va a usar a partir de lo que Engines informa. Un candidato es un agente instalado, con ejecutable y con `supportsHeadlessExec: true`. Definida en `src/modules/cli/resolve-engine.ts:24`.

- **Devuelve:** `resolved` con `id` y `executable` si se pidió uno que es candidato, o si no se pidió ninguno y hay exactamente uno; `engine-invalid` (con `requestedId` y los candidatos, que pueden ser ninguno) si se pidió uno que no es candidato; `engine-ambiguous` (con los candidatos) si no se pidió ninguno y hay dos o más; `engine-unavailable` si no se pidió ninguno y no hay candidatos.
- **Lanza:** nunca.
- **La usa:** `src/modules/cli/init.ts:182`.

#### `buildRunPlan(store: MemoryStore, projectId: string, directory: string, options: { skipCompleted: boolean }): RunPlanResult`
Descubre los módulos del proyecto, los puntúa (las cuatro señales, la puntuación compuesta y los niveles) y, con `skipCompleted: true`, descarta los que ya tienen su reporte guardado. Definida en `src/modules/cli/build-run-plan.ts:48`.

- **Devuelve:** `{ modules, resumed }`: los módulos pendientes con su nivel, de mayor a menor puntuación, y si la corrida continúa una anterior. Si no se descubre ningún módulo devuelve `{ modules: [], resumed: false }` sin consultar la memoria.
- **Lanza:** ningún código propio: los errores de los pasos que invoca suben tal cual (por ejemplo, el `Error` de `computeChurn` si la carpeta no es un repositorio de Git o no tiene commits); `runInitCommand` los convierte en `ANALYSIS_FAILED`.
- **La usa:** `src/modules/cli/init.ts:203` (con `--force`, `skipCompleted: false`) y `:217` (`skipCompleted: true`).

#### `runInitCommand(store: MemoryStore, options: RunInitOptions): Promise<InitOutcome>`
Ejecuta todo el recorrido de `init`: detecta y elige el motor, comprueba los requisitos previos (que Engines garantice el candado de solo lectura y que el programa de Workers exista y sea de la versión 1.0.0 o posterior; todo antes de abrir ninguna sesión de Engram), abre o retoma la sesión, arma el plan y lo despacha a Workers. Definida en `src/modules/cli/init.ts:164`.

- **Devuelve:** una promesa con el `InitOutcome` que imprime el CLI (ver el [capítulo 13](13-archivos-de-datos.md)).
- **Lanza:** los fallos previstos no lanzan: salen como `{ status: "error" }` con su código. Sí dejan pasar los errores de Engram al abrir la sesión (por ejemplo `PROJECT_FILE_INVALID`) y el `ENOENT` de `deriveSessionId`; `src/interfaces/cli/main.ts:73` los convierte en `UNEXPECTED_ERROR`.
- **La usa:** `src/interfaces/cli/commands.ts:59`.

#### `resolveModuleFiles(directory: string, moduleNames: string[]): Map<string, string[]>`
Vuelve a descubrir los módulos de `directory` y devuelve los archivos de los que se piden. Definida en `src/modules/cli/module-files.ts:15`.

- **Devuelve:** un mapa nombre → rutas de archivos (absolutas si `directory` lo es), en el orden de `moduleNames`; un nombre que no se descubrió aparece con `[]`, para que el despacho cree igualmente una tarea por cada nombre.
- **Lanza:** el error del sistema de archivos de `discoverModules` si `directory` no se puede leer.
- **La usa:** `src/modules/cli/dispatch-modules.ts:81`.

#### `resolveTaskConfig(tier: Tier, engineId: string, capabilities: { supportsReasoningLevel: boolean }): TaskModelConfig`
Da el modelo y el nivel de razonamiento de una tarea según una tabla fija de Atlas (`MODEL_TABLE`, en `task-config.ts:20-33`; los nombres de la tabla son los valores literales del código y cambian cuando se cambia el código). Definida en `src/modules/cli/task-config.ts:43`.

| Nivel | `claude-code` | `codex` |
|---|---|---|
| `ligero` | `claude-haiku-4-5-20251001`, `low` | `gpt-5.6-luna`, `low` |
| `estandar` | `claude-sonnet-5`, `medium` | `gpt-5.6-terra`, `medium` |
| `profundo` | `claude-opus-5`, `medium` | `gpt-5.6-sol`, `medium` |

- **Devuelve:** la fila de la tabla; si `capabilities.supportsReasoningLevel` es `false`, solo el `model`, sin `reasoningLevel`.
- **Lanza:** `Error` con el mensaje `No hay configuración de modelo/razonamiento para el motor "<engineId>"` si el motor no está en la tabla (solo `claude-code` y `codex`).
- **La usa:** `src/modules/cli/dispatch-modules.ts:85`.

#### `buildAnalysisPrompt(moduleName: string, filePaths: string[]): string`
Arma el texto con que se le pide a un ayudante analizar un módulo: una explicación narrativa, sin copiar líneas del código, que empieza por los archivos listados. No lee archivos ni valida las rutas: solo arma el texto. Definida en `src/modules/cli/analysis-prompt.ts:16`.

- **Devuelve:** la consigna completa, en español, con las líneas unidas por saltos de línea; cada ruta sale como un elemento de lista (`- ruta`), y con una lista vacía la sección de archivos queda sin elementos.
- **Lanza:** nunca.
- **La usa:** `src/modules/cli/dispatch-modules.ts:90`.

#### `dispatchModules(store: MemoryStore, directory: string, session: Session, workersBinaryPath: string, enginesBinaryPath: string, engine: { id: string; executable: string }, capabilities: Capabilities, modules: { name: string; tier: Tier }[]): Promise<DispatchResult>`
Manda a Workers un lote con una tarea por módulo (siempre con `readOnly: true`, ordenadas por nivel: primero `profundo`, luego `estandar` y al final `ligero`) y guarda en Engram el reporte de cada una. Un módulo cuya respuesta llega cortada, que falla o cuyo reporte Engram rechaza por parecer un secreto (`SECRET_REJECTED`) se omite. Si se agota la cuota anota una pausa y deja la sesión abierta; si el lote termina, arma el reporte final y cierra la sesión. Definida en `src/modules/cli/dispatch-modules.ts:67`.

- **Devuelve:** una promesa con `completed` (y el `report`), `paused` (con `analyzedCount` y `pendingCount`), `fatal_error` (con el mensaje de Workers, `<motivo>: <detalle>`) o `read_only_unsupported` (Workers se negó a correr tareas sin el candado; la sesión no se cierra). La prioridad es: error fatal, falta del candado, cuota agotada.
- **Lanza:** ningún código propio: rechaza con el error del sistema de archivos de `resolveModuleFiles` (por ejemplo `ENOENT`) si `directory` no se puede leer; con el `Error` de `resolveTaskConfig` si el motor no está en su tabla; con el de `runWorkersBatch` si Workers no se puede lanzar, imprime una línea que no es JSON o si guardar un reporte falla con un error de Engram que no sea `SECRET_REJECTED` (llega envuelto, con el original en `cause`); y con el error de Engram, sin envolver, si fallan `recordPause`, `readPauseCount` o `finalizeRun`. `runInitCommand` lo convierte en `WORKERS_FATAL_ERROR`.
- **La usa:** `src/modules/cli/init.ts:109`.

---

## 3. Ejemplo de Integración de Extremo a Extremo

El siguiente script usa solo la parte de puntuación de la librería (no usa Engram, Engines ni Workers): descubre los módulos de un proyecto, calcula sus cuatro señales y asigna un nivel a cada uno. `repoPath` debe ser la raíz de un repositorio de Git con al menos un commit (si no, `computeChurn` lanza un error). La función no se ejecuta sola: hay que llamarla, por ejemplo `analyzeRepository("/ruta/a/mi-proyecto");`.

```typescript
import {
  discoverModules,
  computeCyclomaticComplexity,
  computeFanIn,
  computeChurn,
  computeTestCoverageGap,
  computeCompositeScores,
  assignTiers,
  type ModuleSignals,
} from "forge614-atlas";

function analyzeRepository(repoPath: string) {
  console.log(`[1/5] Descubriendo módulos en: ${repoPath}`);
  const modules = discoverModules(repoPath);

  if (modules.length === 0) {
    console.warn("No se encontraron módulos de código fuente.");
    return [];
  }

  console.log(`[2/5] Extrayendo señales estáticas del código...`);
  const cyclomaticMap = computeCyclomaticComplexity(modules);
  const fanInMap = computeFanIn(modules);
  const churnMap = computeChurn(repoPath, modules);
  const testGapMap = computeTestCoverageGap(modules);

  console.log(`[3/5] Consolidando señales por módulo...`);
  const signals: ModuleSignals[] = modules.map(m => ({
    name: m.name,
    cyclomatic: cyclomaticMap.get(m.name) ?? 0,
    fanIn: fanInMap.get(m.name) ?? 0,
    churn: churnMap.get(m.name) ?? 0,
    testGap: testGapMap.get(m.name) ?? 0,
  }));

  console.log(`[4/5] Calculando puntaje compuesto ponderado...`);
  const scores = computeCompositeScores(signals);

  console.log(`[5/5] Asignando niveles por percentiles...`);
  const tieredModules = assignTiers(scores);

  console.table(
    tieredModules.map(m => ({
      Módulo: m.name,
      Puntaje: m.score.toFixed(4),
      Nivel: m.tier.toUpperCase(),
    }))
  );

  return tieredModules;
}
```
