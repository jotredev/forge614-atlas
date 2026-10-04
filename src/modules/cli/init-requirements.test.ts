import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, type MemoryStore } from "forge614-engram";
import { runInitCommand, type InitErrorCode, type InitOutcome } from "./init";
import { makeFakeDir, runCompletedEvent, writeFakeEngines, writeFakeWorkers, type FakeWorkersOptions } from "./fake-binaries.testkit";

const READ_ONLY_MESSAGE =
  'Forge614 Engines does not guarantee read-only helpers for "claude-code" (Engines 1.17.0 or newer is required). Update it with: forge614-engines update';

function outdatedMessage(found: string): string {
  return `Forge614 Workers 1.0.0 or newer is required (found: ${found}). Install it with: curl -fsSL https://github.com/jotredev/forge614-workers/releases/latest/download/install.sh | bash`;
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

/**
 * Pruebas de la comprobación al iniciar y de la segunda defensa. Todo es FALSO y vive en carpetas
 * temporales: ningún Engines, Workers ni motor real, y una base de Engram aparte.
 */
describe("runInitCommand requirements check", () => {
  let repo: string;
  let engramDir: string;
  let fakeDir: string;
  let store: MemoryStore;

  beforeEach(() => {
    repo = makeFakeDir("atlas-init-req-repo-");
    git(repo, ["init", "-q"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test"]);
    mkdirSync(join(repo, "auth"), { recursive: true });
    writeFileSync(join(repo, "auth", "login.ts"), "export const login = () => true;");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-q", "-m", "add auth"]);

    engramDir = makeFakeDir("atlas-init-req-engram-");
    const workspace = new MemoryWorkspace(new WorkspaceConfig(engramDir));
    workspace.init();
    store = workspace.open();
    store.enableSessions();
    fakeDir = makeFakeDir("atlas-init-req-fake-");
  });

  afterEach(() => {
    store.close();
    for (const dir of [repo, engramDir, fakeDir]) rmSync(dir, { recursive: true, force: true });
  });

  function enginesDir(): string {
    const dir = join(fakeDir, "engines");
    mkdirSync(dir);
    return dir;
  }

  function workersDir(): string {
    const dir = join(fakeDir, "workers");
    mkdirSync(dir);
    return dir;
  }

  async function runWith(enginesBinaryPath: string, workersBinaryPath: string, workersVersionTimeoutMs?: number): Promise<InitOutcome> {
    return runInitCommand(store, {
      directory: repo, enginesBinaryPath, workersBinaryPath, requestedEngineId: "claude-code", force: false,
      ...(workersVersionTimeoutMs === undefined ? {} : { workersVersionTimeoutMs }),
    });
  }

  function expectError(outcome: InitOutcome, code: InitErrorCode, message: string): void {
    expect(outcome).toEqual({ schemaVersion: 1, status: "error", error: { code, message } });
  }

  /**
   * Ninguna sesión (ni proyecto) se abrió en la base temporal de Engram: esa base nace vacía y solo
   * `startProjectSession` registra un proyecto en ella.
   */
  function expectNoSessionOpened(): void {
    expect(store.listProjects()).toEqual([]);
  }

  const goodWorkers: FakeWorkersOptions = { versionOutput: "forge614-workers 1.0.0", events: [runCompletedEvent(1)] };

  test("control: with read-only Engines and Workers 1.0.0 the run goes on and opens the session", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: true });
    const workers = writeFakeWorkers(workersDir(), goodWorkers);

    const outcome = await runWith(engines, workers.path);

    expect(outcome.status).toBe("completed");
    expect(store.listProjects()).toHaveLength(1);
  });

  test("supportsReadOnly: false -> READ_ONLY_UNSUPPORTED, before any session", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: false });
    const workers = writeFakeWorkers(workersDir(), goodWorkers);

    expectError(await runWith(engines, workers.path), "READ_ONLY_UNSUPPORTED", READ_ONLY_MESSAGE);
    expectNoSessionOpened();
  });

  test("supportsReadOnly absent (Engines older than 1.17.0) -> READ_ONLY_UNSUPPORTED, before any session", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: "absent" });
    const workers = writeFakeWorkers(workersDir(), goodWorkers);

    expectError(await runWith(engines, workers.path), "READ_ONLY_UNSUPPORTED", READ_ONLY_MESSAGE);
    expectNoSessionOpened();
  });

  test("a Workers binary that does not exist -> WORKERS_UNREACHABLE, before any session", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: true });
    const missing = join(fakeDir, "no-existe", "forge614-workers");

    expectError(
      await runWith(engines, missing),
      "WORKERS_UNREACHABLE",
      `ENOENT: no such file or directory, access '${missing}'`,
    );
    expectNoSessionOpened();
  });

  test("Workers 0.1.0 -> WORKERS_OUTDATED naming the version found, before any session", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: true });
    const workers = writeFakeWorkers(workersDir(), { ...goodWorkers, versionOutput: "forge614-workers 0.1.0" });

    expectError(await runWith(engines, workers.path), "WORKERS_OUTDATED", outdatedMessage("0.1.0"));
    expectNoSessionOpened();
  });

  test("Workers that prints something else on --version -> WORKERS_OUTDATED (found: unknown), before any session", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: true });
    const workers = writeFakeWorkers(workersDir(), { ...goodWorkers, versionOutput: "hello from somewhere else" });

    expectError(await runWith(engines, workers.path), "WORKERS_OUTDATED", outdatedMessage("unknown"));
    expectNoSessionOpened();
  });

  test("Workers whose --version exits with a non-zero code -> WORKERS_OUTDATED (found: unknown), before any session", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: true });
    const workers = writeFakeWorkers(workersDir(), { ...goodWorkers, versionExitCode: 3 });

    expectError(await runWith(engines, workers.path), "WORKERS_OUTDATED", outdatedMessage("unknown"));
    expectNoSessionOpened();
  });

  test("Workers whose --version never ends -> WORKERS_OUTDATED once the time limit passes, before any session", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: true });
    const workers = writeFakeWorkers(workersDir(), { ...goodWorkers, hangOnVersion: true });

    expectError(await runWith(engines, workers.path, 300), "WORKERS_OUTDATED", outdatedMessage("unknown"));
    expectNoSessionOpened();
  });

  test("a task rejected by Workers with READ_ONLY_UNSUPPORTED ends the run as that error, not as a skipped module", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: true });
    const stderr = 'READ_ONLY_UNSUPPORTED: Engines does not guarantee read-only execution for agent "claude-code"; the task was not run';
    const workers = writeFakeWorkers(workersDir(), {
      versionOutput: "forge614-workers 1.0.0",
      events: [
        {
          event: "task_failed", taskId: "auth", reason: "engine_unsupported", exitCode: null,
          stdout: "", stdoutBytes: 0, stdoutTruncated: false, stderr, stderrBytes: stderr.length, stderrTruncated: false,
        },
        runCompletedEvent(1),
      ],
    });

    expectError(await runWith(engines, workers.path), "READ_ONLY_UNSUPPORTED", READ_ONLY_MESSAGE);
  });
});
