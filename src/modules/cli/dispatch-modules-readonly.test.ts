/**
 * Prueba el candado de solo lectura de `dispatchModules` con un Workers FALSO: que toda tarea salga con
 * `readOnly: true` y qué pasa cuando Workers se niega a correr por falta de ese candado.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, startProjectSession, type MemoryStore, type Session } from "forge614-engram";
import { dispatchModules } from "./dispatch-modules";
import { makeFakeDir, runCompletedEvent, writeFakeWorkers } from "./fake-binaries.testkit";
import { isModuleReportSaved, startOrResumeSession } from "../memory/run-state";
import { deriveSessionId } from "../memory/session-id";

const engine = { id: "claude-code", executable: "/bin/claude" };
const modules = [
  { name: "auth", tier: "profundo" as const },
  { name: "billing", tier: "ligero" as const },
];

/**
 * Arma las capacidades (qué sabe hacer el motor) de un `claude-code` que sí soporta solo lectura.
 * @param supportsReasoningLevel Si el motor acepta nivel de razonamiento; decide si las tareas llevan ese campo.
 * @returns El objeto de capacidades de `claude-code`: `supportsReasoningLevel` con el valor dado y los demás indicadores `supports…` (Mcp, Hooks, HeadlessExec, ReadOnly) en `true`.
 */
function capabilities(supportsReasoningLevel: boolean) {
  return {
    id: "claude-code", label: "Claude Code", supportsMcp: true, supportsHooks: true,
    supportsHeadlessExec: true, supportsReasoningLevel, supportsReadOnly: true,
  };
}

/**
 * Evento `task_failed` de Workers con el stderr dado.
 * @param taskId Nombre del módulo cuya tarea falló (el id de la tarea es el nombre del módulo).
 * @param stderr Texto de error (stderr, la salida de errores del programa) que trae el evento; es lo que
 * `dispatchModules` mira para distinguir la negativa de solo lectura de un fallo común.
 * @returns El evento, con `reason: "engine_unsupported"`, sin salida normal y sin truncar.
 */
function taskFailed(taskId: string, stderr: string): object {
  return {
    event: "task_failed", taskId, reason: "engine_unsupported", exitCode: null,
    stdout: "", stdoutBytes: 0, stdoutTruncated: false,
    stderr, stderrBytes: stderr.length, stderrTruncated: false,
  };
}

/** Pruebas de despacho que no necesitan Workers, Engines ni motores reales: todo es FALSO y temporal. */
describe("dispatchModules with a fake Workers", () => {
  let projectDir: string;
  let engramDir: string;
  let fakeDir: string;
  let store: MemoryStore;
  let session: Session;

  beforeEach(() => {
    projectDir = makeFakeDir("atlas-dispatch-ro-project-");
    mkdirSync(join(projectDir, "auth"), { recursive: true });
    writeFileSync(join(projectDir, "auth", "login.ts"), "export const login = () => true;");
    mkdirSync(join(projectDir, "billing"), { recursive: true });
    writeFileSync(join(projectDir, "billing", "invoice.ts"), "export const invoice = () => 1;");
    engramDir = makeFakeDir("atlas-dispatch-ro-engram-");
    fakeDir = makeFakeDir("atlas-dispatch-ro-fake-");
    const workspace = new MemoryWorkspace(new WorkspaceConfig(engramDir));
    workspace.init();
    store = workspace.open();
    store.enableSessions();
    session = startProjectSession(store, projectDir, deriveSessionId(projectDir));
  });

  afterEach(() => {
    store.close();
    for (const dir of [projectDir, engramDir, fakeDir]) rmSync(dir, { recursive: true, force: true });
  });

  // Lee el archivo donde el Workers falso guardó lo que recibió por stdin (el lote en JSON) y lo convierte en objeto.
  function sentTasks(stdinFile: string): { enginesBin: string; tasks: Record<string, unknown>[] } {
    return JSON.parse(readFileSync(stdinFile, "utf8"));
  }

  /**
   * Lo que Workers recibe: ambas tareas con `readOnly: true`, en orden profundo y luego ligero, con el modelo y el
   * razonamiento de la tabla (opus/medium y haiku/low) y la ruta de Engines tal cual; protege el candado de solo lectura.
   */
  test("sends readOnly: true in EVERY task, with the table's model and reasoning level for claude-code", async () => {
    const workers = writeFakeWorkers(fakeDir, { versionOutput: "forge614-workers 1.0.0", events: [runCompletedEvent(2)] });

    const result = await dispatchModules(store, projectDir, session, workers.path, "/fake/engines", engine, capabilities(true), modules);

    expect(result.status).toBe("completed");
    const sent = sentTasks(workers.stdinFile);
    expect(sent.enginesBin).toBe("/fake/engines");
    const summary: unknown = sent.tasks.map(({ prompt, ...rest }) => ({ ...rest, promptIsText: typeof prompt === "string" }));
    expect(summary).toEqual([
      {
        id: "auth", agentId: "claude-code", executable: "/bin/claude", promptIsText: true,
        readableDir: projectDir, readOnly: true, model: "claude-opus-5", reasoningLevel: "medium",
      },
      {
        id: "billing", agentId: "claude-code", executable: "/bin/claude", promptIsText: true,
        readableDir: projectDir, readOnly: true, model: "claude-haiku-4-5-20251001", reasoningLevel: "low",
      },
    ]);
  });

  /**
   * Si las capacidades dicen que no hay nivel de razonamiento, las dos tareas siguen con `readOnly: true` pero
   * sin el campo `reasoningLevel`; protege que quitar el razonamiento nunca arrastre el candado de solo lectura.
   */
  test("still sends readOnly: true, and no reasoning level, when the engine does not report reasoning support", async () => {
    const workers = writeFakeWorkers(fakeDir, { versionOutput: "forge614-workers 1.0.0", events: [runCompletedEvent(2)] });

    await dispatchModules(store, projectDir, session, workers.path, "/fake/engines", engine, capabilities(false), modules);

    const sent = sentTasks(workers.stdinFile);
    expect(sent.tasks.map(task => task.readOnly)).toEqual([true, true]);
    expect(sent.tasks.map(task => "reasoningLevel" in task)).toEqual([false, false]);
  });

  /**
   * Dos `task_failed` cuyo stderr empieza con `READ_ONLY_UNSUPPORTED` hacen que el resultado sea exactamente
   * `read_only_unsupported`, sin reporte guardado para `auth` y con la sesión aún abierta; protege que esa negativa no se
   * trate como módulos omitidos ni cierre la corrida.
   */
  test("a READ_ONLY_UNSUPPORTED rejection is not counted as a skipped module: it ends as read_only_unsupported", async () => {
    const stderr = 'READ_ONLY_UNSUPPORTED: Engines does not guarantee read-only execution for agent "claude-code"; the task was not run';
    const workers = writeFakeWorkers(fakeDir, {
      versionOutput: "forge614-workers 1.0.0",
      events: [taskFailed("auth", stderr), taskFailed("billing", stderr), runCompletedEvent(2)],
    });

    const result = await dispatchModules(store, projectDir, session, workers.path, "/fake/engines", engine, capabilities(true), modules);

    expect(result).toEqual({ status: "read_only_unsupported" });
    expect(isModuleReportSaved(store, session.projectId, "auth")).toBe(false);
    // La sesión sigue abierta: el análisis no se dio por terminado.
    expect(startOrResumeSession(store, projectDir).status).toBe("active");
  });

  /**
   * Dos `task_failed` con un stderr común («claude exited with code 1») sí cuentan como módulos omitidos y el lote
   * termina `completed` con ambos en `skippedModuleNames`; protege la distinción frente al fallo de solo lectura.
   */
  test("any other task_failed is still a skipped module and the batch completes", async () => {
    const workers = writeFakeWorkers(fakeDir, {
      versionOutput: "forge614-workers 1.0.0",
      events: [taskFailed("auth", "claude exited with code 1"), taskFailed("billing", "claude exited with code 1"), runCompletedEvent(2)],
    });

    const result = await dispatchModules(store, projectDir, session, workers.path, "/fake/engines", engine, capabilities(true), modules);

    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("unreachable");
    expect(result.report.analyzedModuleNames).toEqual([]);
    expect(result.report.skippedModuleNames).toEqual(["auth", "billing"]);
  });
});
