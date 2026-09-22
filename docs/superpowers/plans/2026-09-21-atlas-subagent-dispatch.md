# Plan 4: Despacho real de subagentes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extender `forge614-atlas init` para que, en vez de solo devolver el plan de módulos, lo
ejecute de verdad: despachar cada módulo a `forge614-workers`, guardar cada reporte en Engram en
cuanto termina, manejar la pausa por cuota agotada, y devolver el reporte final.

**Architecture:** Un cliente de `forge614-workers` (mismo patrón que `engines-client`: subproceso +
parseo de su contrato JSON, pero en modo streaming asíncrono en vez de `spawnSync`, porque Workers
puede tardar minutos y hay que reaccionar a cada evento conforme llega) + funciones puras de apoyo
(recuperar archivos por módulo, resolver modelo/razonamiento por tier respetando capacidades,
construir el prompt de análisis, contar pausas en Engram) + un orquestador (`dispatch-modules.ts`)
que junta todo + la modificación de `runInitCommand` para llamarlo en vez de devolver `"ready"`.

**Tech Stack:** Bun >= 1.3.8, TypeScript, `bun:test`, `node:child_process` (`spawn` asíncrono,
`readline` para consumir NDJSON línea por línea), `forge614-engram` (SDK ya integrado).

**Spec:** `docs/superpowers/specs/2026-09-21-atlas-subagent-dispatch-design.md`

## Global Constraints

- Bun >= 1.3.8, 100% TypeScript, mismo patrón de archivo colocado (`file.ts` + `file.test.ts`).
- Atlas nunca redacta texto para humanos — toda su salida es JSON estructurado puro.
- Los binarios de `forge614-engines` y `forge614-workers` viven en rutas fijas del ecosistema
  (`~/.forge614/engines/bin/forge614-engines` y `~/.forge614/workers/bin/forge614-workers`, con
  `.exe` en Windows) — nunca se buscan en `PATH`. Ambos ya están instalados en esta máquina de
  desarrollo en esas rutas (confirmado: Engines v1.11.0 con `supportsReasoningLevel` y
  `--readable-dir`; Workers v0.1.0).
- Una sola invocación de `forge614-workers` por corrida de `init`, con todas las tareas pendientes —
  nunca una invocación por módulo.
- Orden de despacho fijo: Profundo → Estándar → Ligero.
- Tabla fija de modelo/razonamiento por nivel y motor (valores reales, no inventar otros):
  | Nivel | Claude Code (`model`) | Codex (`model`) | `reasoningLevel` |
  |---|---|---|---|
  | Ligero | `claude-haiku-4-5-20251001` | `gpt-5.6-luna` | `low` |
  | Estándar | `claude-sonnet-5` | `gpt-5.6-terra` | `medium` |
  | Profundo | `claude-opus-5` | `gpt-5.6-sol` | `medium` |
  `reasoningLevel` solo se incluye en la tarea si `capabilities.supportsReasoningLevel` del motor
  resuelto es `true` (hoy: `false` para `claude-code`, `true` para `codex`).
- `readableDir` de cada tarea = la raíz del proyecto analizado (`directory`), no la carpeta del
  módulo específico.
- El prompt de análisis nunca pide "el contenido crudo" — siempre pide un análisis narrativo (Claude
  Code puede rechazar prompts que parezcan pedir un volcado de contenido, por parecer un patrón de
  exfiltración — ya confirmado con pruebas reales).
- Codex puede leer y dejarse influenciar por el `AGENTS.md` del proyecto real si explora la carpeta
  de `readableDir` por su cuenta — limitación aceptada y de bajo riesgo (su sandbox por defecto es
  `read-only`, no hay riesgo de escritura/daño). No intentar resolverlo en este plan.
- Tests reales, sin mocks, contra los binarios instalados de `forge614-engines` y
  `forge614-workers`, y Engram real en directorios temporales — mismo principio que los Planes 1-3.
  Los tests que necesitan un motor de IA "de verdad" ejecutándose usan un script fixture propio
  (nunca el CLI real de Claude/Codex, que cuesta cuota real) — el resto de la tubería (Engines
  resolviendo el comando, Workers ejecutando y detectando patrones) es 100% real.
- No se toca `forge614-engines`, `forge614-workers` ni `forge614-engram` en este plan — ya están
  listos y verificados.

---

### Task 1: Ruta del binario de Workers

**Files:**
- Create: `src/modules/workers-client/binary-path.ts`
- Test: `src/modules/workers-client/binary-path.test.ts`

**Interfaces:**
- Produces: `resolveWorkersBinaryPath(platform: NodeJS.Platform, home: string): string` — consumida
  por Task 2 y por la capa CLI (Task 8).

- [ ] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test } from "bun:test";
import { resolveWorkersBinaryPath } from "./binary-path";

describe("resolveWorkersBinaryPath", () => {
  test("resolves the stable launcher path on macOS/Linux (posix separators)", () => {
    expect(resolveWorkersBinaryPath("darwin", "/Users/jane")).toBe(
      "/Users/jane/.forge614/workers/bin/forge614-workers",
    );
    expect(resolveWorkersBinaryPath("linux", "/home/jane")).toBe(
      "/home/jane/.forge614/workers/bin/forge614-workers",
    );
  });

  test("adds the .exe suffix and uses backslash separators on Windows", () => {
    expect(resolveWorkersBinaryPath("win32", "C:\\Users\\jane")).toBe(
      "C:\\Users\\jane\\.forge614\\workers\\bin\\forge614-workers.exe",
    );
  });
});
```

- [ ] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/workers-client/binary-path.test.ts`
Expected: FAIL con "Cannot find module './binary-path'".

- [ ] **Step 3: Escribir la implementación**

Igual que `resolveEnginesBinaryPath` (`src/modules/engines-client/binary-path.ts`) — usar
`path.win32.join`/`path.posix.join` explícitos según `platform`, nunca el `join` genérico.

```typescript
import { win32, posix } from "node:path";

export function resolveWorkersBinaryPath(platform: NodeJS.Platform, home: string): string {
  const name = platform === "win32" ? "forge614-workers.exe" : "forge614-workers";
  const join = platform === "win32" ? win32.join : posix.join;
  return join(home, ".forge614", "workers", "bin", name);
}
```

- [ ] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/workers-client/binary-path.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/workers-client/binary-path.ts src/modules/workers-client/binary-path.test.ts
git commit -m "feat: resolve the fixed forge614-workers binary path per platform"
```

---

### Task 2: Cliente de streaming de Workers

**Files:**
- Create: `src/modules/workers-client/run-batch.ts`
- Test: `src/modules/workers-client/run-batch.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores directamente (usa la ruta del binario ya resuelta por quien lo
  llame — Task 1).
- Produces: `interface WorkersTask { id: string; agentId: string; executable: string; prompt:
  string; readableDir?: string; model?: string; reasoningLevel?: "low" | "medium" | "high";
  timeoutMs?: number }`, `type WorkersEvent` (unión discriminada con los 6 eventos reales del
  contrato de Workers: `task_started`, `task_completed`, `task_failed`, `quota_exhausted`,
  `run_completed`, `fatal_error` — ver forma exacta abajo), y
  `runWorkersBatch(workersBinaryPath: string, enginesBin: string, tasks: WorkersTask[], onEvent:
  (event: WorkersEvent) => void): Promise<number>` (devuelve el exit code del proceso) — consumida
  por Task 7 (`dispatch-modules.ts`).

- [ ] **Step 1: Escribir la prueba que falla**

Este test necesita un ejecutable "de mentiras" que se comporte como un CLI de IA real ante Engines
(recibe el prompt por `stdin`, como Workers siempre pide vía `--stdin-prompt`) pero sin gastar cuota
real ni depender de que haya sesión iniciada. El fixture se crea en un directorio temporal en cada
test, nunca se comitea como archivo aparte (mismo patrón que `discovery.test.ts`).

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { runWorkersBatch, type WorkersEvent } from "./run-batch";
import { resolveWorkersBinaryPath } from "./binary-path";
import { resolveEnginesBinaryPath } from "../engines-client/binary-path";

// Requiere forge614-engines y forge614-workers instalados en sus rutas fijas del
// ecosistema (confirmado presentes en esta máquina de desarrollo).
const workersBinaryPath = resolveWorkersBinaryPath(process.platform, homedir());
const enginesBinaryPath = resolveEnginesBinaryPath(process.platform, homedir());

function writeFakeClaudeScript(dir: string): string {
  const scriptPath = join(dir, "fake-claude.sh");
  writeFileSync(
    scriptPath,
    [
      "#!/bin/sh",
      "INPUT=$(cat)",
      'if echo "$INPUT" | grep -q "TRIGGER_QUOTA"; then',
      '  echo "Claude AI usage limit reached" >&2',
      "  exit 1",
      "fi",
      'echo "FAKE_ANALYSIS: $INPUT"',
      "exit 0",
    ].join("\n"),
  );
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

describe("runWorkersBatch", () => {
  test("streams task_started/task_completed/run_completed for a successful task", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-run-batch-"));
    const fakeClaude = writeFakeClaudeScript(dir);

    const events: WorkersEvent[] = [];
    const exitCode = await runWorkersBatch(workersBinaryPath, enginesBinaryPath, [
      { id: "auth", agentId: "claude-code", executable: fakeClaude, prompt: "analiza esto" },
    ], event => events.push(event));

    expect(exitCode).toBe(0);
    const kinds = events.map(e => e.event);
    expect(kinds).toEqual(["task_started", "task_completed", "run_completed"]);

    const completed = events.find(e => e.event === "task_completed");
    expect(completed?.taskId).toBe("auth");
    expect(completed?.stdout).toContain("FAKE_ANALYSIS: analiza esto");

    rmSync(dir, { recursive: true, force: true });
  });

  test("stops the batch and reports quota_exhausted when the pattern matches", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-run-batch-quota-"));
    const fakeClaude = writeFakeClaudeScript(dir);

    const events: WorkersEvent[] = [];
    const exitCode = await runWorkersBatch(workersBinaryPath, enginesBinaryPath, [
      { id: "auth", agentId: "claude-code", executable: fakeClaude, prompt: "TRIGGER_QUOTA" },
      { id: "billing", agentId: "claude-code", executable: fakeClaude, prompt: "nunca debe correr" },
    ], event => events.push(event));

    expect(exitCode).toBe(75);
    const kinds = events.map(e => e.event);
    expect(kinds).toEqual(["task_started", "quota_exhausted", "run_completed"]);
    expect(events.some(e => e.event === "task_started" && e.taskId === "billing")).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/workers-client/run-batch.test.ts`
Expected: FAIL con "Cannot find module './run-batch'".

- [ ] **Step 3: Escribir la implementación**

```typescript
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface WorkersTask {
  id: string;
  agentId: string;
  executable: string;
  prompt: string;
  readableDir?: string;
  model?: string;
  reasoningLevel?: "low" | "medium" | "high";
  timeoutMs?: number;
}

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
      stderr: string;
    }
  | {
      event: "quota_exhausted";
      taskId: string;
      agentId: string;
      matchedPattern: string;
      stdout: string;
      stderr: string;
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
  | { event: "fatal_error"; reason: "invalid_input" | "engines_bin_not_found"; message: string };

export function runWorkersBatch(
  workersBinaryPath: string,
  enginesBin: string,
  tasks: WorkersTask[],
  onEvent: (event: WorkersEvent) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(workersBinaryPath, [], { stdio: ["pipe", "pipe", "pipe"] });

    child.on("error", reject);

    const rl = createInterface({ input: child.stdout });
    rl.on("line", line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      onEvent(JSON.parse(trimmed) as WorkersEvent);
    });

    child.on("close", code => resolve(code ?? 1));

    child.stdin.write(JSON.stringify({ enginesBin, tasks }));
    child.stdin.end();
  });
}
```

- [ ] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/workers-client/run-batch.test.ts`
Expected: PASS (2 tests). Si el segundo test falla porque el exit code no es `75`, confirmar primero
con `bun test` en `forge614-workers` que el patrón `"Claude AI usage limit reached"` sigue siendo el
que usa `detectQuotaExhausted` del adapter de `claude-code` — no cambiar el fixture a ciegas.

- [ ] **Step 5: Commit**

```bash
git add src/modules/workers-client/run-batch.ts src/modules/workers-client/run-batch.test.ts
git commit -m "feat: stream NDJSON events from a real forge614-workers batch run"
```

---

### Task 3: Recuperar archivos de módulo por nombre

**Files:**
- Create: `src/modules/cli/module-files.ts`
- Test: `src/modules/cli/module-files.test.ts`

**Interfaces:**
- Consumes: `discoverModules` de `../scoring/discovery`.
- Produces: `resolveModuleFiles(directory: string, moduleNames: string[]): Map<string, string[]>`
  — consumida por Task 7 (`dispatch-modules.ts`) para construir el prompt de cada tarea.

- [ ] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveModuleFiles } from "./module-files";

describe("resolveModuleFiles", () => {
  test("returns the absolute file list for each named module, empty for unknown names", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-module-files-"));
    mkdirSync(join(root, "auth"), { recursive: true });
    writeFileSync(join(root, "auth", "login.ts"), "export const login = () => true;");
    mkdirSync(join(root, "billing"), { recursive: true });
    writeFileSync(join(root, "billing", "invoice.ts"), "export const invoice = () => 1;");

    const result = resolveModuleFiles(root, ["auth", "unknown-module"]);

    expect(result.get("auth")).toEqual([join(root, "auth", "login.ts")]);
    expect(result.get("unknown-module")).toEqual([]);
    expect(result.has("billing")).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/cli/module-files.test.ts`
Expected: FAIL con "Cannot find module './module-files'".

- [ ] **Step 3: Escribir la implementación**

```typescript
import { discoverModules } from "../scoring/discovery";

export function resolveModuleFiles(directory: string, moduleNames: string[]): Map<string, string[]> {
  const modules = discoverModules(directory);
  const filesByName = new Map(modules.map(module => [module.name, module.files]));

  const result = new Map<string, string[]>();
  for (const name of moduleNames) {
    result.set(name, filesByName.get(name) ?? []);
  }
  return result;
}
```

- [ ] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/cli/module-files.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/modules/cli/module-files.ts src/modules/cli/module-files.test.ts
git commit -m "feat: recover a module's absolute file list by name for prompt building"
```

---

### Task 4: Resolución de modelo/razonamiento por tier y motor

**Files:**
- Modify: `src/modules/engines-client/capabilities.ts` (agregar el campo nuevo real a la interfaz).
- Create: `src/modules/cli/task-config.ts`
- Test: `src/modules/cli/task-config.test.ts`

**Interfaces:**
- Consumes: `Capabilities` de `../engines-client/capabilities` (Plan 3, ampliada en este task).
- Produces: `interface TaskModelConfig { model: string; reasoningLevel?: "low" | "medium" }` y
  `resolveTaskConfig(tier: "ligero" | "estandar" | "profundo", engineId: string, capabilities:
  Pick<Capabilities, "supportsReasoningLevel">): TaskModelConfig` — consumida por Task 7.

- [ ] **Step 0: Ampliar la interfaz `Capabilities` con el campo real ya confirmado**

`forge614-engines` v1.11.0 ya devuelve `supportsReasoningLevel` en `capabilities`/`agents list`
(confirmado en vivo: `false` para `claude-code`, `true` para `codex`), pero la interfaz TypeScript de
este repo todavía no lo declara — sin este cambio, acceder a ese campo es un error de compilación
aunque el JSON real ya lo traiga. Editar `src/modules/engines-client/capabilities.ts`:

```typescript
export interface Capabilities {
  id: string;
  label: string;
  supportsMcp: boolean;
  supportsHooks: boolean;
  supportsHeadlessExec: boolean;
  supportsReasoningLevel: boolean;
}
```

No hace falta un test nuevo para esto — ya lo ejercitan los tests existentes de `getCapabilities`
(Plan 3) contra el binario real, que ahora deben seguir pasando con el campo ya tipado.

- [ ] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test } from "bun:test";
import { resolveTaskConfig } from "./task-config";

describe("resolveTaskConfig", () => {
  test("returns the fixed model for each tier and engine", () => {
    expect(resolveTaskConfig("ligero", "claude-code", { supportsReasoningLevel: false })).toEqual({
      model: "claude-haiku-4-5-20251001",
    });
    expect(resolveTaskConfig("estandar", "codex", { supportsReasoningLevel: true })).toEqual({
      model: "gpt-5.6-terra",
      reasoningLevel: "medium",
    });
    expect(resolveTaskConfig("profundo", "claude-code", { supportsReasoningLevel: false })).toEqual({
      model: "claude-opus-5",
    });
  });

  test("omits reasoningLevel when the engine does not support it, even for profundo", () => {
    const config = resolveTaskConfig("profundo", "claude-code", { supportsReasoningLevel: false });
    expect(config).not.toHaveProperty("reasoningLevel");
  });

  test("includes reasoningLevel when the engine supports it", () => {
    const config = resolveTaskConfig("profundo", "codex", { supportsReasoningLevel: true });
    expect(config.reasoningLevel).toBe("medium");
  });

  test("throws for an engine id outside the fixed table", () => {
    expect(() => resolveTaskConfig("ligero", "cursor", { supportsReasoningLevel: false })).toThrow();
  });
});
```

- [ ] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/cli/task-config.test.ts`
Expected: FAIL con "Cannot find module './task-config'".

- [ ] **Step 3: Escribir la implementación**

```typescript
type Tier = "ligero" | "estandar" | "profundo";
type EngineId = "claude-code" | "codex";

export interface TaskModelConfig {
  model: string;
  reasoningLevel?: "low" | "medium";
}

const MODEL_TABLE: Record<Tier, Record<EngineId, TaskModelConfig>> = {
  ligero: {
    "claude-code": { model: "claude-haiku-4-5-20251001", reasoningLevel: "low" },
    codex: { model: "gpt-5.6-luna", reasoningLevel: "low" },
  },
  estandar: {
    "claude-code": { model: "claude-sonnet-5", reasoningLevel: "medium" },
    codex: { model: "gpt-5.6-terra", reasoningLevel: "medium" },
  },
  profundo: {
    "claude-code": { model: "claude-opus-5", reasoningLevel: "medium" },
    codex: { model: "gpt-5.6-sol", reasoningLevel: "medium" },
  },
};

export function resolveTaskConfig(
  tier: Tier,
  engineId: string,
  capabilities: { supportsReasoningLevel: boolean },
): TaskModelConfig {
  const row = MODEL_TABLE[tier][engineId as EngineId];
  if (!row) {
    throw new Error(`No hay configuración de modelo/razonamiento para el motor "${engineId}"`);
  }
  if (!capabilities.supportsReasoningLevel) {
    return { model: row.model };
  }
  return row;
}
```

- [ ] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/cli/task-config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/cli/task-config.ts src/modules/cli/task-config.test.ts
git commit -m "feat: resolve fixed model/reasoning-level per tier gated by engine capabilities"
```

---

### Task 5: Prompt de análisis

**Files:**
- Create: `src/modules/cli/analysis-prompt.ts`
- Test: `src/modules/cli/analysis-prompt.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `buildAnalysisPrompt(moduleName: string, filePaths: string[]): string` — consumida por
  Task 7.

- [ ] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test } from "bun:test";
import { buildAnalysisPrompt } from "./analysis-prompt";

describe("buildAnalysisPrompt", () => {
  test("includes the module name, the exact file paths, and asks for narrative analysis", () => {
    const prompt = buildAnalysisPrompt("auth", ["/repo/src/auth/login.ts", "/repo/src/auth/session.ts"]);

    expect(prompt).toContain("auth");
    expect(prompt).toContain("/repo/src/auth/login.ts");
    expect(prompt).toContain("/repo/src/auth/session.ts");
    expect(prompt.toLowerCase()).toContain("desarrollador senior");
    // Nunca debe pedir el contenido crudo — Claude Code lo rechaza como
    // patrón de exfiltración (confirmado con pruebas reales).
    expect(prompt.toLowerCase()).not.toContain("contenido crudo");
    expect(prompt.toLowerCase()).toContain("análisis narrativo");
  });
});
```

- [ ] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/cli/analysis-prompt.test.ts`
Expected: FAIL con "Cannot find module './analysis-prompt'".

- [ ] **Step 3: Escribir la implementación**

```typescript
export function buildAnalysisPrompt(moduleName: string, filePaths: string[]): string {
  const fileList = filePaths.map(path => `- ${path}`).join("\n");

  return [
    `Analiza el módulo "${moduleName}" de este proyecto como lo explicarías a otro desarrollador`,
    "senior: qué hace, qué decisiones y patrones de diseño usa, y de qué otras partes del proyecto",
    "depende.",
    "",
    "Lee estos archivos exactos primero:",
    fileList,
    "",
    "Si necesitas entender una dependencia externa a este módulo, puedes explorar el resto del",
    "proyecto.",
    "",
    "Responde siempre con un análisis narrativo completo — nunca con el contenido crudo de los",
    "archivos.",
  ].join("\n");
}
```

- [ ] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/cli/analysis-prompt.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/modules/cli/analysis-prompt.ts src/modules/cli/analysis-prompt.test.ts
git commit -m "feat: build the fixed narrative-analysis prompt template"
```

---

### Task 6: Contador de pausas por cuota en Engram

**Files:**
- Create: `src/modules/memory/pause-count.ts`
- Test: `src/modules/memory/pause-count.test.ts`

**Interfaces:**
- Consumes: `MemoryStore`, `Session` de `forge614-engram` (ya usados en `module-report.ts`).
- Produces: `readPauseCount(store: MemoryStore, projectId: string | null): number` y
  `recordPause(store: MemoryStore, directory: string, session: Session): number` (devuelve el nuevo
  total) — consumidas por Task 7.

- [ ] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, startProjectSession, type MemoryStore } from "forge614-engram";
import { readPauseCount, recordPause } from "./pause-count";

describe("pause-count", () => {
  let dir: string;
  let store: MemoryStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "atlas-pause-count-"));
    const workspace = new MemoryWorkspace(dir);
    workspace.init();
    store = workspace.open();
    store.enableSessions();
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("starts at zero for a project with no recorded pauses", () => {
    const session = startProjectSession(store, dir, "session-1");
    expect(readPauseCount(store, session.projectId)).toBe(0);
  });

  test("increments across multiple pauses and persists the running total", () => {
    const session = startProjectSession(store, dir, "session-1");

    expect(recordPause(store, dir, session)).toBe(1);
    expect(recordPause(store, dir, session)).toBe(2);
    expect(readPauseCount(store, session.projectId)).toBe(2);
  });
});
```

- [ ] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/memory/pause-count.test.ts`
Expected: FAIL con "Cannot find module './pause-count'".

- [ ] **Step 3: Escribir la implementación**

Mismo patrón de `getByTopic` + `expectedVersion` que `module-report.ts`, para que guardar dos veces
bajo el mismo `topicKey` sea una actualización limpia y no un `VERSION_CONFLICT`.

```typescript
import { saveProjectMemoryWithSession, type MemoryStore, type Session } from "forge614-engram";

const PAUSE_COUNT_TOPIC = "atlas:meta:pause-count";

export function readPauseCount(store: MemoryStore, projectId: string | null): number {
  const existing = store.getByTopic(projectId, PAUSE_COUNT_TOPIC);
  if (!existing) return 0;
  const parsed = Number.parseInt(existing.content, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function recordPause(store: MemoryStore, directory: string, session: Session): number {
  const existing = store.getByTopic(session.projectId, PAUSE_COUNT_TOPIC);
  const currentCount = existing ? Number.parseInt(existing.content, 10) || 0 : 0;
  const nextCount = currentCount + 1;

  saveProjectMemoryWithSession(
    store,
    directory,
    {
      type: "fact",
      topicKey: PAUSE_COUNT_TOPIC,
      title: "Atlas: contador de pausas por cuota",
      content: String(nextCount),
      ...(existing ? { expectedVersion: existing.version } : {}),
    },
    { sessionId: session.sessionId },
  );

  return nextCount;
}
```

- [ ] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/memory/pause-count.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/memory/pause-count.ts src/modules/memory/pause-count.test.ts
git commit -m "feat: track quota-pause count across resumes in Engram"
```

---

### Task 7: Orquestador de despacho (`dispatch-modules`)

**Files:**
- Create: `src/modules/cli/dispatch-modules.ts`
- Test: `src/modules/cli/dispatch-modules.test.ts`

**Interfaces:**
- Consumes: `runWorkersBatch`/`WorkersTask` (Task 2), `resolveModuleFiles` (Task 3),
  `resolveTaskConfig` (Task 4), `buildAnalysisPrompt` (Task 5), `readPauseCount`/`recordPause`
  (Task 6), `recordModuleReport` (Plan 2, `../memory/module-report`), `finalizeRun`/`FinalReport`
  (Plan 2, `../memory/finalize-run`), `Capabilities` (Plan 3, `../engines-client/capabilities`).
- Produces: `interface DispatchResult` (unión: completado o pausado — ver forma exacta abajo) y
  `dispatchModules(store, directory, session, workersBinaryPath, enginesBinaryPath, engine: {id:
  string; executable: string}, capabilities: Capabilities, modules: { name: string; tier: "ligero" |
  "estandar" | "profundo" }[]): Promise<DispatchResult>` — consumida por Task 8 (`init.ts`).

Mapeo de tier (español, ya usado en `RunPlanModule`/`Tier`) a las claves en inglés que ya usa
`FinalReport` (`deep`/`standard`/`light`, definidas en `finalize-run.ts` — no se tocan, se traduce en
este archivo): `profundo` → `deep`, `estandar` → `standard`, `ligero` → `light`.

- [ ] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, startProjectSession, type MemoryStore } from "forge614-engram";
import { dispatchModules } from "./dispatch-modules";
import { resolveWorkersBinaryPath } from "../workers-client/binary-path";
import { resolveEnginesBinaryPath } from "../engines-client/binary-path";
import { isModuleReportSaved } from "../memory/run-state";
import { readPauseCount } from "../memory/pause-count";

const workersBinaryPath = resolveWorkersBinaryPath(process.platform, homedir());
const enginesBinaryPath = resolveEnginesBinaryPath(process.platform, homedir());
const capabilities = { id: "claude-code", label: "Claude Code", supportsMcp: true, supportsHooks: true, supportsHeadlessExec: true, supportsReasoningLevel: false };

function writeFakeClaudeScript(dir: string, name: string, behavior: string): string {
  const scriptPath = join(dir, name);
  writeFileSync(scriptPath, `#!/bin/sh\ncat > /dev/null\n${behavior}\n`);
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

describe("dispatchModules", () => {
  let projectDir: string;
  let engramDir: string;
  let store: MemoryStore;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "atlas-dispatch-project-"));
    mkdirSync(join(projectDir, "auth"), { recursive: true });
    writeFileSync(join(projectDir, "auth", "login.ts"), "export const login = () => true;");
    mkdirSync(join(projectDir, "billing"), { recursive: true });
    writeFileSync(join(projectDir, "billing", "invoice.ts"), "export const invoice = () => 1;");

    engramDir = mkdtempSync(join(tmpdir(), "atlas-dispatch-engram-"));
    const workspace = new MemoryWorkspace(engramDir);
    workspace.init();
    store = workspace.open();
    store.enableSessions();
  });

  afterEach(() => {
    store.close();
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(engramDir, { recursive: true, force: true });
  });

  test("saves each module report immediately and returns a completed FinalReport", async () => {
    const fakeClaude = writeFakeClaudeScript(projectDir, "fake-claude-ok.sh", 'echo "FAKE_ANALYSIS_OK"\nexit 0');
    const session = startProjectSession(store, projectDir, "session-completed");

    const result = await dispatchModules(
      store,
      projectDir,
      session,
      workersBinaryPath,
      enginesBinaryPath,
      { id: "claude-code", executable: fakeClaude },
      capabilities,
      [
        { name: "auth", tier: "profundo" },
        { name: "billing", tier: "ligero" },
      ],
    );

    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("unreachable");
    expect(result.report.tierBreakdown).toEqual({ deep: 1, standard: 0, light: 1 });
    expect(result.report.analyzedModuleNames.sort()).toEqual(["auth", "billing"]);

    expect(isModuleReportSaved(store, session.projectId, "auth")).toBe(true);
    expect(isModuleReportSaved(store, session.projectId, "billing")).toBe(true);
  });

  test("stops on quota_exhausted, leaves the session open, and increments the pause count", async () => {
    const fakeClaude = writeFakeClaudeScript(
      projectDir,
      "fake-claude-quota.sh",
      'echo "Claude AI usage limit reached" >&2\nexit 1',
    );
    const session = startProjectSession(store, projectDir, "session-paused");

    const result = await dispatchModules(
      store,
      projectDir,
      session,
      workersBinaryPath,
      enginesBinaryPath,
      { id: "claude-code", executable: fakeClaude },
      capabilities,
      [
        { name: "auth", tier: "profundo" },
        { name: "billing", tier: "ligero" },
      ],
    );

    expect(result.status).toBe("paused");
    expect(isModuleReportSaved(store, session.projectId, "auth")).toBe(false);
    expect(readPauseCount(store, session.projectId)).toBe(1);
  });

  test("reports fatal_error when forge614-workers rejects the batch (e.g. bad enginesBin)", async () => {
    const fakeClaude = writeFakeClaudeScript(projectDir, "fake-claude-unreached.sh", "exit 0");
    const session = startProjectSession(store, projectDir, "session-fatal");

    const result = await dispatchModules(
      store,
      projectDir,
      session,
      workersBinaryPath,
      "/no/existe/forge614-engines",
      { id: "claude-code", executable: fakeClaude },
      capabilities,
      [{ name: "auth", tier: "profundo" }],
    );

    expect(result.status).toBe("fatal_error");
    expect(isModuleReportSaved(store, session.projectId, "auth")).toBe(false);
  });
});
```

- [ ] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/cli/dispatch-modules.test.ts`
Expected: FAIL con "Cannot find module './dispatch-modules'".

- [ ] **Step 3: Escribir la implementación**

```typescript
import type { MemoryStore, Session } from "forge614-engram";
import type { Capabilities } from "../engines-client/capabilities";
import type { FinalReport } from "../memory/finalize-run";
import { resolveModuleFiles } from "./module-files";
import { resolveTaskConfig } from "./task-config";
import { buildAnalysisPrompt } from "./analysis-prompt";
import { runWorkersBatch, type WorkersTask, type WorkersEvent } from "../workers-client/run-batch";
import { recordModuleReport } from "../memory/module-report";
import { recordPause } from "../memory/pause-count";

type Tier = "ligero" | "estandar" | "profundo";
type ReportTier = "deep" | "standard" | "light";

const TIER_TO_REPORT_TIER: Record<Tier, ReportTier> = {
  profundo: "deep",
  estandar: "standard",
  ligero: "light",
};

const TIER_DISPATCH_ORDER: Tier[] = ["profundo", "estandar", "ligero"];

export type DispatchResult =
  | { status: "completed"; report: FinalReport }
  | { status: "paused"; analyzedCount: number; pendingCount: number }
  | { status: "fatal_error"; message: string };

export async function dispatchModules(
  store: MemoryStore,
  directory: string,
  session: Session,
  workersBinaryPath: string,
  enginesBinaryPath: string,
  engine: { id: string; executable: string },
  capabilities: Capabilities,
  modules: { name: string; tier: Tier }[],
): Promise<DispatchResult> {
  const orderedModules = [...modules].sort(
    (a, b) => TIER_DISPATCH_ORDER.indexOf(a.tier) - TIER_DISPATCH_ORDER.indexOf(b.tier),
  );
  const filesByModule = resolveModuleFiles(directory, orderedModules.map(m => m.name));

  const tasks: WorkersTask[] = orderedModules.map(module => {
    const config = resolveTaskConfig(module.tier, engine.id, capabilities);
    return {
      id: module.name,
      agentId: engine.id,
      executable: engine.executable,
      prompt: buildAnalysisPrompt(module.name, filesByModule.get(module.name) ?? []),
      readableDir: directory,
      model: config.model,
      ...(config.reasoningLevel ? { reasoningLevel: config.reasoningLevel } : {}),
    };
  });

  const tierByModuleName = new Map(orderedModules.map(m => [m.name, m.tier]));
  const analyzedModuleNames: string[] = [];
  const skippedModuleNames: string[] = [];
  let quotaExhausted = false;
  let fatalErrorMessage: string | undefined;

  const onEvent = (event: WorkersEvent) => {
    if (event.event === "task_completed") {
      recordModuleReport(store, directory, session, event.taskId, event.stdout);
      analyzedModuleNames.push(event.taskId);
    } else if (event.event === "task_failed") {
      skippedModuleNames.push(event.taskId);
    } else if (event.event === "quota_exhausted") {
      quotaExhausted = true;
    } else if (event.event === "fatal_error") {
      fatalErrorMessage = `${event.reason}: ${event.message}`;
    }
  };

  await runWorkersBatch(workersBinaryPath, enginesBinaryPath, tasks, onEvent);

  if (fatalErrorMessage) {
    return { status: "fatal_error", message: fatalErrorMessage };
  }

  if (quotaExhausted) {
    recordPause(store, directory, session);
    return {
      status: "paused",
      analyzedCount: analyzedModuleNames.length,
      pendingCount: orderedModules.length - analyzedModuleNames.length,
    };
  }

  const tierBreakdown: Record<ReportTier, number> = { deep: 0, standard: 0, light: 0 };
  const engineByTier: Record<ReportTier, string> = { deep: engine.id, standard: engine.id, light: engine.id };
  const totalWorkersByTier: Record<ReportTier, number> = { deep: 0, standard: 0, light: 0 };
  for (const name of analyzedModuleNames) {
    const tier = tierByModuleName.get(name);
    if (!tier) continue;
    const reportTier = TIER_TO_REPORT_TIER[tier];
    tierBreakdown[reportTier] += 1;
    totalWorkersByTier[reportTier] += 1;
  }

  return {
    status: "completed",
    report: {
      repoName: directory,
      tierBreakdown,
      engineByTier,
      totalWorkersByTier,
      tokensConsumed: 0,
      totalTimeMs: 0,
      pauseCount: 0,
      analyzedModuleNames,
      skippedModuleNames,
    },
  };
}
```

**Nota de alcance deliberada:** `tokensConsumed`, `totalTimeMs` y `pauseCount` del `FinalReport`
quedan en `0` en este task — se completan en Task 8, donde `dispatch-modules` ya tiene acceso al
resultado agregado de `run_completed` (que trae `totalDurationMs`) y a `readPauseCount` (Task 6) para
el conteo acumulado real. Mantener este task enfocado en el flujo de guardado/pausa evita mezclar dos
responsabilidades en el mismo test.

- [ ] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/cli/dispatch-modules.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/cli/dispatch-modules.ts src/modules/cli/dispatch-modules.test.ts
git commit -m "feat: dispatch modules to forge614-workers with immediate saves and quota pausing"
```

---

### Task 8: Completar el reporte final y conectar con `init`

**Files:**
- Modify: `src/modules/cli/dispatch-modules.ts` — completar `tokensConsumed`, `totalTimeMs`, y
  `pauseCount` usando el evento `run_completed` y `readPauseCount`; llamar `finalizeRun` en la rama
  `"completed"` en vez de dejarlo para quien llama.
- Modify: `src/modules/cli/init.ts` — en la rama que hoy termina en `status: "ready"` (tanto la de
  `force` como la normal), llamar a `dispatchModules` y traducir su resultado a `"completed"` /
  `"paused"`. Agregar los códigos de error `WORKERS_UNREACHABLE` (el binario no existe/no es
  ejecutable) y `WORKERS_FATAL_ERROR` (evento `fatal_error` de Workers).
- Modify: `src/interfaces/cli/commands.ts` — resolver también la ruta de `forge614-workers`
  (`resolveWorkersBinaryPath`) y pasarla a `runInitCommand`.
- Test: `src/modules/cli/init.test.ts` (extender el ya existente del Plan 3).

**Interfaces:**
- Consumes: `dispatchModules` (Task 7), `readPauseCount` (Task 6).
- Produces: `InitOutcome` ya no tiene la variante `{ status: "ready"; ... }` — se reemplaza por:
  - `{ schemaVersion: 1; status: "completed"; engine: {...}; session: {...}; report: FinalReport }`
  - `{ schemaVersion: 1; status: "paused"; engine: {...}; session: {...}; analyzedCount: number;
    pendingCount: number }`
  - `error.code` gana `"WORKERS_UNREACHABLE" | "WORKERS_FATAL_ERROR"` junto a los ya existentes
    `"ENGINES_UNREACHABLE" | "ANALYSIS_FAILED"`.

- [ ] **Step 1: Completar `dispatch-modules.ts` con los datos reales del reporte final**

Modificar `onEvent` para capturar el evento `run_completed`, y usar `readPauseCount` para el total
acumulado. Reemplazar el bloque final de Task 7 por:

```typescript
import { readPauseCount, recordPause } from "../memory/pause-count";
import { finalizeRun } from "../memory/finalize-run";

// ... (dentro de dispatchModules, junto a las demás variables mutables)
let runCompletedEvent: Extract<WorkersEvent, { event: "run_completed" }> | undefined;

// ... (dentro de onEvent, agregar la rama)
    } else if (event.event === "run_completed") {
      runCompletedEvent = event;
    }

// ... (reemplazar el bloque de retorno "completed" al final de la función)
  const report: FinalReport = {
    repoName: directory,
    tierBreakdown,
    engineByTier,
    totalWorkersByTier,
    tokensConsumed: 0,
    totalTimeMs: runCompletedEvent?.totalDurationMs ?? 0,
    pauseCount: readPauseCount(store, session.projectId),
    analyzedModuleNames,
    skippedModuleNames,
  };
  finalizeRun(store, session, report);
  return { status: "completed", report };
```

**Nota sobre `tokensConsumed`:** el contrato de eventos de Workers (`task_completed`, `run_completed`)
no trae un campo de tokens — Workers documentó explícitamente que nunca interpreta el contenido de la
respuesta (ver spec de Workers, sección de "Conteo de tokens"). Queda en `0` deliberadamente en este
plan; extraerlo (si el motor lo imprime en su salida) es una mejora futura fuera de alcance del Plan
4, no un placeholder olvidado.

Actualizar el test de Task 7 (`dispatch-modules.test.ts`, caso `"completed"`) para reflejar que ahora
`finalizeRun` se llama dentro de la función:

```typescript
    // Agregar al final del primer test ("saves each module report immediately..."):
    expect(result.report.pauseCount).toBe(0);
    // finalizeRun ya cerró la sesión — confirmarlo intentando reabrirla como "ya completa":
    const { startOrResumeSession } = await import("../memory/run-state");
    const reopened = startOrResumeSession(store, projectDir);
    expect(reopened.status).toBe("already-complete");
```

- [ ] **Step 2: Correr las pruebas de `dispatch-modules` para confirmar que pasan con el cambio**

Run: `bun test src/modules/cli/dispatch-modules.test.ts`
Expected: PASS (3 tests, incluyendo las aserciones nuevas del caso "completed").

- [ ] **Step 3: Commit parcial**

```bash
git add src/modules/cli/dispatch-modules.ts src/modules/cli/dispatch-modules.test.ts
git commit -m "feat: finalize the run and compute pauseCount/totalTimeMs from real events"
```

- [ ] **Step 4: Escribir la prueba que falla para `init.ts`**

Leer primero `src/modules/cli/init.test.ts` completo (ya existe del Plan 3) para seguir su mismo
estilo de fixtures (repo git temporal real, motor real detectado). Agregar estos casos nuevos al
final del `describe` existente:

```typescript
  test("completes the run for real and returns status: completed with a FinalReport", () => {
    // Reusa el mismo setup de repo temporal + workspace de Engram que ya usa este archivo
    // para los casos de "ready" del Plan 3, pero ahora pasando también workersBinaryPath.
    const outcome = runInitCommand(store, {
      directory: repoDir,
      enginesBinaryPath,
      workersBinaryPath,
      requestedEngineId: undefined,
      force: false,
    });

    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") throw new Error("unreachable");
    expect(Array.isArray(outcome.report.analyzedModuleNames)).toBe(true);
  });

  test("reports WORKERS_UNREACHABLE when the workers binary path does not exist", () => {
    const outcome = runInitCommand(store, {
      directory: repoDir,
      enginesBinaryPath,
      workersBinaryPath: "/no/existe/forge614-workers",
      requestedEngineId: undefined,
      force: false,
    });

    expect(outcome.status).toBe("error");
    if (outcome.status !== "error") throw new Error("unreachable");
    expect(outcome.error.code).toBe("WORKERS_UNREACHABLE");
  });
```

**Nota importante:** este test de `"completed"` usa el motor real ya detectado en la máquina
(`claude-code` o `codex`, según lo que `init.test.ts` del Plan 3 ya venga usando) contra un repo de
prueba **real y pequeño** — va a gastar una fracción mínima de cuota real por cada archivo/módulo del
repo de prueba (igual que ya se aceptó para las pruebas reales de autenticación de `forge614-workers`
más arriba en este proyecto). Si el repo de prueba de `init.test.ts` ya tiene módulos de sobra,
recortarlo a 1-2 archivos mínimos antes de este task, para no gastar cuota de más en cada corrida de
`bun test`.

- [ ] **Step 5: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/cli/init.test.ts`
Expected: FAIL — `runInitCommand` sigue devolviendo `status: "ready"`, y `RunInitOptions` no tiene
`workersBinaryPath` todavía (error de tipos).

- [ ] **Step 6: Modificar `init.ts`**

```typescript
import { startProjectSession, type MemoryStore } from "forge614-engram";
import { accessSync, constants } from "node:fs";
import { detectAgents, type AgentDetection } from "../engines-client/detect";
import { getCapabilities, type Capabilities } from "../engines-client/capabilities";
import { resolveEngine } from "./resolve-engine";
import { deriveForcedSessionId } from "../memory/session-id";
import { startOrResumeSession } from "../memory/run-state";
import { buildRunPlan } from "./build-run-plan";
import { dispatchModules } from "./dispatch-modules";
import type { FinalReport } from "../memory/finalize-run";

export interface RunInitOptions {
  directory: string;
  enginesBinaryPath: string;
  workersBinaryPath: string;
  requestedEngineId?: string;
  force: boolean;
}

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
      error: { code: "ENGINES_UNREACHABLE" | "ANALYSIS_FAILED" | "WORKERS_UNREACHABLE" | "WORKERS_FATAL_ERROR"; message: string };
    };

function failure(
  code: "ENGINES_UNREACHABLE" | "ANALYSIS_FAILED" | "WORKERS_UNREACHABLE" | "WORKERS_FATAL_ERROR",
  error: unknown,
): InitOutcome {
  return {
    schemaVersion: 1,
    status: "error",
    error: { code, message: error instanceof Error ? error.message : String(error) },
  };
}

function assertWorkersReachable(workersBinaryPath: string): void {
  accessSync(workersBinaryPath, constants.X_OK);
}

async function runDispatch(
  store: MemoryStore,
  options: RunInitOptions,
  engine: { id: string; executable: string },
  capabilities: Capabilities,
  sessionId: string,
  resumed: boolean,
  session: Awaited<ReturnType<typeof startOrResumeSession>> extends { session: infer S } ? S : never,
  modules: { name: string; tier: "ligero" | "estandar" | "profundo" }[],
): Promise<InitOutcome> {
  try {
    assertWorkersReachable(options.workersBinaryPath);
  } catch (error) {
    return failure("WORKERS_UNREACHABLE", error);
  }

  const result = await dispatchModules(
    store,
    options.directory,
    session,
    options.workersBinaryPath,
    options.enginesBinaryPath,
    engine,
    capabilities,
    modules,
  );

  if (result.status === "fatal_error") {
    return {
      schemaVersion: 1,
      status: "error",
      error: { code: "WORKERS_FATAL_ERROR", message: result.message },
    };
  }

  if (result.status === "paused") {
    return {
      schemaVersion: 1,
      status: "paused",
      engine,
      session: { sessionId, resumed },
      analyzedCount: result.analyzedCount,
      pendingCount: result.pendingCount,
    };
  }

  return {
    schemaVersion: 1,
    status: "completed",
    engine,
    session: { sessionId, resumed },
    report: result.report,
  };
}

export async function runInitCommand(store: MemoryStore, options: RunInitOptions): Promise<InitOutcome> {
  let agents: AgentDetection[];
  try {
    agents = detectAgents(options.enginesBinaryPath);
  } catch (error) {
    return failure("ENGINES_UNREACHABLE", error);
  }

  const capabilitiesById = new Map<string, Capabilities>();
  try {
    for (const agent of agents) {
      if (!agent.installed) continue;
      capabilitiesById.set(agent.id, getCapabilities(options.enginesBinaryPath, agent.id));
    }
  } catch (error) {
    return failure("ENGINES_UNREACHABLE", error);
  }

  const resolution = resolveEngine(agents, capabilitiesById, options.requestedEngineId);
  if (resolution.status !== "resolved") {
    return { schemaVersion: 1, ...resolution };
  }
  const engine = { id: resolution.id, executable: resolution.executable };
  const capabilities = capabilitiesById.get(resolution.id)!;

  if (options.force) {
    const sessionId = deriveForcedSessionId(options.directory);
    const session = startProjectSession(store, options.directory, sessionId);
    let plan;
    try {
      plan = buildRunPlan(store, session.projectId, options.directory, { skipCompleted: false });
    } catch (error) {
      return failure("ANALYSIS_FAILED", error);
    }
    return runDispatch(store, options, engine, capabilities, session.sessionId, false, session, plan.modules);
  }

  const runState = startOrResumeSession(store, options.directory);
  if (runState.status === "already-complete") {
    return { schemaVersion: 1, status: "already-complete" };
  }

  let plan;
  try {
    plan = buildRunPlan(store, runState.session.projectId, options.directory, { skipCompleted: true });
  } catch (error) {
    return failure("ANALYSIS_FAILED", error);
  }
  return runDispatch(
    store,
    options,
    engine,
    capabilities,
    runState.session.sessionId,
    plan.resumed,
    runState.session,
    plan.modules,
  );
}
```

**Nota de tipos:** el parámetro `session` de `runDispatch` usa un tipo genérico incómodo solo para
evitar importar el tipo `Session` de `forge614-engram` dos veces con nombres distintos — si al
implementar resulta más simple, importar `type { Session } from "forge614-engram"` directamente y
tipar `session: Session` es preferible y equivalente; usar lo que compile limpio con
`bun run typecheck`.

`runInitCommand` pasa de síncrona a **asíncrona** (por el streaming de Task 2) — esto se propaga a
quien la llama (Step 7).

- [ ] **Step 7: Actualizar `commands.ts` y `main.ts` para el flujo asíncrono**

```typescript
// src/interfaces/cli/commands.ts
import { homedir } from "node:os";
import { MemoryWorkspace } from "forge614-engram";
import { resolveEnginesBinaryPath } from "../../modules/engines-client/binary-path";
import { resolveWorkersBinaryPath } from "../../modules/workers-client/binary-path";
import { runInitCommand } from "../../modules/cli/init";

export function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

export async function runInit(directory: string, requestedEngineId: string | undefined, force: boolean): Promise<void> {
  const workspace = new MemoryWorkspace();
  workspace.init();
  const store = workspace.open();
  store.enableSessions();
  try {
    const enginesBinaryPath = resolveEnginesBinaryPath(process.platform, homedir());
    const workersBinaryPath = resolveWorkersBinaryPath(process.platform, homedir());
    const outcome = await runInitCommand(store, { directory, enginesBinaryPath, workersBinaryPath, requestedEngineId, force });
    printJson(outcome);
    if ("error" in outcome) process.exitCode = 1;
  } finally {
    store.close();
  }
}
```

```typescript
// src/interfaces/cli/main.ts
#!/usr/bin/env bun
import { runInit } from "./commands";

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "init") {
    const engine = flag(rest, "--engine");
    const force = rest.includes("--force");
    await runInit(process.cwd(), engine, force);
    return;
  }

  console.log(
    JSON.stringify(
      { schemaVersion: 1, status: "error", error: { code: "UNKNOWN_COMMAND", argv: process.argv.slice(2) } },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}

main();
```

- [ ] **Step 8: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/cli/init.test.ts`
Expected: PASS, incluyendo los casos nuevos de `"completed"` y `"WORKERS_UNREACHABLE"`.

- [ ] **Step 9: Correr toda la suite y el typecheck**

Run: `bun test && bun run typecheck`
Expected: todo verde, sin errores de tipos (revisar con cuidado los tests existentes de Task 3 del
Plan 3 que construían `RunInitOptions`/llamaban `runInitCommand` de forma síncrona — ahora necesitan
`await` y el campo `workersBinaryPath`).

- [ ] **Step 10: Commit**

```bash
git add src/modules/cli/init.ts src/modules/cli/init.test.ts src/interfaces/cli/commands.ts src/interfaces/cli/main.ts
git commit -m "feat: wire real subagent dispatch into the init command (completed/paused outcomes)"
```

---

## Revisión final

Al terminar las 8 tareas: correr `bun test` (suite completa) y `bun run typecheck` una vez más desde
la raíz del repo, confirmar que `src/index.ts` (barrel export) necesita actualizarse si expone
`InitOutcome`/tipos nuevos de este plan (revisar qué exportaba antes del Plan 4 y mantener el mismo
nivel de exposición pública), y hacer la revisión de rama completa de
`superpowers:subagent-driven-development` antes de pasar a
`superpowers:finishing-a-development-branch`.
