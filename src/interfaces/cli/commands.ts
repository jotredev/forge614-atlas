import { homedir } from "node:os";
import { MemoryWorkspace } from "forge614-engram";
import { resolveEnginesBinaryPath } from "../../modules/engines-client/binary-path";
import { ForgeHomeError, resolveForgeHome } from "../../modules/forge-home/forge-home";
import { resolveWorkersBinaryPath } from "../../modules/workers-client/binary-path";
import { runInitCommand } from "../../modules/cli/init";

/**
 * Imprime una respuesta como JSON legible en la salida estándar.
 * @param payload Cualquier valor serializable a JSON.
 */
export function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

/**
 * Ejecuta `init` sobre un proyecto: resuelve la carpeta Forge614, abre Engram y corre el análisis.
 * Si `FORGE614_HOME` no es válida responde con el sobre de error y NO abre Engram.
 * @param directory Carpeta del proyecto a contextualizar.
 * @param requestedEngineId Motor pedido con `--engine`, si lo hay.
 * @param force Si es `true`, rehace un análisis que ya estaba completo.
 */
export async function runInit(directory: string, requestedEngineId: string | undefined, force: boolean): Promise<void> {
  let forgeHome: string;
  try {
    forgeHome = resolveForgeHome(process.env, homedir());
  } catch (error) {
    if (!(error instanceof ForgeHomeError)) throw error;
    printJson({ schemaVersion: 1, status: "error", error: { code: error.code, message: error.message } });
    process.exitCode = 1;
    return;
  }

  const workspace = new MemoryWorkspace();
  workspace.init();
  const store = workspace.open();
  store.enableSessions();
  try {
    const enginesBinaryPath = resolveEnginesBinaryPath(process.platform, forgeHome);
    const workersBinaryPath = resolveWorkersBinaryPath(process.platform, forgeHome);
    const outcome = await runInitCommand(store, { directory, enginesBinaryPath, workersBinaryPath, requestedEngineId, force });
    printJson(outcome);
    if ("error" in outcome) process.exitCode = 1;
  } finally {
    store.close();
  }
}
