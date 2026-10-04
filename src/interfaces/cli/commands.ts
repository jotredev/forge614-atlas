import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { MemoryWorkspace } from "forge614-engram";
import { resolveEnginesBinaryPath } from "../../modules/engines-client/binary-path";
import { ForgeHomeError, resolveForgeHome } from "../../modules/forge-home/forge-home";
import { runUpdateCommand } from "../../modules/updater/updater";
import { resolveWorkersBinaryPath } from "../../modules/workers-client/binary-path";
import { runInitCommand } from "../../modules/cli/init";
import { runUninstallCommand } from "./uninstall-command";

/**
 * Imprime una respuesta como JSON legible en la salida estándar.
 * @param payload Cualquier valor serializable a JSON.
 */
export function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

/**
 * Resuelve la carpeta Forge614 con la variable de entorno `FORGE614_HOME`. Si no es válida imprime el
 * sobre de error de siempre y marca la salida 1.
 * @returns La carpeta Forge614, o `undefined` si la variable no es válida (el error ya se imprimió).
 */
function resolveForgeHomeOrReport(): string | undefined {
  try {
    return resolveForgeHome(process.env, homedir());
  } catch (error) {
    if (!(error instanceof ForgeHomeError)) throw error;
    printJson({ schemaVersion: 1, status: "error", error: { code: error.code, message: error.message } });
    process.exitCode = 1;
    return undefined;
  }
}

/**
 * Ejecuta `init` sobre un proyecto: resuelve la carpeta Forge614, abre Engram y corre el análisis.
 * Si `FORGE614_HOME` no es válida responde con el sobre de error y NO abre Engram.
 * @param directory Carpeta del proyecto a contextualizar.
 * @param requestedEngineId Motor pedido con `--engine`, si lo hay.
 * @param force Si es `true`, rehace un análisis que ya estaba completo.
 */
export async function runInit(directory: string, requestedEngineId: string | undefined, force: boolean): Promise<void> {
  const forgeHome = resolveForgeHomeOrReport();
  if (forgeHome === undefined) return;

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

/**
 * Ejecuta `update`: baja y corre el instalador publicado y responde con las versiones. No abre Engram.
 * @param args Argumentos después de `update`; no acepta ninguno.
 * @param currentVersion Versión del programa en ejecución.
 */
export async function runUpdate(args: string[], currentVersion: string): Promise<void> {
  const forgeHome = resolveForgeHomeOrReport();
  if (forgeHome === undefined) return;
  const outcome = await runUpdateCommand(args, currentVersion, forgeHome);
  printJson(outcome.payload);
  process.exitCode = outcome.exitCode;
}

/**
 * Pregunta algo en la terminal y espera la respuesta; la pregunta sale por la salida de errores para no
 * ensuciar el JSON de la salida estándar.
 * @param question Texto de la pregunta.
 * @returns Lo que la persona escribió, sin el salto de línea.
 */
function askInTerminal(question: string): Promise<string> {
  const reader = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise<string>(resolve => reader.question(question, answer => {
    reader.close();
    resolve(answer);
  }));
}

/**
 * Ejecuta `uninstall`: retira Atlas del disco. No abre Engram.
 * @param args Argumentos después de `uninstall`.
 */
export async function runUninstall(args: string[]): Promise<void> {
  process.exitCode = await runUninstallCommand(args, process.env, {
    isTerminal: process.stdin.isTTY === true,
    ask: askInTerminal,
    print: printJson,
    warn: message => console.error(message),
  });
}
