/** Comprueba que Atlas pueda abrir una base temporal de Engram y habilitar sesiones en ella. */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig } from "forge614-engram";

/** Comprueba la conexión mínima de las piezas de Engram usadas por Atlas. */
describe("forge614-engram wiring", () => {
  /** Comprueba que una base recién creada informe `sessionsEnabled()` igual a `true`. */
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
