/**
 * Prueba `dispatchModules` con los programas reales de Workers y Engines (sus rutas se resuelven desde la carpeta
 * de Forge614 del usuario) y un motor Claude FALSO (script de shell): reporte completo, pausa por cuota y error fatal.
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { MemoryWorkspace, WorkspaceConfig, startProjectSession, type MemoryStore } from "forge614-engram";
import { dispatchModules } from "./dispatch-modules";
import { resolveWorkersBinaryPath } from "../workers-client/binary-path";
import { resolveEnginesBinaryPath } from "../engines-client/binary-path";
import { resolveForgeHome } from "../forge-home/forge-home";
import { isModuleReportSaved } from "../memory/run-state";
import { readPauseCount } from "../memory/pause-count";
import { deriveSessionId } from "../memory/session-id";

const forgeHome = resolveForgeHome(process.env, homedir());
const workersBinaryPath = resolveWorkersBinaryPath(process.platform, forgeHome);
const enginesBinaryPath = resolveEnginesBinaryPath(process.platform, forgeHome);
const capabilities = { id: "claude-code", label: "Claude Code", supportsMcp: true, supportsHooks: true, supportsHeadlessExec: true, supportsReasoningLevel: false, supportsReadOnly: true };

/**
 * Escribe un script de shell ejecutable que hace de motor Claude FALSO: descarta lo que recibe por su entrada
 * estándar (stdin, la entrada de datos del programa), para que quien lo lanza no quede esperando, y luego ejecuta el comportamiento pedido.
 * @param dir Carpeta existente donde se crea el script.
 * @param name Nombre del archivo del script.
 * @param behavior Líneas de shell que decide qué imprime y con qué código sale, p. ej. `echo "ok"\nexit 0`.
 * @returns La ruta del script, ya con permiso de ejecución.
 */
function writeFakeClaudeScript(dir: string, name: string, behavior: string): string {
  const scriptPath = join(dir, name);
  writeFileSync(scriptPath, `#!/bin/sh\ncat > /dev/null\n${behavior}\n`);
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

/**
 * Agrupa las pruebas de `dispatchModules` sobre un proyecto temporal con los módulos `auth` y `billing`
 * y una memoria de Engram temporal; cada prueba empieza con ambos recién creados y los borra al terminar.
 */
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

  /**
   * Con un Claude falso que responde bien, ambos módulos quedan guardados, el desglose por nivel es 1 profundo y
   * 1 ligero, no hay pausas y la sesión queda cerrada; protege el camino feliz completo, de Workers a Engram.
   */
  test("saves each module report immediately and returns a completed FinalReport", async () => {
    const fakeClaude = writeFakeClaudeScript(projectDir, "fake-claude-ok.sh", 'echo "FAKE_ANALYSIS_OK"\nexit 0');
    // sessionId derivado igual que en producción (startOrResumeSession), para poder
    // confirmar más abajo que finalizeRun cerró esta sesión reabriéndola por su directorio real.
    const session = startProjectSession(store, projectDir, deriveSessionId(projectDir));

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

    expect(result.report.pauseCount).toBe(0);
    // finalizeRun ya cerró la sesión — confirmarlo intentando reabrirla como "ya completa":
    const { startOrResumeSession } = await import("../memory/run-state");
    const reopened = startOrResumeSession(store, projectDir);
    expect(reopened.status).toBe("already-complete");
  });

  /**
   * Con un Claude falso que dice «usage limit reached» y sale con error, el resultado es `paused`, el módulo
   * `auth` no queda guardado y el contador de pausas sube a 1; protege que una cuota agotada se registre.
   */
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

  /**
   * Con una ruta de Engines que no existe, Workers rechaza el lote y el resultado es `fatal_error` sin guardar
   * nada de `auth`; protege que un fallo de configuración no se confunda con módulos omitidos.
   */
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
