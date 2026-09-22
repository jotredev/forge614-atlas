import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, startProjectSession, type MemoryStore } from "forge614-engram";
import { dispatchModules } from "./dispatch-modules";
import { resolveWorkersBinaryPath } from "../workers-client/binary-path";
import { resolveEnginesBinaryPath } from "../engines-client/binary-path";
import { isModuleReportSaved } from "../memory/run-state";
import { readPauseCount } from "../memory/pause-count";

const workersBinaryPath = resolveWorkersBinaryPath(process.platform, homedir());
const enginesBinaryPath = resolveEnginesBinaryPath(process.platform, homedir());
const capabilities = { id: "claude-code", label: "Claude Code", supportsMcp: true, supportsHooks: true, supportsHeadlessExec: true, supportsReasoningLevel: false };

function writeFakeClaudeScript(dir: string, name: string, behavior: string): string {
  const scriptPath = join(dir, name);
  writeFileSync(scriptPath, `#!/bin/sh\ncat > /dev/null\n${behavior}\n`);
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

describe("dispatchModules", () => {
  let projectDir: string;
  let engramDir: string;
  let store: MemoryStore;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "atlas-dispatch-project-"));
    mkdirSync(join(projectDir, "auth"), { recursive: true });
    writeFileSync(join(projectDir, "auth", "login.ts"), "export const login = () => true;");
    mkdirSync(join(projectDir, "billing"), { recursive: true });
    writeFileSync(join(projectDir, "billing", "invoice.ts"), "export const invoice = () => 1;");

    engramDir = mkdtempSync(join(tmpdir(), "atlas-dispatch-engram-"));
    const workspace = new MemoryWorkspace(new WorkspaceConfig(engramDir));
    workspace.init();
    store = workspace.open();
    store.enableSessions();
  });

  afterEach(() => {
    store.close();
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(engramDir, { recursive: true, force: true });
  });

  test("saves each module report immediately and returns a completed FinalReport", async () => {
    const fakeClaude = writeFakeClaudeScript(projectDir, "fake-claude-ok.sh", 'echo "FAKE_ANALYSIS_OK"\nexit 0');
    const session = startProjectSession(store, projectDir, "session-completed");

    const result = await dispatchModules(
      store,
      projectDir,
      session,
      workersBinaryPath,
      enginesBinaryPath,
      { id: "claude-code", executable: fakeClaude },
      capabilities,
      [
        { name: "auth", tier: "profundo" },
        { name: "billing", tier: "ligero" },
      ],
    );

    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("unreachable");
    expect(result.report.tierBreakdown).toEqual({ deep: 1, standard: 0, light: 1 });
    expect(result.report.analyzedModuleNames.sort()).toEqual(["auth", "billing"]);

    expect(isModuleReportSaved(store, session.projectId, "auth")).toBe(true);
    expect(isModuleReportSaved(store, session.projectId, "billing")).toBe(true);
  });

  test("stops on quota_exhausted, leaves the session open, and increments the pause count", async () => {
    const fakeClaude = writeFakeClaudeScript(
      projectDir,
      "fake-claude-quota.sh",
      'echo "Claude AI usage limit reached" >&2\nexit 1',
    );
    const session = startProjectSession(store, projectDir, "session-paused");

    const result = await dispatchModules(
      store,
      projectDir,
      session,
      workersBinaryPath,
      enginesBinaryPath,
      { id: "claude-code", executable: fakeClaude },
      capabilities,
      [
        { name: "auth", tier: "profundo" },
        { name: "billing", tier: "ligero" },
      ],
    );

    expect(result.status).toBe("paused");
    expect(isModuleReportSaved(store, session.projectId, "auth")).toBe(false);
    expect(readPauseCount(store, session.projectId)).toBe(1);
  });

  test("reports fatal_error when forge614-workers rejects the batch (e.g. bad enginesBin)", async () => {
    const fakeClaude = writeFakeClaudeScript(projectDir, "fake-claude-unreached.sh", "exit 0");
    const session = startProjectSession(store, projectDir, "session-fatal");

    const result = await dispatchModules(
      store,
      projectDir,
      session,
      workersBinaryPath,
      "/no/existe/forge614-engines",
      { id: "claude-code", executable: fakeClaude },
      capabilities,
      [{ name: "auth", tier: "profundo" }],
    );

    expect(result.status).toBe("fatal_error");
    expect(isModuleReportSaved(store, session.projectId, "auth")).toBe(false);
  });
});
