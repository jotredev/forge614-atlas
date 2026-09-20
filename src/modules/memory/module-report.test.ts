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
