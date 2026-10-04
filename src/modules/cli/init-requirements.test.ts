/**
 * Prueba los requisitos previos de `init` y su segunda defensa con binarios falsos, sin depender de Engines, Workers ni un motor real.
 * Los siete casos de requisito fallido al iniciar confirman además que no se abre ninguna sesión en la memoria temporal de
 * Engram; el control comprueba lo contrario y el caso de la segunda defensa no mira las sesiones.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, type MemoryStore } from "forge614-engram";
import { runInitCommand, type InitErrorCode, type InitOutcome } from "./init";
import { makeFakeDir, runCompletedEvent, writeFakeEngines, writeFakeWorkers, type FakeWorkersOptions } from "./fake-binaries.testkit";

const READ_ONLY_MESSAGE =
  'Forge614 Engines does not guarantee read-only helpers for "claude-code" (Engines 1.17.0 or newer is required). Update it with: forge614-engines update';

/**
 * Forma el mensaje esperado de Workers desactualizado para comparar exactamente el texto público que entrega `init`.
 * @param found Versión que debe aparecer en el mensaje (o `unknown` si no se pudo leer).
 * @returns El mensaje completo esperado.
 */
function outdatedMessage(found: string): string {
  return `Forge614 Workers 1.0.0 or newer is required (found: ${found}). Install it with: curl -fsSL https://github.com/jotredev/forge614-workers/releases/latest/download/install.sh | bash`;
}

/**
 * Ejecuta git en el repositorio temporal y hace fallar la preparación si cualquiera de sus pasos (init, config, add, commit)
 * no termina con código 0.
 * @param cwd Carpeta del repositorio.
 * @param args Argumentos de git.
 * @throws Error si git falla.
 */
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

  /**
   * Crea la carpeta exclusiva donde se escribe el binario falso de Engines.
   * @returns Ruta de esa carpeta nueva.
   */
  function enginesDir(): string {
    const dir = join(fakeDir, "engines");
    mkdirSync(dir);
    return dir;
  }

  /**
   * Crea la carpeta exclusiva donde se escribe el binario falso de Workers.
   * @returns Ruta de esa carpeta nueva.
   */
  function workersDir(): string {
    const dir = join(fakeDir, "workers");
    mkdirSync(dir);
    return dir;
  }

  /**
   * Llama a `init` variando binarios y tiempo de versión.
   * @param enginesBinaryPath Ruta del doble Engines.
   * @param workersBinaryPath Ruta del doble Workers.
   * @param workersVersionTimeoutMs Tope opcional para `--version`.
   * @returns El resultado JSON de `init`.
   */
  async function runWith(enginesBinaryPath: string, workersBinaryPath: string, workersVersionTimeoutMs?: number): Promise<InitOutcome> {
    return runInitCommand(store, {
      directory: repo, enginesBinaryPath, workersBinaryPath, requestedEngineId: "claude-code", force: false,
      ...(workersVersionTimeoutMs === undefined ? {} : { workersVersionTimeoutMs }),
    });
  }

  /**
   * Comprueba el sobre de error completo; así se protege versión, estado, código y mensaje como contrato público único.
   * @param outcome Resultado recibido.
   * @param code Código esperado.
   * @param message Texto esperado.
   */
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

  /** Comprueba el control positivo: capacidades de solo lectura y Workers 1.0.0 sí permiten terminar y abrir una sesión. */
  test("control: with read-only Engines and Workers 1.0.0 the run goes on and opens the session", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: true });
    const workers = writeFakeWorkers(workersDir(), goodWorkers);

    const outcome = await runWith(engines, workers.path);

    expect(outcome.status).toBe("completed");
    expect(store.listProjects()).toHaveLength(1);
  });

  /** Comprueba que `supportsReadOnly: false` detiene el inicio con `READ_ONLY_UNSUPPORTED` antes de registrar un proyecto. */
  test("supportsReadOnly: false -> READ_ONLY_UNSUPPORTED, before any session", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: false });
    const workers = writeFakeWorkers(workersDir(), goodWorkers);

    expectError(await runWith(engines, workers.path), "READ_ONLY_UNSUPPORTED", READ_ONLY_MESSAGE);
    expectNoSessionOpened();
  });

  /** Comprueba que la ausencia del campo de Engines antiguo se trata igual que una garantía negativa y no abre sesión. */
  test("supportsReadOnly absent (Engines older than 1.17.0) -> READ_ONLY_UNSUPPORTED, before any session", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: "absent" });
    const workers = writeFakeWorkers(workersDir(), goodWorkers);

    expectError(await runWith(engines, workers.path), "READ_ONLY_UNSUPPORTED", READ_ONLY_MESSAGE);
    expectNoSessionOpened();
  });

  /** Comprueba que una ruta de Workers ausente devuelve el mensaje de `access` y `WORKERS_UNREACHABLE` antes de abrir sesión. */
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

  /** Comprueba que una versión con número principal 0 (0.1.0) se rechaza y que el mensaje conserva `0.1.0` como versión encontrada. */
  test("Workers 0.1.0 -> WORKERS_OUTDATED naming the version found, before any session", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: true });
    const workers = writeFakeWorkers(workersDir(), { ...goodWorkers, versionOutput: "forge614-workers 0.1.0" });

    expectError(await runWith(engines, workers.path), "WORKERS_OUTDATED", outdatedMessage("0.1.0"));
    expectNoSessionOpened();
  });

  /** Comprueba que una salida de versión ajena al formato se vuelve `WORKERS_OUTDATED` con `found: unknown`. */
  test("Workers that prints something else on --version -> WORKERS_OUTDATED (found: unknown), before any session", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: true });
    const workers = writeFakeWorkers(workersDir(), { ...goodWorkers, versionOutput: "hello from somewhere else" });

    expectError(await runWith(engines, workers.path), "WORKERS_OUTDATED", outdatedMessage("unknown"));
    expectNoSessionOpened();
  });

  /** Comprueba que un código de salida distinto de cero no se interpreta como versión válida y usa `unknown`. */
  test("Workers whose --version exits with a non-zero code -> WORKERS_OUTDATED (found: unknown), before any session", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: true });
    const workers = writeFakeWorkers(workersDir(), { ...goodWorkers, versionExitCode: 3 });

    expectError(await runWith(engines, workers.path), "WORKERS_OUTDATED", outdatedMessage("unknown"));
    expectNoSessionOpened();
  });

  /** Comprueba que el proceso falso que tarda 30 segundos vence al tope de 300 ms y no deja una sesión abierta. */
  test("Workers whose --version never ends -> WORKERS_OUTDATED once the time limit passes, before any session", async () => {
    const engines = writeFakeEngines(enginesDir(), { supportsReadOnly: true });
    const workers = writeFakeWorkers(workersDir(), { ...goodWorkers, hangOnVersion: true });

    expectError(await runWith(engines, workers.path, 300), "WORKERS_OUTDATED", outdatedMessage("unknown"));
    expectNoSessionOpened();
  });

  /** Comprueba la segunda defensa: el evento de rechazo de Workers llega como `READ_ONLY_UNSUPPORTED`, no como módulo omitido. */
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
