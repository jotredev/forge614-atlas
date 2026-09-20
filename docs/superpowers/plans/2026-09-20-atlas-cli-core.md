# Plan 3: Núcleo del CLI de Atlas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir `forge614-atlas init`: resuelve qué motor de IA usar
(consultando siempre a `forge614-engines`), resuelve el estado de la
sesión de análisis (Plan 2/Engram), clasifica los módulos pendientes
(Plan 1), y devuelve un plan de corrida en JSON. No dispara ningún
subagente — eso es 100% del Plan 4.

**Architecture:** Capa de "cliente de Engines" (invoca el binario real por
subproceso y parsea su JSON) + una función pura de resolución de motor +
una función que arma el plan de módulos reutilizando el pipeline completo
del Plan 1 filtrado por el Plan 2 + un orquestador (`runInitCommand`) que
junta todo con dependencias inyectadas (testeable sin tocar el sistema
real) + una capa CLI delgada (`main.ts`/`commands.ts`) que conecta todo
con el mundo real (rutas reales, Engram real) y no se testea
automáticamente (mismo patrón que `forge614-engines`/`forge614-engram`).

**Tech Stack:** Bun >= 1.3.8, TypeScript, `bun:test`, `node:child_process`
(`spawnSync` contra el binario real de `forge614-engines`), `forge614-engram`
(SDK, ya integrado en el Plan 2).

**Spec:** `docs/superpowers/specs/2026-09-20-atlas-cli-core-design.md`

## Global Constraints

- Bun >= 1.3.8, 100% TypeScript, mismo patrón de archivo colocado
  (`file.ts` + `file.test.ts`).
- Atlas nunca redacta texto pensado para humanos — toda su salida es JSON
  estructurado puro. Ningún string de este plan debe sonar a "mensaje para
  el usuario"; son solo campos de datos (`status`, `code`, ids).
- Engines es siempre la fuente de verdad para qué motor usar, incluso con
  `--engine` explícito — el flag solo elige entre lo que Engines ya
  confirmó, nunca se confía a ciegas.
- El binario de `forge614-engines` se ubica en su ruta fija del ecosistema
  (`~/.forge614/engines/bin/forge614-engines`, o con `.exe` en Windows) —
  nunca se busca en `PATH`.
- `isModuleReportSaved` (Plan 2) filtra por `projectId`, no por sesión —
  `init` normal debe filtrar por él; `init --force` NO debe filtrar (debe
  re-analizar todo, ignorando reportes de sesiones anteriores).
- Tests contra el **binario real** de `forge614-engines` (ya instalado en
  esta máquina) y **Engram real** en directorios temporales — sin mocks,
  mismo principio que los Planes 1 y 2.
- No se toca `forge614-engines` ni `forge614-engram` en este plan.

---

### Task 1: Ruta del binario de Engines

**Files:**
- Create: `src/modules/engines-client/binary-path.ts`
- Test: `src/modules/engines-client/binary-path.test.ts`

**Interfaces:**
- Produces: `resolveEnginesBinaryPath(platform: NodeJS.Platform, home: string): string` — consumida por Task 2, Task 3, y la capa CLI (Task 7).

- [x] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test } from "bun:test";
import { resolveEnginesBinaryPath } from "./binary-path";

describe("resolveEnginesBinaryPath", () => {
  test("resolves the stable launcher path on macOS/Linux (posix separators)", () => {
    expect(resolveEnginesBinaryPath("darwin", "/Users/jane")).toBe(
      "/Users/jane/.forge614/engines/bin/forge614-engines",
    );
    expect(resolveEnginesBinaryPath("linux", "/home/jane")).toBe(
      "/home/jane/.forge614/engines/bin/forge614-engines",
    );
  });

  test("adds the .exe suffix and uses backslash separators on Windows", () => {
    expect(resolveEnginesBinaryPath("win32", "C:\\Users\\jane")).toBe(
      "C:\\Users\\jane\\.forge614\\engines\\bin\\forge614-engines.exe",
    );
  });
});
```

- [x] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/engines-client/binary-path.test.ts`
Expected: FAIL con "Cannot find module './binary-path'".

- [x] **Step 3: Escribir la implementación**

**Ojo:** se usa `path.win32.join`/`path.posix.join` explícitos según el
parámetro `platform` — NO el `join` genérico de `node:path` (que siempre
usa el separador del sistema operativo ANFITRIÓN, sin importar qué
`platform` se le pase como argumento). Usar el genérico haría que este
mismo test fallara al correr en un CI de un sistema operativo distinto al
que se está simulando — exactamente el tipo de bug que `forge614-engines`
ya tuvo que corregir en su propia suite.

```typescript
import { win32, posix } from "node:path";

export function resolveEnginesBinaryPath(platform: NodeJS.Platform, home: string): string {
  const name = platform === "win32" ? "forge614-engines.exe" : "forge614-engines";
  const join = platform === "win32" ? win32.join : posix.join;
  return join(home, ".forge614", "engines", "bin", name);
}
```

- [x] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/engines-client/binary-path.test.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Commit**

```bash
git add src/modules/engines-client/binary-path.ts src/modules/engines-client/binary-path.test.ts
git commit -m "feat: resolve the fixed forge614-engines binary path per platform"
```

---

### Task 2: Cliente de detección de agentes

**Files:**
- Create: `src/modules/engines-client/detect.ts`
- Test: `src/modules/engines-client/detect.test.ts`

**Interfaces:**
- Consumes: `resolveEnginesBinaryPath` de `./binary-path`.
- Produces: `interface AgentDetection { id: string; label: string;
  installed: boolean; executable?: string; configDir: string; configFound:
  boolean }` y `detectAgents(binaryPath: string): AgentDetection[]` —
  consumida por Task 4 (resolve-engine) y Task 6 (init).

- [x] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { detectAgents } from "./detect";
import { resolveEnginesBinaryPath } from "./binary-path";

// Estos tests requieren forge614-engines instalado en la ruta fija del
// ecosistema (confirmado presente en esta máquina de desarrollo).
const binaryPath = resolveEnginesBinaryPath(process.platform, homedir());

describe("detectAgents", () => {
  test("reports installed agents from the real forge614-engines binary", () => {
    const agents = detectAgents(binaryPath);

    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      expect(typeof agent.id).toBe("string");
      expect(typeof agent.installed).toBe("boolean");
      expect(typeof agent.configDir).toBe("string");
      expect(typeof agent.configFound).toBe("boolean");
    }
  });

  test("throws a clear error when the binary path does not exist", () => {
    expect(() => detectAgents("/nonexistent/forge614-engines")).toThrow();
  });
});
```

- [x] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/engines-client/detect.test.ts`
Expected: FAIL con "Cannot find module './detect'".

- [x] **Step 3: Escribir la implementación**

```typescript
import { spawnSync } from "node:child_process";

export interface AgentDetection {
  id: string;
  label: string;
  installed: boolean;
  executable?: string;
  configDir: string;
  configFound: boolean;
}

export function detectAgents(binaryPath: string): AgentDetection[] {
  const result = spawnSync(binaryPath, ["detect"], { encoding: "utf8" });

  if (result.error || result.status !== 0) {
    const detail = result.stderr?.trim() || result.error?.message || `exit code ${result.status}`;
    throw new Error(`forge614-engines detect failed: ${detail}`);
  }

  const parsed = JSON.parse(result.stdout) as { agents: AgentDetection[] };
  return parsed.agents;
}
```

- [x] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/engines-client/detect.test.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Commit**

```bash
git add src/modules/engines-client/detect.ts src/modules/engines-client/detect.test.ts
git commit -m "feat: detect installed AI agents via the real forge614-engines binary"
```

---

### Task 3: Cliente de capacidades

**Files:**
- Create: `src/modules/engines-client/capabilities.ts`
- Test: `src/modules/engines-client/capabilities.test.ts`

**Interfaces:**
- Consumes: `resolveEnginesBinaryPath` de `./binary-path`.
- Produces: `interface Capabilities { id: string; label: string;
  supportsMcp: boolean; supportsHooks: boolean; supportsHeadlessExec:
  boolean }` y `getCapabilities(binaryPath: string, agentId: string):
  Capabilities` — consumida por Task 4 y Task 6.

- [x] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { getCapabilities } from "./capabilities";
import { resolveEnginesBinaryPath } from "./binary-path";

const binaryPath = resolveEnginesBinaryPath(process.platform, homedir());

describe("getCapabilities", () => {
  test("reports supportsHeadlessExec for claude-code from the real binary", () => {
    const capabilities = getCapabilities(binaryPath, "claude-code");

    expect(capabilities.id).toBe("claude-code");
    expect(typeof capabilities.supportsMcp).toBe("boolean");
    expect(typeof capabilities.supportsHooks).toBe("boolean");
    expect(typeof capabilities.supportsHeadlessExec).toBe("boolean");
  });

  test("throws a clear error for an unknown agent id", () => {
    expect(() => getCapabilities(binaryPath, "not-a-real-agent")).toThrow();
  });
});
```

- [x] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/engines-client/capabilities.test.ts`
Expected: FAIL con "Cannot find module './capabilities'".

- [x] **Step 3: Escribir la implementación**

```typescript
import { spawnSync } from "node:child_process";

export interface Capabilities {
  id: string;
  label: string;
  supportsMcp: boolean;
  supportsHooks: boolean;
  supportsHeadlessExec: boolean;
}

export function getCapabilities(binaryPath: string, agentId: string): Capabilities {
  const result = spawnSync(binaryPath, ["capabilities", "--agent", agentId], { encoding: "utf8" });

  if (result.error || result.status !== 0) {
    const detail = result.stderr?.trim() || result.error?.message || `exit code ${result.status}`;
    throw new Error(`forge614-engines capabilities failed for ${agentId}: ${detail}`);
  }

  return JSON.parse(result.stdout) as Capabilities;
}
```

- [x] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/engines-client/capabilities.test.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Commit**

```bash
git add src/modules/engines-client/capabilities.ts src/modules/engines-client/capabilities.test.ts
git commit -m "feat: query agent capabilities via the real forge614-engines binary"
```

---

### Task 4: Resolución de motor (función pura)

**Files:**
- Create: `src/modules/cli/resolve-engine.ts`
- Test: `src/modules/cli/resolve-engine.test.ts`

**Interfaces:**
- Consumes: `type AgentDetection` de `../engines-client/detect`; `type
  Capabilities` de `../engines-client/capabilities`.
- Produces: `type EngineResolution = { status: "resolved"; id: string;
  executable: string } | { status: "engine-ambiguous"; candidates: {
  id: string; executable: string }[] } | { status: "engine-unavailable" }
  | { status: "engine-invalid"; requestedId: string; candidates: { id:
  string; executable: string }[] }` y `resolveEngine(agents:
  AgentDetection[], capabilitiesById: Map<string, Capabilities>,
  requestedId?: string): EngineResolution` — consumida por Task 6 (init).

- [x] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test } from "bun:test";
import { resolveEngine } from "./resolve-engine";
import type { AgentDetection } from "../engines-client/detect";
import type { Capabilities } from "../engines-client/capabilities";

function agent(id: string, installed: boolean, executable?: string): AgentDetection {
  return { id, label: id, installed, executable, configDir: `/home/.${id}`, configFound: installed };
}

function capabilities(id: string, supportsHeadlessExec: boolean): Capabilities {
  return { id, label: id, supportsMcp: true, supportsHooks: true, supportsHeadlessExec };
}

describe("resolveEngine", () => {
  test("auto-resolves when exactly one installed agent supports headless exec", () => {
    const agents = [agent("claude-code", true, "/bin/claude"), agent("cursor", true, "/bin/cursor")];
    const capsById = new Map([
      ["claude-code", capabilities("claude-code", true)],
      ["cursor", capabilities("cursor", false)],
    ]);

    const result = resolveEngine(agents, capsById);

    expect(result).toEqual({ status: "resolved", id: "claude-code", executable: "/bin/claude" });
  });

  test("reports engine-unavailable when no installed agent supports headless exec", () => {
    const agents = [agent("cursor", true, "/bin/cursor")];
    const capsById = new Map([["cursor", capabilities("cursor", false)]]);

    expect(resolveEngine(agents, capsById)).toEqual({ status: "engine-unavailable" });
  });

  test("reports engine-ambiguous when two or more candidates support headless exec", () => {
    const agents = [agent("claude-code", true, "/bin/claude"), agent("codex", true, "/bin/codex")];
    const capsById = new Map([
      ["claude-code", capabilities("claude-code", true)],
      ["codex", capabilities("codex", true)],
    ]);

    const result = resolveEngine(agents, capsById);

    expect(result.status).toBe("engine-ambiguous");
    if (result.status === "engine-ambiguous") {
      expect(result.candidates).toEqual([
        { id: "claude-code", executable: "/bin/claude" },
        { id: "codex", executable: "/bin/codex" },
      ]);
    }
  });

  test("resolves to the explicitly requested engine when it is a valid candidate", () => {
    const agents = [agent("claude-code", true, "/bin/claude"), agent("codex", true, "/bin/codex")];
    const capsById = new Map([
      ["claude-code", capabilities("claude-code", true)],
      ["codex", capabilities("codex", true)],
    ]);

    const result = resolveEngine(agents, capsById, "codex");

    expect(result).toEqual({ status: "resolved", id: "codex", executable: "/bin/codex" });
  });

  test("reports engine-invalid when the requested engine is not a real candidate, even with only one real candidate", () => {
    const agents = [agent("claude-code", true, "/bin/claude")];
    const capsById = new Map([["claude-code", capabilities("claude-code", true)]]);

    const result = resolveEngine(agents, capsById, "not-a-real-engine");

    expect(result.status).toBe("engine-invalid");
    if (result.status === "engine-invalid") {
      expect(result.requestedId).toBe("not-a-real-engine");
      expect(result.candidates).toEqual([{ id: "claude-code", executable: "/bin/claude" }]);
    }
  });

  test("never proposes an agent that is not installed or lacks an executable path", () => {
    const agents = [agent("claude-code", false)];
    const capsById = new Map([["claude-code", capabilities("claude-code", true)]]);

    expect(resolveEngine(agents, capsById)).toEqual({ status: "engine-unavailable" });
  });
});
```

- [x] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/cli/resolve-engine.test.ts`
Expected: FAIL con "Cannot find module './resolve-engine'".

- [x] **Step 3: Escribir la implementación**

```typescript
import type { AgentDetection } from "../engines-client/detect";
import type { Capabilities } from "../engines-client/capabilities";

export type EngineResolution =
  | { status: "resolved"; id: string; executable: string }
  | { status: "engine-ambiguous"; candidates: { id: string; executable: string }[] }
  | { status: "engine-unavailable" }
  | { status: "engine-invalid"; requestedId: string; candidates: { id: string; executable: string }[] };

/**
 * Engines es siempre la fuente de verdad: incluso con requestedId, se
 * valida contra la lista real de candidatos (instalados + soporte
 * headless), nunca se confía el flag a ciegas.
 */
export function resolveEngine(
  agents: AgentDetection[],
  capabilitiesById: Map<string, Capabilities>,
  requestedId?: string,
): EngineResolution {
  const candidates = agents
    .filter(agent => agent.installed && agent.executable !== undefined)
    .filter(agent => capabilitiesById.get(agent.id)?.supportsHeadlessExec === true)
    .map(agent => ({ id: agent.id, executable: agent.executable! }));

  if (requestedId !== undefined) {
    const match = candidates.find(candidate => candidate.id === requestedId);
    if (match) return { status: "resolved", id: match.id, executable: match.executable };
    return { status: "engine-invalid", requestedId, candidates };
  }

  if (candidates.length === 1) {
    return { status: "resolved", id: candidates[0]!.id, executable: candidates[0]!.executable };
  }
  if (candidates.length === 0) {
    return { status: "engine-unavailable" };
  }
  return { status: "engine-ambiguous", candidates };
}
```

- [x] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/cli/resolve-engine.test.ts`
Expected: PASS (6 tests).

- [x] **Step 5: Commit**

```bash
git add src/modules/cli/resolve-engine.ts src/modules/cli/resolve-engine.test.ts
git commit -m "feat: resolve which detected engine to use for headless subagents"
```

---

### Task 5: Armado del plan de módulos pendientes

**Files:**
- Create: `src/modules/cli/build-run-plan.ts`
- Test: `src/modules/cli/build-run-plan.test.ts`

**Interfaces:**
- Consumes: `discoverModules` de `../scoring/discovery`;
  `computeCyclomaticComplexity` de `../scoring/cyclomatic`; `computeFanIn`
  de `../scoring/fan-in`; `computeChurn` de `../scoring/churn`;
  `computeTestCoverageGap` de `../scoring/test-coverage-gap`;
  `computeCompositeScores`, `type ModuleSignals` de
  `../scoring/composite-score`; `assignTiers`, `type Tier` de
  `../scoring/tiers`; `isModuleReportSaved` de `../memory/run-state`;
  `type MemoryStore` de `"forge614-engram"`.
- Produces: `interface RunPlanModule { name: string; tier: Tier }`,
  `interface RunPlanResult { modules: RunPlanModule[]; resumed: boolean }`,
  y `buildRunPlan(store: MemoryStore, projectId: string, directory:
  string, options: { skipCompleted: boolean }): RunPlanResult` —
  consumida por Task 6 (init).

**Detalle crítico de este task:** `isModuleReportSaved` filtra por
`projectId` (identidad del repo), no por sesión — un reporte de una
sesión anterior sigue siendo visible en una sesión nueva del mismo repo.
Por eso `skipCompleted` es un parámetro explícito: `true` para `init`
normal, `false` para `init --force` (que debe re-analizar todo sin
importar lo ya guardado).

- [x] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, startProjectSession } from "forge614-engram";
import { buildRunPlan } from "./build-run-plan";
import { recordModuleReport } from "../memory/module-report";

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

function realRepoWithAuth(): string {
  const root = mkdtempSync(join(tmpdir(), "atlas-runplan-repo-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "auth"), { recursive: true });
  writeFileSync(join(root, "auth", "login.ts"), "export const login = () => true;");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "add auth"]);
  return root;
}

function engramStore(engramRoot: string) {
  const workspace = new MemoryWorkspace(new WorkspaceConfig(engramRoot));
  workspace.init();
  const store = workspace.open();
  store.enableSessions();
  return store;
}

describe("buildRunPlan", () => {
  test("includes every discovered module when nothing was saved before", () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-runplan-fresh-"));
    const repo = realRepoWithAuth();
    const store = engramStore(engramRoot);
    const session = startProjectSession(store, repo, "atlas:test-runplan-fresh");

    const result = buildRunPlan(store, session.projectId, repo, { skipCompleted: true });

    expect(result.resumed).toBe(false);
    expect(result.modules.map(m => m.name)).toEqual(["auth"]);
    expect(result.modules[0]?.tier).toBe("profundo");

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  test("excludes a module whose report was already saved, and reports resumed", () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-runplan-resume-"));
    const repo = realRepoWithAuth();
    mkdirSync(join(repo, "billing"), { recursive: true });
    writeFileSync(join(repo, "billing", "charge.ts"), "export const charge = () => true;");
    const store = engramStore(engramRoot);
    const session = startProjectSession(store, repo, "atlas:test-runplan-resume");
    recordModuleReport(store, repo, session, "auth", "auth ya analizado");

    const result = buildRunPlan(store, session.projectId, repo, { skipCompleted: true });

    expect(result.resumed).toBe(true);
    expect(result.modules.map(m => m.name)).toEqual(["billing"]);

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  test("skipCompleted false includes every module even if already saved (force mode)", () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-runplan-force-"));
    const repo = realRepoWithAuth();
    const store = engramStore(engramRoot);
    const session = startProjectSession(store, repo, "atlas:test-runplan-force");
    recordModuleReport(store, repo, session, "auth", "auth ya analizado");

    const result = buildRunPlan(store, session.projectId, repo, { skipCompleted: false });

    expect(result.resumed).toBe(false);
    expect(result.modules.map(m => m.name)).toEqual(["auth"]);

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  test("returns an empty plan when no modules are discovered", () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-runplan-empty-"));
    const emptyRepo = mkdtempSync(join(tmpdir(), "atlas-runplan-emptyrepo-"));
    const store = engramStore(engramRoot);
    const session = startProjectSession(store, emptyRepo, "atlas:test-runplan-empty");

    const result = buildRunPlan(store, session.projectId, emptyRepo, { skipCompleted: true });

    expect(result).toEqual({ modules: [], resumed: false });

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(emptyRepo, { recursive: true, force: true });
  });
});
```

- [x] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/cli/build-run-plan.test.ts`
Expected: FAIL con "Cannot find module './build-run-plan'".

- [x] **Step 3: Escribir la implementación**

```typescript
import type { MemoryStore } from "forge614-engram";
import { discoverModules } from "../scoring/discovery";
import { computeCyclomaticComplexity } from "../scoring/cyclomatic";
import { computeFanIn } from "../scoring/fan-in";
import { computeChurn } from "../scoring/churn";
import { computeTestCoverageGap } from "../scoring/test-coverage-gap";
import { computeCompositeScores, type ModuleSignals } from "../scoring/composite-score";
import { assignTiers, type Tier } from "../scoring/tiers";
import { isModuleReportSaved } from "../memory/run-state";

export interface RunPlanModule {
  name: string;
  tier: Tier;
}

export interface RunPlanResult {
  modules: RunPlanModule[];
  resumed: boolean;
}

export function buildRunPlan(
  store: MemoryStore,
  projectId: string,
  directory: string,
  options: { skipCompleted: boolean },
): RunPlanResult {
  const modules = discoverModules(directory);
  if (modules.length === 0) {
    return { modules: [], resumed: false };
  }

  const cyclomatic = computeCyclomaticComplexity(modules);
  const fanIn = computeFanIn(modules);
  const churn = computeChurn(directory, modules);
  const testGap = computeTestCoverageGap(modules);

  const signals: ModuleSignals[] = modules.map(module => ({
    name: module.name,
    cyclomatic: cyclomatic.get(module.name) ?? 0,
    fanIn: fanIn.get(module.name) ?? 0,
    churn: churn.get(module.name) ?? 0,
    testGap: testGap.get(module.name) ?? 0,
  }));

  const tiered = assignTiers(computeCompositeScores(signals));

  const pending = options.skipCompleted
    ? tiered.filter(module => !isModuleReportSaved(store, projectId, module.name))
    : tiered;

  return {
    modules: pending.map(module => ({ name: module.name, tier: module.tier })),
    resumed: options.skipCompleted && pending.length < tiered.length,
  };
}
```

- [x] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/cli/build-run-plan.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add src/modules/cli/build-run-plan.ts src/modules/cli/build-run-plan.test.ts
git commit -m "feat: build the pending module plan, filtered by Engram completion state"
```

---

### Task 6: Orquestador `runInitCommand`

**Files:**
- Create: `src/modules/cli/init.ts`
- Test: `src/modules/cli/init.test.ts`

**Interfaces:**
- Consumes: `detectAgents` de `../engines-client/detect`;
  `getCapabilities` de `../engines-client/capabilities`; `resolveEngine`
  de `./resolve-engine`; `buildRunPlan` de `./build-run-plan`;
  `deriveForcedSessionId` de `../memory/session-id`;
  `startOrResumeSession` de `../memory/run-state`; `startProjectSession`,
  `type MemoryStore` de `"forge614-engram"`.
- Produces: `interface RunInitOptions { directory: string;
  enginesBinaryPath: string; requestedEngineId?: string; force: boolean }`,
  `type InitOutcome` (unión discriminada, ver Step 3), y
  `runInitCommand(store: MemoryStore, options: RunInitOptions):
  InitOutcome` — consumida por Task 7 (capa CLI).

**Decisión de diseño de este task:** `enginesBinaryPath` es un parámetro
de entrada (no se resuelve internamente con `resolveEnginesBinaryPath` +
`homedir()`) — así este orquestador es 100% testeable con inyección de
dependencias, incluyendo el caso de "binario inalcanzable", sin tener que
tocar la instalación real del sistema. La capa CLI (Task 7) es quien
resuelve la ruta real y se la pasa.

- [x] **Step 1: Escribir la prueba que falla**

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, startProjectSession } from "forge614-engram";
import { runInitCommand } from "./init";
import { resolveEnginesBinaryPath } from "../engines-client/binary-path";
import { deriveSessionId } from "../memory/session-id";
import { recordModuleReport } from "../memory/module-report";

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

function realRepoWithAuth(): string {
  const root = mkdtempSync(join(tmpdir(), "atlas-init-repo-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "auth"), { recursive: true });
  writeFileSync(join(root, "auth", "login.ts"), "export const login = () => true;");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "add auth"]);
  return root;
}

function engramStore(engramRoot: string) {
  const workspace = new MemoryWorkspace(new WorkspaceConfig(engramRoot));
  workspace.init();
  const store = workspace.open();
  store.enableSessions();
  return store;
}

// Estos tests requieren forge614-engines instalado en la ruta fija del
// ecosistema, con Claude Code también instalado y con soporte headless
// (ambos confirmados presentes en esta máquina de desarrollo).
const enginesBinaryPath = resolveEnginesBinaryPath(process.platform, homedir());

describe("runInitCommand", () => {
  test("resolves the requested engine, starts a fresh session, and returns the pending module plan", () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-init-fresh-"));
    const repo = realRepoWithAuth();
    const store = engramStore(engramRoot);

    const outcome = runInitCommand(store, {
      directory: repo, enginesBinaryPath, requestedEngineId: "claude-code", force: false,
    });

    expect(outcome.status).toBe("ready");
    if (outcome.status === "ready") {
      expect(outcome.engine.id).toBe("claude-code");
      expect(outcome.session.resumed).toBe(false);
      expect(outcome.modules.map(m => m.name)).toEqual(["auth"]);
    }

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  test("a repo whose session was already closed reports already-complete", () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-init-done-"));
    const repo = realRepoWithAuth();
    const store = engramStore(engramRoot);
    const sessionId = deriveSessionId(repo);
    const session = startProjectSession(store, repo, sessionId);
    store.endSession(session.projectId, session.sessionId);

    const outcome = runInitCommand(store, {
      directory: repo, enginesBinaryPath, requestedEngineId: "claude-code", force: false,
    });

    expect(outcome.status).toBe("already-complete");

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  test("force re-analyzes everything, in a new session, even when the previous one is closed", () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-init-force-"));
    const repo = realRepoWithAuth();
    const store = engramStore(engramRoot);
    const sessionId = deriveSessionId(repo);
    const session = startProjectSession(store, repo, sessionId);
    recordModuleReport(store, repo, session, "auth", "ya analizado antes");
    store.endSession(session.projectId, session.sessionId);

    const outcome = runInitCommand(store, {
      directory: repo, enginesBinaryPath, requestedEngineId: "claude-code", force: true,
    });

    expect(outcome.status).toBe("ready");
    if (outcome.status === "ready") {
      expect(outcome.session.sessionId).not.toBe(sessionId);
      expect(outcome.modules.map(m => m.name)).toEqual(["auth"]);
    }

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  test("returns engine-invalid when the requested engine is not a real candidate", () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-init-invalid-"));
    const repo = realRepoWithAuth();
    const store = engramStore(engramRoot);

    const outcome = runInitCommand(store, {
      directory: repo, enginesBinaryPath, requestedEngineId: "not-a-real-engine", force: false,
    });

    expect(outcome.status).toBe("engine-invalid");
    if (outcome.status === "engine-invalid") {
      expect(outcome.requestedId).toBe("not-a-real-engine");
    }

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  test("returns an ENGINES_UNREACHABLE error when the Engines binary path is invalid", () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-init-unreachable-"));
    const repo = realRepoWithAuth();
    const store = engramStore(engramRoot);

    const outcome = runInitCommand(store, {
      directory: repo, enginesBinaryPath: "/nonexistent/forge614-engines",
      requestedEngineId: "claude-code", force: false,
    });

    expect("error" in outcome).toBe(true);
    if ("error" in outcome) {
      expect(outcome.error.code).toBe("ENGINES_UNREACHABLE");
    }

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });
});
```

- [x] **Step 2: Correr la prueba para confirmar que falla**

Run: `bun test src/modules/cli/init.test.ts`
Expected: FAIL con "Cannot find module './init'".

- [x] **Step 3: Escribir la implementación**

```typescript
import { startProjectSession, type MemoryStore } from "forge614-engram";
import { detectAgents, type AgentDetection } from "../engines-client/detect";
import { getCapabilities, type Capabilities } from "../engines-client/capabilities";
import { resolveEngine } from "./resolve-engine";
import { deriveForcedSessionId } from "../memory/session-id";
import { startOrResumeSession } from "../memory/run-state";
import { buildRunPlan } from "./build-run-plan";

export interface RunInitOptions {
  directory: string;
  enginesBinaryPath: string;
  requestedEngineId?: string;
  force: boolean;
}

export type InitOutcome =
  | {
      schemaVersion: 1;
      status: "ready";
      engine: { id: string; executable: string };
      session: { sessionId: string; resumed: boolean };
      modules: { name: string; tier: "ligero" | "estandar" | "profundo" }[];
    }
  | { schemaVersion: 1; status: "already-complete" }
  | { schemaVersion: 1; status: "engine-ambiguous"; candidates: { id: string; executable: string }[] }
  | { schemaVersion: 1; status: "engine-unavailable" }
  | { schemaVersion: 1; status: "engine-invalid"; requestedId: string; candidates: { id: string; executable: string }[] }
  | { schemaVersion: 1; error: { code: "ENGINES_UNREACHABLE"; message: string } };

function unreachable(error: unknown): InitOutcome {
  return {
    schemaVersion: 1,
    error: { code: "ENGINES_UNREACHABLE", message: error instanceof Error ? error.message : String(error) },
  };
}

export function runInitCommand(store: MemoryStore, options: RunInitOptions): InitOutcome {
  let agents: AgentDetection[];
  try {
    agents = detectAgents(options.enginesBinaryPath);
  } catch (error) {
    return unreachable(error);
  }

  const capabilitiesById = new Map<string, Capabilities>();
  try {
    for (const agent of agents) {
      if (!agent.installed) continue;
      capabilitiesById.set(agent.id, getCapabilities(options.enginesBinaryPath, agent.id));
    }
  } catch (error) {
    return unreachable(error);
  }

  const resolution = resolveEngine(agents, capabilitiesById, options.requestedEngineId);
  if (resolution.status !== "resolved") {
    return { schemaVersion: 1, ...resolution };
  }
  const engine = { id: resolution.id, executable: resolution.executable };

  if (options.force) {
    const sessionId = deriveForcedSessionId(options.directory);
    const session = startProjectSession(store, options.directory, sessionId);
    const plan = buildRunPlan(store, session.projectId, options.directory, { skipCompleted: false });
    return {
      schemaVersion: 1,
      status: "ready",
      engine,
      session: { sessionId: session.sessionId, resumed: false },
      modules: plan.modules,
    };
  }

  const runState = startOrResumeSession(store, options.directory);
  if (runState.status === "already-complete") {
    return { schemaVersion: 1, status: "already-complete" };
  }

  const plan = buildRunPlan(store, runState.session.projectId, options.directory, { skipCompleted: true });
  return {
    schemaVersion: 1,
    status: "ready",
    engine,
    session: { sessionId: runState.session.sessionId, resumed: plan.resumed },
    modules: plan.modules,
  };
}
```

- [x] **Step 4: Correr la prueba para confirmar que pasa**

Run: `bun test src/modules/cli/init.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git add src/modules/cli/init.ts src/modules/cli/init.test.ts
git commit -m "feat: orchestrate engine resolution, Engram session state, and the module plan"
```

---

### Task 7: Capa CLI (`main.ts` / `commands.ts`)

**Files:**
- Create: `src/interfaces/cli/commands.ts`
- Create: `src/interfaces/cli/main.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `runInitCommand` de `../../modules/cli/init`;
  `resolveEnginesBinaryPath` de `../../modules/engines-client/binary-path`;
  `MemoryWorkspace`, `WorkspaceConfig` de `"forge614-engram"`.
- Produces: el binario ejecutable `forge614-atlas init` (vía `bun run
  ./src/interfaces/cli/main.ts` en desarrollo, o compilado con `bun run
  build`).

**Sin test automatizado en este task** — es la capa delgada que conecta
todo con el mundo real (Engram real del usuario en `~/.forge614/engram/`,
no un directorio temporal). Automatizar esto significaría o tocar la base
de datos real del usuario en la suite de tests, o inyectar tantas
dependencias que dejaría de ser "la capa delgada de verdad" — mismo
criterio que ya siguen `forge614-engines`/`forge614-engram` para sus
propios `main.ts`/`commands.ts`. Se verifica manualmente en el Step 4.

- [x] **Step 1: Escribir `src/interfaces/cli/commands.ts`**

```typescript
import { homedir } from "node:os";
import { MemoryWorkspace, WorkspaceConfig } from "forge614-engram";
import { resolveEnginesBinaryPath } from "../../modules/engines-client/binary-path";
import { runInitCommand } from "../../modules/cli/init";

export function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

export function runInit(directory: string, requestedEngineId: string | undefined, force: boolean): void {
  const workspace = new MemoryWorkspace();
  workspace.init();
  const store = workspace.open();
  try {
    const enginesBinaryPath = resolveEnginesBinaryPath(process.platform, homedir());
    const outcome = runInitCommand(store, { directory, enginesBinaryPath, requestedEngineId, force });
    printJson(outcome);
    if ("error" in outcome) process.exitCode = 1;
  } finally {
    store.close();
  }
}
```

- [x] **Step 2: Escribir `src/interfaces/cli/main.ts`**

```typescript
#!/usr/bin/env bun
import { runInit } from "./commands";

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "init") {
    const engine = flag(rest, "--engine");
    const force = rest.includes("--force");
    runInit(process.cwd(), engine, force);
    return;
  }

  console.log(
    JSON.stringify(
      { schemaVersion: 1, error: { code: "UNKNOWN_COMMAND", message: `Unknown command: ${process.argv.slice(2).join(" ")}` } },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}

main();
```

- [x] **Step 3: Agregar el script de build a `package.json`**

Agrega esta línea dentro de `"scripts"`:

```json
    "build": "bun build ./src/interfaces/cli/main.ts --compile --outfile dist/forge614-atlas"
```

- [x] **Step 4: Verificación manual (no hay test automatizado)**

Corre esto en una carpeta de prueba (NO en `forge614-atlas` mismo, para no
tocar su propia sesión de Engram):

```bash
cd /tmp && mkdir -p atlas-manual-check/src/demo && cd atlas-manual-check
git init -q && git config user.email "test@example.com" && git config user.name "Test"
echo 'export const x = 1;' > src/demo/index.ts
git add . && git commit -q -m "demo"
bun run --cwd /Users/jorgeetrejoo/Desktop/forge614-atlas src/interfaces/cli/main.ts init --engine claude-code
```

Expected: un JSON con `"status": "ready"`, `"engine": {"id": "claude-code", ...}`,
y `"modules"` listando el módulo `demo`.

Corre de nuevo el mismo comando sin `--force`:

```bash
bun run --cwd /Users/jorgeetrejoo/Desktop/forge614-atlas src/interfaces/cli/main.ts init --engine claude-code
```

Expected: mismo `sessionId` que la corrida anterior, `"resumed"` sigue en
`false` (nada se guardó todavía — comportamiento esperado y documentado en
el spec, sección 4).

Limpia después: `rm -rf /tmp/atlas-manual-check`.

- [x] **Step 5: Commit**

```bash
git add src/interfaces/cli/commands.ts src/interfaces/cli/main.ts package.json
git commit -m "feat: add the forge614-atlas init CLI entrypoint"
```

---

### Task 8: Exponer todo en el barrel público y correr la suite completa

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Produces: superficie pública final de este plan.

- [x] **Step 1: Agregar los exports al barrel**

Agrega esto a `src/index.ts`, después de los exports existentes del Plan 2:

```typescript
// 9. Módulo Cliente de Engines (Detección y Capacidades)
export { detectAgents } from "./modules/engines-client/detect";
export type { AgentDetection } from "./modules/engines-client/detect";
export { getCapabilities } from "./modules/engines-client/capabilities";
export type { Capabilities } from "./modules/engines-client/capabilities";
export { resolveEnginesBinaryPath } from "./modules/engines-client/binary-path";

// 10. Módulo de Núcleo del CLI (Resolución de Motor y Plan de Corrida)
export { resolveEngine } from "./modules/cli/resolve-engine";
export type { EngineResolution } from "./modules/cli/resolve-engine";
export { buildRunPlan } from "./modules/cli/build-run-plan";
export type { RunPlanModule, RunPlanResult } from "./modules/cli/build-run-plan";
export { runInitCommand } from "./modules/cli/init";
export type { RunInitOptions, InitOutcome } from "./modules/cli/init";
```

- [x] **Step 2: Correr la suite completa**

Run: `bun test`
Expected: PASS (todos los tests de Tasks 1–6 de este plan, más los del
Plan 1 y Plan 2, sin fallos).

- [x] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: sin errores.

- [x] **Step 4: Build**

Run: `bun run build`
Expected: genera `dist/forge614-atlas` sin errores.

- [x] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: expose Atlas CLI core (engine resolution, run plan) from the public barrel"
```
