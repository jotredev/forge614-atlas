/** Comprueba el resumen y cierre de una corrida completa, con módulos saltados y reportes rechazados. */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, startProjectSession } from "forge614-engram";
import { finalizeRun, type FinalReport } from "./finalize-run";

/**
 * Prepara una base temporal y abre la sesión que `finalizeRun` debe cerrar.
 * @param root Carpeta temporal de la base de memoria.
 * @param repoDir Carpeta temporal del proyecto de prueba.
 * @param sessionId Identificador de sesión usado por el escenario.
 * @returns Base abierta y sesión recién iniciada.
 */
function freshSession(root: string, repoDir: string, sessionId: string) {
  const workspace = new MemoryWorkspace(new WorkspaceConfig(root));
  workspace.init();
  const store = workspace.open();
  store.enableSessions();
  const session = startProjectSession(store, repoDir, sessionId);
  return { store, session };
}

/** Comprueba qué queda guardado al cerrar una sesión con distintos resultados de módulos. */
describe("finalizeRun", () => {
  /** Comprueba que la sesión tenga fecha de cierre y que su resumen incluya `mi-repo`. */
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
      skippedModuleNames: [],
    };

    finalizeRun(store, session, report);

    const closed = store.getSession(session.projectId, session.sessionId);
    if (!closed) throw new Error("expected the session to still exist after finalizeRun");
    expect(closed.endedAt).not.toBeNull();

    const summary = store.getByTopic(session.projectId, `session/${session.sessionId}/summary`);
    expect(summary).not.toBeNull();
    expect(summary?.content).toContain("mi-repo");

    store.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  /** Comprueba que `billing` aparezca en el resumen de una corrida con módulos saltados. */
  test("nextSteps lists skipped modules when the run had failures or permanent skips", () => {
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
      skippedModuleNames: ["billing"],
    };

    finalizeRun(store, session, report);

    const summary = store.getByTopic(session.projectId, `session/${session.sessionId}/summary`);
    expect(summary?.content).toContain("billing");

    expect(store.getSession(session.projectId, session.sessionId)?.endedAt).not.toBeNull();

    store.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  /** Comprueba que el resumen enumere `billing, payments` y atribuya a `payments` el rechazo por secreto. */
  test("nextSteps says why a module was skipped when Engram rejected its report as a secret", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-finalize-rejected-"));
    const repoDir = mkdtempSync(join(tmpdir(), "atlas-finalize-rejected-repo-"));
    const { store, session } = freshSession(root, repoDir, "atlas:test-finalize-rejected");

    const report: FinalReport = {
      repoName: "mi-repo",
      tierBreakdown: { deep: 1, standard: 0, light: 0 },
      engineByTier: { deep: "claude", standard: "claude", light: "claude" },
      totalWorkersByTier: { deep: 1, standard: 0, light: 0 },
      tokensConsumed: 100,
      totalTimeMs: 5000,
      pauseCount: 0,
      analyzedModuleNames: ["auth"],
      skippedModuleNames: ["billing", "payments"],
      rejectedReportModuleNames: ["payments"],
    };

    finalizeRun(store, session, report);

    const summary = store.getByTopic(session.projectId, `session/${session.sessionId}/summary`);
    expect(summary?.content).toContain("Módulos saltados o fallidos: billing, payments.");
    expect(summary?.content).toContain("Engram rechazó el reporte de estos módulos por parecer un secreto: payments.");

    store.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });
});
