/** Comprueba el valor inicial y la persistencia del contador de pausas por cuota de un proyecto. */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, startProjectSession, type MemoryStore } from "forge614-engram";
import { readPauseCount, recordPause } from "./pause-count";

/**
 * Abre una base temporal y una sesión de proyecto para probar el contador con memoria real.
 * @param root Carpeta temporal donde vive la base de prueba.
 * @param repoDir Carpeta temporal que identifica el proyecto de prueba.
 * @returns La base abierta y la sesión recién iniciada.
 */
function freshSession(root: string, repoDir: string) {
  const workspace = new MemoryWorkspace(new WorkspaceConfig(root));
  workspace.init();
  const store = workspace.open();
  store.enableSessions();
  const session = startProjectSession(store, repoDir, "atlas:test-session");
  return { store, session };
}

/** Comprueba la lectura antes y después de guardar dos pausas en la misma sesión. */
describe("pause-count", () => {

  /** Comprueba que un proyecto sin memoria de pausas dé cero. */
  test("starts at zero for a project with no recorded pauses", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-pause-count-"));
    const repoDir = mkdtempSync(join(tmpdir(), "atlas-pause-count-repo-"));
    const { store, session } = freshSession(dir, repoDir);

    expect(readPauseCount(store, session.projectId)).toBe(0);

    store.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  /** Comprueba que dos guardados sucesivos devuelvan 1 y 2, y que la lectura posterior conserve 2. */
  test("increments across multiple pauses and persists the running total", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-pause-count-"));
    const repoDir = mkdtempSync(join(tmpdir(), "atlas-pause-count-repo-"));
    const { store, session } = freshSession(dir, repoDir);

    expect(recordPause(store, repoDir, session)).toBe(1);
    expect(recordPause(store, repoDir, session)).toBe(2);
    expect(readPauseCount(store, session.projectId)).toBe(2);

    store.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });
});
