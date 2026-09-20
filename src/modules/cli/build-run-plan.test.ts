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
