/**
 * Ejecuta los caminos integrados de `runInitCommand` con repositorios y memoria temporales, pero con Engines y Workers instalados.
 * Protege las respuestas que el CLI entrega al elegir motor, abrir una sesión nueva, detectar una sesión ya cerrada o forzar un
 * análisis nuevo, y convertir fallos de Engines, de Workers y del análisis en sobres de error.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, startProjectSession } from "forge614-engram";
import { runInitCommand } from "./init";
import { resolveEnginesBinaryPath } from "../engines-client/binary-path";
import { resolveWorkersBinaryPath } from "../workers-client/binary-path";
import { resolveForgeHome } from "../forge-home/forge-home";
import { deriveSessionId } from "../memory/session-id";
import { recordModuleReport } from "../memory/module-report";

/**
 * Ejecuta git en el repositorio temporal y detiene la prueba si el comando no termina con código 0.
 * @param cwd Carpeta del repositorio temporal.
 * @param args Argumentos de git.
 * @throws Error si git falla.
 */
function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

/**
 * Crea un repositorio temporal con un commit y el módulo `auth`, necesario porque el análisis calcula churn desde git.
 * @returns Ruta absoluta del repositorio creado; quien llama lo elimina al finalizar el caso.
 */
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

/**
 * Abre una memoria de Engram en la carpeta temporal dada (así cada caso tiene la suya) y habilita las sesiones, que `init`
 * necesita para abrir la suya.
 * @param engramRoot Carpeta temporal que alojará la memoria.
 * @returns El almacén abierto que el caso debe cerrar.
 */
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
const forgeHome = resolveForgeHome(process.env, homedir());
const enginesBinaryPath = resolveEnginesBinaryPath(process.platform, forgeHome);
const workersBinaryPath = resolveWorkersBinaryPath(process.platform, forgeHome);

/** Agrupa la ejecución real de `init`, sus sesiones y los fallos que debe transformar en resultados JSON. */
describe("runInitCommand", () => {
  // Timeout ampliado en las pruebas que llegan a "completed": invocan un motor real
  // (claude-code) en modo headless contra la API, lo que puede tardar más de los
  // 5000ms por defecto de bun:test.
  /** Comprueba que pedir `claude-code` inicia una sesión nueva y termina analizando el único módulo `auth`. */
  test("resolves the requested engine, starts a fresh session, and completes the run for real", async () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-init-fresh-"));
    const repo = realRepoWithAuth();
    const store = engramStore(engramRoot);

    const outcome = await runInitCommand(store, {
      directory: repo, enginesBinaryPath, workersBinaryPath, requestedEngineId: "claude-code", force: false,
    });

    expect(outcome.status).toBe("completed");
    if (outcome.status === "completed") {
      expect(outcome.engine.id).toBe("claude-code");
      expect(outcome.session.resumed).toBe(false);
      expect(outcome.report.analyzedModuleNames).toEqual(["auth"]);
    }

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }, 60000);

  /** Comprueba que una sesión cerrada previamente no vuelve a despacharse y devuelve exactamente `already-complete`. */
  test("a repo whose session was already closed reports already-complete", async () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-init-done-"));
    const repo = realRepoWithAuth();
    const store = engramStore(engramRoot);
    const sessionId = deriveSessionId(repo);
    const session = startProjectSession(store, repo, sessionId);
    store.endSession(session.projectId, session.sessionId);

    const outcome = await runInitCommand(store, {
      directory: repo, enginesBinaryPath, workersBinaryPath, requestedEngineId: "claude-code", force: false,
    });

    expect(outcome.status).toBe("already-complete");

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  /** Comprueba que `force` crea otro identificador de sesión y vuelve a analizar `auth` aunque su sesión anterior ya esté cerrada. */
  test("force re-analyzes everything, in a new session, even when the previous one is closed", async () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-init-force-"));
    const repo = realRepoWithAuth();
    const store = engramStore(engramRoot);
    const sessionId = deriveSessionId(repo);
    const session = startProjectSession(store, repo, sessionId);
    recordModuleReport(store, repo, session, "auth", "ya analizado antes");
    store.endSession(session.projectId, session.sessionId);

    const outcome = await runInitCommand(store, {
      directory: repo, enginesBinaryPath, workersBinaryPath, requestedEngineId: "claude-code", force: true,
    });

    expect(outcome.status).toBe("completed");
    if (outcome.status === "completed") {
      expect(outcome.session.sessionId).not.toBe(sessionId);
      expect(outcome.report.analyzedModuleNames).toEqual(["auth"]);
    }

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }, 60000);

  /** Comprueba que un motor inexistente no llega al análisis y conserva el identificador pedido en `engine-invalid`. */
  test("returns engine-invalid when the requested engine is not a real candidate", async () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-init-invalid-"));
    const repo = realRepoWithAuth();
    const store = engramStore(engramRoot);

    const outcome = await runInitCommand(store, {
      directory: repo, enginesBinaryPath, workersBinaryPath, requestedEngineId: "not-a-real-engine", force: false,
    });

    expect(outcome.status).toBe("engine-invalid");
    if (outcome.status === "engine-invalid") {
      expect(outcome.requestedId).toBe("not-a-real-engine");
    }

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  /** Comprueba que una ruta inexistente de Engines se transforma en el código `ENGINES_UNREACHABLE` en vez de lanzar. */
  test("returns an ENGINES_UNREACHABLE error when the Engines binary path is invalid", async () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-init-unreachable-"));
    const repo = realRepoWithAuth();
    const store = engramStore(engramRoot);

    const outcome = await runInitCommand(store, {
      directory: repo, enginesBinaryPath: "/nonexistent/forge614-engines", workersBinaryPath,
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

  /** Comprueba que una carpeta con código pero sin repositorio git produce `ANALYSIS_FAILED`, no una excepción que escape del CLI. */
  test("returns an ANALYSIS_FAILED error, not a crash, on a plain directory that was never git-init'd", async () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-init-nogit-"));
    const directory = mkdtempSync(join(tmpdir(), "atlas-init-nogit-repo-"));
    mkdirSync(join(directory, "auth"), { recursive: true });
    writeFileSync(join(directory, "auth", "login.ts"), "export const login = () => true;");
    const store = engramStore(engramRoot);

    const outcome = await runInitCommand(store, {
      directory, enginesBinaryPath, workersBinaryPath, requestedEngineId: "claude-code", force: false,
    });

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.error.code).toBe("ANALYSIS_FAILED");
    }

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(directory, { recursive: true, force: true });
  });

  /** Comprueba que el repositorio inicializado sin commits también se reporta como `ANALYSIS_FAILED` por el cálculo de churn. */
  test("returns an ANALYSIS_FAILED error, not a crash, on a git repo with zero commits", async () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-init-zerocommits-"));
    const directory = mkdtempSync(join(tmpdir(), "atlas-init-zerocommits-repo-"));
    git(directory, ["init", "-q"]);
    git(directory, ["config", "user.email", "test@example.com"]);
    git(directory, ["config", "user.name", "Test"]);
    mkdirSync(join(directory, "auth"), { recursive: true });
    writeFileSync(join(directory, "auth", "login.ts"), "export const login = () => true;");
    const store = engramStore(engramRoot);

    const outcome = await runInitCommand(store, {
      directory, enginesBinaryPath, workersBinaryPath, requestedEngineId: "claude-code", force: false,
    });

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.error.code).toBe("ANALYSIS_FAILED");
    }

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(directory, { recursive: true, force: true });
  });

  /** Comprueba la forma del camino completado: devuelve `completed` y un arreglo de módulos analizados en el reporte final. */
  test("completes the run for real and returns status: completed with a FinalReport", async () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-init-completed-"));
    const repo = realRepoWithAuth();
    const store = engramStore(engramRoot);

    const outcome = await runInitCommand(store, {
      directory: repo,
      enginesBinaryPath,
      workersBinaryPath,
      // El resto de este archivo usa "claude-code" porque en esta máquina de
      // desarrollo hay más de un motor headless instalado (deja requestedEngineId
      // sin definir aquí y resolveEngine devuelve "engine-ambiguous").
      requestedEngineId: "claude-code",
      force: false,
    });

    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") throw new Error("unreachable");
    expect(Array.isArray(outcome.report.analyzedModuleNames)).toBe(true);

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }, 60000);

  /** Comprueba que una ruta inexistente de Workers falla en requisitos con `WORKERS_UNREACHABLE` antes del despacho. */
  test("reports WORKERS_UNREACHABLE when the workers binary path does not exist", async () => {
    const engramRoot = mkdtempSync(join(tmpdir(), "atlas-init-workers-unreachable-"));
    const repo = realRepoWithAuth();
    const store = engramStore(engramRoot);

    const outcome = await runInitCommand(store, {
      directory: repo,
      enginesBinaryPath,
      workersBinaryPath: "/no/existe/forge614-workers",
      requestedEngineId: "claude-code",
      force: false,
    });

    expect(outcome.status).toBe("error");
    if (outcome.status !== "error") throw new Error("unreachable");
    expect(outcome.error.code).toBe("WORKERS_UNREACHABLE");

    store.close();
    rmSync(engramRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });
});
