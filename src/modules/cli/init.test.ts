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
