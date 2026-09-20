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
