import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, startProjectSession, type MemoryStore, type Session } from "forge614-engram";
import { dispatchModules } from "./dispatch-modules";
import { makeFakeDir, runCompletedEvent, writeFakeWorkers } from "./fake-binaries.testkit";
import { isModuleReportSaved } from "../memory/run-state";
import { deriveSessionId } from "../memory/session-id";

const engine = { id: "claude-code", executable: "/bin/claude" };
const capabilities = {
  id: "claude-code", label: "Claude Code", supportsMcp: true, supportsHooks: true,
  supportsHeadlessExec: true, supportsReasoningLevel: true, supportsReadOnly: true,
};
const modules = [
  { name: "auth", tier: "profundo" as const },
  { name: "billing", tier: "ligero" as const },
];

// Texto de ejemplo armado en partes, como hacen las pruebas de Engram, para que el archivo no
// contenga un secreto literal. Engram 1.8.x lo rechaza con SECRET_REJECTED al guardarlo.
const secretText = ["pass", "word = ", "hunter2hunter2"].join("");

/** Evento `task_completed` de Workers con la salida dada. */
function taskCompleted(taskId: string, stdout: string): object {
  return {
    event: "task_completed", taskId, exitCode: 0, durationMs: 10,
    stdout, stdoutBytes: stdout.length, stdoutTruncated: false,
    stderr: "", stderrBytes: 0, stderrTruncated: false,
  };
}

/** Un reporte que Engram rechaza como secreto no tumba el lote: ese módulo se omite y se dice por qué. */
describe("dispatchModules with a report that Engram rejects as a secret", () => {
  let projectDir: string;
  let engramDir: string;
  let fakeDir: string;
  let store: MemoryStore;
  let session: Session;

  beforeEach(() => {
    projectDir = makeFakeDir("atlas-dispatch-secret-project-");
    mkdirSync(join(projectDir, "auth"), { recursive: true });
    writeFileSync(join(projectDir, "auth", "login.ts"), "export const login = () => true;");
    mkdirSync(join(projectDir, "billing"), { recursive: true });
    writeFileSync(join(projectDir, "billing", "invoice.ts"), "export const invoice = () => 1;");
    engramDir = makeFakeDir("atlas-dispatch-secret-engram-");
    fakeDir = makeFakeDir("atlas-dispatch-secret-fake-");
    const workspace = new MemoryWorkspace(new WorkspaceConfig(engramDir));
    workspace.init();
    store = workspace.open();
    store.enableSessions();
    session = startProjectSession(store, projectDir, deriveSessionId(projectDir));
  });

  afterEach(() => {
    try {
      store.close();
    } catch {
      // La prueba de errores ajenos ya cerró la base a propósito.
    }
    for (const dir of [projectDir, engramDir, fakeDir]) rmSync(dir, { recursive: true, force: true });
  });

  test("skips only that module, saves the others, lists it apart and finishes the batch", async () => {
    const workers = writeFakeWorkers(fakeDir, {
      versionOutput: "forge614-workers 1.0.0",
      events: [taskCompleted("auth", secretText), taskCompleted("billing", "Billing creates invoices."), runCompletedEvent(2)],
    });

    const result = await dispatchModules(store, projectDir, session, workers.path, "/fake/engines", engine, capabilities, modules);

    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("unreachable");
    expect(result.report.analyzedModuleNames).toEqual(["billing"]);
    expect(result.report.skippedModuleNames).toEqual(["auth"]);
    expect(result.report.rejectedReportModuleNames).toEqual(["auth"]);
    expect(isModuleReportSaved(store, session.projectId, "billing")).toBe(true);
    expect(isModuleReportSaved(store, session.projectId, "auth")).toBe(false);
    // El secreto nunca llega al reporte que Atlas imprime.
    expect(JSON.stringify(result.report)).not.toContain("hunter2");
  });

  test("a batch with no rejected report lists no rejected modules", async () => {
    const workers = writeFakeWorkers(fakeDir, {
      versionOutput: "forge614-workers 1.0.0",
      events: [taskCompleted("auth", "Auth logs people in."), taskCompleted("billing", "Billing creates invoices."), runCompletedEvent(2)],
    });

    const result = await dispatchModules(store, projectDir, session, workers.path, "/fake/engines", engine, capabilities, modules);

    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("unreachable");
    expect(result.report.rejectedReportModuleNames).toEqual([]);
    expect(result.report.skippedModuleNames).toEqual([]);
  });

  test("any other error while saving a report still propagates and is not swallowed", async () => {
    const workers = writeFakeWorkers(fakeDir, {
      versionOutput: "forge614-workers 1.0.0",
      events: [taskCompleted("auth", "Auth logs people in."), runCompletedEvent(1)],
    });
    store.close();

    await expect(
      dispatchModules(store, projectDir, session, workers.path, "/fake/engines", engine, capabilities, [modules[0]!]),
    ).rejects.toThrow('onEvent handler threw while processing a "task_completed" event');
  });
});
