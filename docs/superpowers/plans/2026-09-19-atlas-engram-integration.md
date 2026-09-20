# Atlas ↔ Engram: Sesiones Progresivas y Reportes de Módulo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a Atlas las funciones necesarias para, usando el SDK de
`forge614-engram`, saber si un repo ya tiene una corrida a medias o
completa, guardar el reporte de cada módulo apenas termina, y cerrar la
corrida con un resumen final.

**Architecture:** Cinco módulos pequeños y puros/casi-puros en
`src/modules/memory/`, cada uno con una sola responsabilidad
(formato de topicKey, id de sesión, arranque/reanudación de sesión,
guardado de reporte de módulo, cierre con resumen), reexportados desde el
barrel público `src/index.ts`. Nada de esto llama a la CLI de Engram ni
levanta subprocesos — todo es SDK importado directo.

**Tech Stack:** Bun >= 1.3.8, TypeScript 5.9.3, `bun:test`,
`forge614-engram` (SDK real, sin mocks, vía dependencia `file:` local),
`node:crypto` para el hash del id de sesión.

**Spec:** `docs/superpowers/specs/2026-09-19-atlas-engram-integration-design.md`

## Global Constraints

- Bun >= 1.3.8, 100% TypeScript, mismo patrón de archivo colocado
  (`file.ts` + `file.test.ts`) que el resto del proyecto.
- Los tests usan una base de datos real de Engram en un directorio
  temporal (`mkdtempSync` + `MemoryWorkspace`/`WorkspaceConfig` reales) —
  nunca mocks de la base de datos, ni tocan la base de datos real del
  usuario en `~/.forge614/engram/`.
- Solo Atlas guarda en Engram (nunca "mandaderos" directamente) — esta
  regla no se implementa aquí, pero ninguna función de este plan debe
  hacer nada que sugiera lo contrario.
- Todo uso de Engram en este plan es vía SDK importado (`import ... from
  "forge614-engram"`), nunca `spawnSync`/CLI.
- `sessionId` debe ser determinista por repositorio y nunca un literal
  fijo compartido entre proyectos (ver spec sección 2 — es un
  identificador global en la base de Engram).
- No se toca `forge614-engram` en este plan — ya expone todo lo necesario
  (`getByTopic` ya está en v1.1.0, verificado).

---

### Task 1: Dependencia de `forge614-engram` + prueba de plomería

**Files:**
- Modify: `package.json`
- Create: `src/modules/memory/engram-link.test.ts`

**Interfaces:**
- Produces: confirma que `import ... from "forge614-engram"` resuelve y
  que el flujo básico (crear workspace temporal, abrir store, habilitar
  sesiones, cerrar) funciona — todas las tareas siguientes dependen de
  esto.

- [ ] **Step 1: Agregar la dependencia**

Edita `package.json`, agrega esta línea dentro de `"dependencies"`:

```json
  "dependencies": {
    "typescript": "5.9.3",
    "forge614-engram": "file:../forge614-engram"
  }
```

- [ ] **Step 2: Instalar**

Run: `bun install`
Expected: sin errores, `bun.lock` actualizado con la entrada de
`forge614-engram`.

- [ ] **Step 3: Escribir la prueba de plomería**

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig } from "forge614-engram";

describe("forge614-engram wiring", () => {
  test("can create a temporary workspace, open a store, and enable sessions", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-engram-link-"));
    const workspace = new MemoryWorkspace(new WorkspaceConfig(root));

    workspace.init();
    const store = workspace.open();
    store.enableSessions();

    expect(store.sessionsEnabled()).toBe(true);

    store.close();
    rmSync(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 4: Correr la prueba**

Run: `bun test src/modules/memory/engram-link.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock src/modules/memory/engram-link.test.ts
git commit -m "chore: add forge614-engram as a local SDK dependency"
```

---

### Task 2: Formato del `topicKey` por módulo

**Files:**
- Create: `src/modules/memory/module-topic.ts`
- Test: `src/modules/memory/module-topic.test.ts`

**Interfaces:**
- Produces: `moduleTopicKey(moduleName: string): string` — consumida por
  Task 4 (run-state) y Task 5 (module-report). Único lugar donde vive el
  formato `"atlas:module:<nombre>"`, para que no se desincronice entre
  ambos usos.

- [ ] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test } from "bun:test";
import { moduleTopicKey } from "./module-topic";

describe("moduleTopicKey", () => {
  test("formats the topic key with the atlas:module: prefix", () => {
    expect(moduleTopicKey("auth")).toBe("atlas:module:auth");
  });

  test("produces different keys for different module names", () => {
    expect(moduleTopicKey("auth")).not.toBe(moduleTopicKey("billing"));
  });
});
```

- [ ] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/memory/module-topic.test.ts`
Expected: FAIL con "Cannot find module './module-topic'".

- [ ] **Step 3: Escribir la implementación**

```typescript
export function moduleTopicKey(moduleName: string): string {
  return `atlas:module:${moduleName}`;
}
```

- [ ] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/memory/module-topic.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/memory/module-topic.ts src/modules/memory/module-topic.test.ts
git commit -m "feat: define the module report topic key format"
```

---

### Task 3: Id de sesión determinista por repositorio

**Files:**
- Create: `src/modules/memory/session-id.ts`
- Test: `src/modules/memory/session-id.test.ts`

**Interfaces:**
- Produces: `deriveSessionId(directory: string): string` y
  `deriveForcedSessionId(directory: string): string` — consumidas por
  Task 4 (run-state).

- [ ] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveSessionId, deriveForcedSessionId } from "./session-id";

describe("deriveSessionId", () => {
  test("is deterministic for the same directory", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-sessionid-"));
    expect(deriveSessionId(root)).toBe(deriveSessionId(root));
    rmSync(root, { recursive: true, force: true });
  });

  test("differs between two different directories", () => {
    const rootA = mkdtempSync(join(tmpdir(), "atlas-sessionid-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "atlas-sessionid-b-"));
    expect(deriveSessionId(rootA)).not.toBe(deriveSessionId(rootB));
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  });

  test("starts with the atlas: prefix and is a valid Engram sessionId", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-sessionid-prefix-"));
    const id = deriveSessionId(root);
    expect(id.startsWith("atlas:")).toBe(true);
    expect(id.length).toBeLessThanOrEqual(200);
    expect(id.trim()).toBe(id);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("deriveForcedSessionId", () => {
  test("differs from the deterministic id but keeps it as a prefix", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-sessionid-forced-"));
    const base = deriveSessionId(root);
    const forced = deriveForcedSessionId(root);
    expect(forced).not.toBe(base);
    expect(forced.startsWith(base)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/memory/session-id.test.ts`
Expected: FAIL con "Cannot find module './session-id'".

- [ ] **Step 3: Escribir la implementación**

```typescript
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";

/**
 * sessionId es un identificador GLOBAL en la base de Engram (no tiene
 * espacio de nombres por proyecto). Debe derivarse de la ruta real del
 * repo para que dos proyectos nunca choquen entre sí.
 */
export function deriveSessionId(directory: string): string {
  const canonical = realpathSync(directory);
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  return `atlas:${hash}`;
}

/**
 * Para una re-corrida forzada (--force) sobre un repo cuya sesión
 * anterior ya está cerrada: una sesión cerrada no puede reabrirse con el
 * mismo id, así que se genera uno nuevo y distinto.
 */
export function deriveForcedSessionId(directory: string): string {
  return `${deriveSessionId(directory)}:${Date.now()}`;
}
```

- [ ] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/memory/session-id.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/memory/session-id.ts src/modules/memory/session-id.test.ts
git commit -m "feat: derive a per-repository, collision-safe Engram sessionId"
```

---

### Task 4: Arrancar o reanudar la sesión de análisis

**Files:**
- Create: `src/modules/memory/run-state.ts`
- Test: `src/modules/memory/run-state.test.ts`

**Interfaces:**
- Consumes: `deriveSessionId` de `./session-id`; `moduleTopicKey` de
  `./module-topic`; `MemoryStore`, `MemoryError`, `Session`,
  `saveProjectMemoryWithSession`, `startProjectSession` de
  `"forge614-engram"`.
- Produces: `type RunState = { status: "active"; session: Session } | {
  status: "already-complete" }`, `startOrResumeSession(store: MemoryStore,
  directory: string): RunState`, `isModuleReportSaved(store: MemoryStore,
  projectId: string, moduleName: string): boolean` — consumidas por
  Plan 3 (CLI `init`/`resume`) y Plan 4 (despacho de subagentes, para
  saber qué módulos saltarse).

- [ ] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, saveProjectMemoryWithSession } from "forge614-engram";
import { startOrResumeSession, isModuleReportSaved } from "./run-state";
import { moduleTopicKey } from "./module-topic";

function freshStore(root: string) {
  const workspace = new MemoryWorkspace(new WorkspaceConfig(root));
  workspace.init();
  const store = workspace.open();
  store.enableSessions();
  return store;
}

describe("startOrResumeSession", () => {
  test("starts a fresh, active session for a repo never analyzed before", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-runstate-fresh-"));
    const repoDir = mkdtempSync(join(tmpdir(), "atlas-runstate-fresh-repo-"));
    const store = freshStore(root);

    const state = startOrResumeSession(store, repoDir);

    expect(state.status).toBe("active");
    if (state.status === "active") {
      expect(isModuleReportSaved(store, state.session.projectId, "auth")).toBe(false);
    }

    store.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  test("resuming the same repo returns the same open session and sees previously saved modules", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-runstate-resume-"));
    const repoDir = mkdtempSync(join(tmpdir(), "atlas-runstate-resume-repo-"));
    const store = freshStore(root);

    const first = startOrResumeSession(store, repoDir);
    if (first.status !== "active") throw new Error("expected active");
    saveProjectMemoryWithSession(store, repoDir, {
      type: "fact", topicKey: moduleTopicKey("auth"), title: "Atlas: auth", content: "reporte de auth",
    }, { sessionId: first.session.sessionId });

    const second = startOrResumeSession(store, repoDir);

    expect(second.status).toBe("active");
    if (second.status === "active") {
      expect(second.session.sessionId).toBe(first.session.sessionId);
      expect(isModuleReportSaved(store, second.session.projectId, "auth")).toBe(true);
      expect(isModuleReportSaved(store, second.session.projectId, "billing")).toBe(false);
    }

    store.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  test("two different repos never collide on the same sessionId", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-runstate-two-"));
    const repoA = mkdtempSync(join(tmpdir(), "atlas-runstate-two-a-"));
    const repoB = mkdtempSync(join(tmpdir(), "atlas-runstate-two-b-"));
    const store = freshStore(root);

    const stateA = startOrResumeSession(store, repoA);
    const stateB = startOrResumeSession(store, repoB);

    expect(stateA.status).toBe("active");
    expect(stateB.status).toBe("active");
    if (stateA.status === "active" && stateB.status === "active") {
      expect(stateA.session.sessionId).not.toBe(stateB.session.sessionId);
    }

    store.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(repoA, { recursive: true, force: true });
    rmSync(repoB, { recursive: true, force: true });
  });

  test("a repo whose session was already closed reports already-complete", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-runstate-done-"));
    const repoDir = mkdtempSync(join(tmpdir(), "atlas-runstate-done-repo-"));
    const store = freshStore(root);

    const first = startOrResumeSession(store, repoDir);
    if (first.status !== "active") throw new Error("expected active");
    store.endSession(first.session.projectId, first.session.sessionId);

    const second = startOrResumeSession(store, repoDir);

    expect(second.status).toBe("already-complete");

    store.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/memory/run-state.test.ts`
Expected: FAIL con "Cannot find module './run-state'".

- [ ] **Step 3: Escribir la implementación**

```typescript
import { MemoryError, startProjectSession, type MemoryStore, type Session } from "forge614-engram";
import { deriveSessionId } from "./session-id";
import { moduleTopicKey } from "./module-topic";

export type RunState =
  | { status: "active"; session: Session }
  | { status: "already-complete" };

/**
 * startProjectSession es idempotente si el sessionId ya existe, es del
 * mismo proyecto, tipo "runtime" y sigue abierto: devuelve la sesión tal
 * cual, sin error. Si ya está cerrada, lanza SESSION_CONFLICT — eso es
 * justamente la señal de "este repo ya se analizó por completo".
 */
export function startOrResumeSession(store: MemoryStore, directory: string): RunState {
  const sessionId = deriveSessionId(directory);
  try {
    const session = startProjectSession(store, directory, sessionId);
    return { status: "active", session };
  } catch (error) {
    if (error instanceof MemoryError && error.code === "SESSION_CONFLICT") {
      return { status: "already-complete" };
    }
    throw error;
  }
}

export function isModuleReportSaved(store: MemoryStore, projectId: string, moduleName: string): boolean {
  return store.getByTopic(projectId, moduleTopicKey(moduleName)) !== null;
}
```

- [ ] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/memory/run-state.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/memory/run-state.ts src/modules/memory/run-state.test.ts
git commit -m "feat: resolve run state (fresh, resumed, or already complete) per repository"
```

---

### Task 5: Guardar el reporte de un módulo

**Files:**
- Create: `src/modules/memory/module-report.ts`
- Test: `src/modules/memory/module-report.test.ts`

**Interfaces:**
- Consumes: `moduleTopicKey` de `./module-topic`;
  `saveProjectMemoryWithSession`, `MemoryStore`, `Session`,
  `SessionSaveResult` de `"forge614-engram"`.
- Produces: `recordModuleReport(store: MemoryStore, directory: string,
  session: Session, moduleName: string, reportText: string):
  SessionSaveResult` — consumida por Plan 4 (despacho de subagentes),
  apenas termina cada mandadero.

- [ ] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, startProjectSession } from "forge614-engram";
import { recordModuleReport } from "./module-report";

function freshSession(root: string, repoDir: string) {
  const workspace = new MemoryWorkspace(new WorkspaceConfig(root));
  workspace.init();
  const store = workspace.open();
  store.enableSessions();
  const session = startProjectSession(store, repoDir, "atlas:test-session");
  return { store, session };
}

describe("recordModuleReport", () => {
  test("saves the module report under the module's topic key, tied to the session", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-module-report-"));
    const repoDir = mkdtempSync(join(tmpdir(), "atlas-module-report-repo-"));
    const { store, session } = freshSession(root, repoDir);

    const result = recordModuleReport(store, repoDir, session, "auth", "El módulo auth maneja login.");

    expect(result.memory.content).toBe("El módulo auth maneja login.");
    expect(result.memory.topicKey).toBe("atlas:module:auth");
    expect(result.sessionId).toBe(session.sessionId);

    const fetched = store.getByTopic(session.projectId, "atlas:module:auth");
    expect(fetched?.content).toBe("El módulo auth maneja login.");

    store.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  test("re-saving the same module updates it instead of throwing VERSION_CONFLICT", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-module-report-resave-"));
    const repoDir = mkdtempSync(join(tmpdir(), "atlas-module-report-resave-repo-"));
    const { store, session } = freshSession(root, repoDir);

    recordModuleReport(store, repoDir, session, "auth", "primer reporte");
    const updated = recordModuleReport(store, repoDir, session, "auth", "reporte actualizado");

    expect(updated.memory.content).toBe("reporte actualizado");
    expect(updated.memory.version).toBe(2);

    store.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/memory/module-report.test.ts`
Expected: FAIL con "Cannot find module './module-report'".

- [ ] **Step 3: Escribir la implementación**

```typescript
import { saveProjectMemoryWithSession, type MemoryStore, type Session, type SessionSaveResult } from "forge614-engram";
import { moduleTopicKey } from "./module-topic";

/**
 * Guardar dos veces bajo el mismo topicKey sin pasar expectedVersion
 * lanza VERSION_CONFLICT en Engram. Por eso se revisa primero si ya
 * existe (getByTopic) para pasar su versión actual y que sea una
 * actualización limpia, no un choque — necesario para que una
 * re-corrida (--force) sobre un módulo ya guardado no falle.
 */
export function recordModuleReport(
  store: MemoryStore,
  directory: string,
  session: Session,
  moduleName: string,
  reportText: string,
): SessionSaveResult {
  const topicKey = moduleTopicKey(moduleName);
  const existing = store.getByTopic(session.projectId, topicKey);

  return saveProjectMemoryWithSession(store, directory, {
    type: "fact",
    topicKey,
    title: `Atlas: ${moduleName}`,
    content: reportText,
    ...(existing ? { expectedVersion: existing.version } : {}),
  }, { sessionId: session.sessionId });
}
```

- [ ] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/memory/module-report.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/memory/module-report.ts src/modules/memory/module-report.test.ts
git commit -m "feat: record a module's analysis report as soon as it finishes"
```

---

### Task 6: Cerrar la corrida con el resumen final

**Files:**
- Create: `src/modules/memory/finalize-run.ts`
- Test: `src/modules/memory/finalize-run.test.ts`

**Interfaces:**
- Consumes: `MemoryStore`, `Session`, `SummaryFields` de
  `"forge614-engram"`.
- Produces: `interface FinalReport { repoName: string; tierBreakdown: {
  deep: number; standard: number; light: number }; engineByTier:
  Record<"deep"|"standard"|"light", string>; totalWorkersByTier:
  Record<"deep"|"standard"|"light", number>; tokensConsumed: number;
  totalTimeMs: number; pauseCount: number; analyzedModuleNames: string[];
  pendingModuleNames: string[]; }`, `finalizeRun(store: MemoryStore,
  session: Session, report: FinalReport): void` — consumida por Plan 4 al
  terminar el 100% de los módulos.

- [ ] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, startProjectSession } from "forge614-engram";
import { finalizeRun, type FinalReport } from "./finalize-run";

function freshSession(root: string, repoDir: string, sessionId: string) {
  const workspace = new MemoryWorkspace(new WorkspaceConfig(root));
  workspace.init();
  const store = workspace.open();
  store.enableSessions();
  const session = startProjectSession(store, repoDir, sessionId);
  return { store, session };
}

describe("finalizeRun", () => {
  test("saves a session summary and closes the session", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-finalize-"));
    const repoDir = mkdtempSync(join(tmpdir(), "atlas-finalize-repo-"));
    const { store, session } = freshSession(root, repoDir, "atlas:test-finalize");

    const report: FinalReport = {
      repoName: "mi-repo",
      tierBreakdown: { deep: 1, standard: 2, light: 3 },
      engineByTier: { deep: "claude", standard: "claude", light: "claude" },
      totalWorkersByTier: { deep: 1, standard: 2, light: 3 },
      tokensConsumed: 12345,
      totalTimeMs: 60000,
      pauseCount: 1,
      analyzedModuleNames: ["auth", "billing"],
      pendingModuleNames: [],
    };

    finalizeRun(store, session, report);

    const closed = store.getSession(session.projectId, session.sessionId);
    expect(closed?.endedAt).not.toBeNull();

    store.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  test("nextSteps lists pending modules when the run was not fully completed", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-finalize-pending-"));
    const repoDir = mkdtempSync(join(tmpdir(), "atlas-finalize-pending-repo-"));
    const { store, session } = freshSession(root, repoDir, "atlas:test-finalize-pending");

    const report: FinalReport = {
      repoName: "mi-repo",
      tierBreakdown: { deep: 1, standard: 0, light: 0 },
      engineByTier: { deep: "claude", standard: "claude", light: "claude" },
      totalWorkersByTier: { deep: 1, standard: 0, light: 0 },
      tokensConsumed: 100,
      totalTimeMs: 5000,
      pauseCount: 0,
      analyzedModuleNames: ["auth"],
      pendingModuleNames: ["billing"],
    };

    finalizeRun(store, session, report);

    const summary = store.getByTopic(session.projectId, `session/${session.sessionId}/summary`);
    expect(summary?.content).toContain("billing");

    store.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/memory/finalize-run.test.ts`
Expected: FAIL con "Cannot find module './finalize-run'".

- [ ] **Step 3: Escribir la implementación**

```typescript
import { type MemoryStore, type Session, type SummaryFields } from "forge614-engram";

export interface FinalReport {
  repoName: string;
  tierBreakdown: { deep: number; standard: number; light: number };
  engineByTier: Record<"deep" | "standard" | "light", string>;
  totalWorkersByTier: Record<"deep" | "standard" | "light", number>;
  tokensConsumed: number;
  totalTimeMs: number;
  pauseCount: number;
  analyzedModuleNames: string[];
  pendingModuleNames: string[];
}

export function finalizeRun(store: MemoryStore, session: Session, report: FinalReport): void {
  const fields: SummaryFields = {
    goal: `Contextualización profunda de ${report.repoName}`,
    instructions: "Generado automáticamente por Atlas al completar el análisis.",
    discoveries: `Distribución de niveles — Profundo: ${report.tierBreakdown.deep}, Estándar: ${report.tierBreakdown.standard}, Ligero: ${report.tierBreakdown.light}.`,
    accomplishments: [
      `Motor por nivel — Profundo: ${report.engineByTier.deep}, Estándar: ${report.engineByTier.standard}, Ligero: ${report.engineByTier.light}.`,
      `Mandaderos totales por nivel — Profundo: ${report.totalWorkersByTier.deep}, Estándar: ${report.totalWorkersByTier.standard}, Ligero: ${report.totalWorkersByTier.light}.`,
      `Tokens consumidos: ${report.tokensConsumed}.`,
      `Tiempo total: ${report.totalTimeMs} ms.`,
      `Pausas/reanudaciones: ${report.pauseCount}.`,
    ].join("\n"),
    nextSteps: report.pendingModuleNames.length === 0
      ? "Ninguno; análisis completo."
      : `Módulos pendientes: ${report.pendingModuleNames.join(", ")}.`,
    files: report.analyzedModuleNames,
  };

  store.saveSessionSummary(session.projectId, session.sessionId, fields, {
    requestKey: `${session.sessionId}:summary`,
  });
  store.endSession(session.projectId, session.sessionId);
}
```

- [ ] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/memory/finalize-run.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/memory/finalize-run.ts src/modules/memory/finalize-run.test.ts
git commit -m "feat: close a completed run with a final Engram session summary"
```

---

### Task 7: Exponer todo en el barrel público y correr la suite completa

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Produces: superficie pública final de esta integración, para que
  Plan 3 y Plan 4 importen desde `forge614-atlas` en vez de rutas
  internas.

- [ ] **Step 1: Agregar los exports al barrel**

Agrega esto a `src/index.ts`, después de los exports existentes de Tiers:

```typescript
// 8. Módulo de Integración con Engram (Sesiones y Reportes de Módulo)
export { moduleTopicKey } from "./modules/memory/module-topic";
export { deriveSessionId, deriveForcedSessionId } from "./modules/memory/session-id";
export { startOrResumeSession, isModuleReportSaved } from "./modules/memory/run-state";
export type { RunState } from "./modules/memory/run-state";
export { recordModuleReport } from "./modules/memory/module-report";
export { finalizeRun } from "./modules/memory/finalize-run";
export type { FinalReport } from "./modules/memory/finalize-run";
```

- [ ] **Step 2: Correr la suite completa**

Run: `bun test`
Expected: PASS (todos los tests de Tasks 1–6 de este plan, más los 26 del
Plan 1, sin fallos).

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: expose Atlas-Engram session integration from the public barrel"
```
