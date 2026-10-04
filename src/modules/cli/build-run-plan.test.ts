/**
 * Prueba `buildRunPlan` con memorias de Engram reales y temporales y, salvo en la prueba del plan vacío, con repositorios de git reales:
 * qué módulos entran al plan, cuándo se marca como continuación y cuándo el plan queda vacío.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, startProjectSession } from "forge614-engram";
import { buildRunPlan } from "./build-run-plan";
import { recordModuleReport } from "../memory/module-report";

/**
 * Ejecuta un comando de git dentro de una carpeta y falla la prueba si git termina con error.
 * @param cwd Carpeta donde se ejecuta git (el repositorio de prueba).
 * @param args Argumentos de git, p. ej. `["init", "-q"]`.
 * @throws Error con el comando y el texto de error de git si el código de salida no es 0.
 */
function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

/**
 * Crea un repositorio de git temporal con un único commit (registro de cambios) que contiene el módulo `auth`.
 * Hace falta un commit real porque la señal de churn (cuántas veces cambió cada módulo) se lee del historial de git.
 * @returns Ruta absoluta de la carpeta temporal; quien la pide debe borrarla.
 */
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

/**
 * Abre una memoria de Engram nueva en la carpeta dada, con las sesiones habilitadas.
 * @param engramRoot Carpeta (temporal) donde se crea el espacio de memoria.
 * @returns El almacén abierto; quien lo pide debe cerrarlo con `close()`.
 */
function engramStore(engramRoot: string) {
  const workspace = new MemoryWorkspace(new WorkspaceConfig(engramRoot));
  workspace.init();
  const store = workspace.open();
  store.enableSessions();
  return store;
}

/**
 * Agrupa las pruebas del plan de corrida que arma `buildRunPlan`.
 */
describe("buildRunPlan", () => {
  /**
   * Con un repositorio de un solo módulo y la memoria vacía, el plan lo incluye con nivel `profundo` y no es
   * continuación; protege el caso de la primera corrida, donde nada debe omitirse.
   */
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

  /**
   * Con `auth` ya guardado en la memoria y `billing` sin guardar, pedir `skipCompleted: true` deja solo `billing`
   * y marca `resumed`; protege la reanudación de una corrida interrumpida sin repetir trabajo.
   */
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

  /**
   * Aunque `auth` ya tenga reporte guardado, `skipCompleted: false` lo deja en el plan y `resumed` sigue en
   * `false`; protege el modo forzado, que debe volver a analizarlo todo.
   */
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

  /**
   * Con una carpeta sin código (no es ni repositorio de git), no se descubre ningún módulo y el plan es exactamente
   * `{ modules: [], resumed: false }`; protege que la salida anticipada no intente puntuar con git.
   */
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
