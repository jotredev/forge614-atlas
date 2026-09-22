import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, startProjectSession, type MemoryStore } from "forge614-engram";
import { readPauseCount, recordPause } from "./pause-count";

function freshSession(root: string, repoDir: string) {
  const workspace = new MemoryWorkspace(new WorkspaceConfig(root));
  workspace.init();
  const store = workspace.open();
  store.enableSessions();
  const session = startProjectSession(store, repoDir, "atlas:test-session");
  return { store, session };
}

describe("pause-count", () => {

  test("starts at zero for a project with no recorded pauses", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-pause-count-"));
    const repoDir = mkdtempSync(join(tmpdir(), "atlas-pause-count-repo-"));
    const { store, session } = freshSession(dir, repoDir);

    expect(readPauseCount(store, session.projectId)).toBe(0);

    store.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

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
