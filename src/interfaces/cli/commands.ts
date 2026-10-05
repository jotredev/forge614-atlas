/**
 * Conecta los comandos `init`, `update` y `uninstall` de Atlas con su lógica: usa las variables de entorno (valores que
 * el sistema da al programa), como `FORGE614_HOME`, imprime la respuesta en JSON (texto con campos) y fija el código de
 * salida del proceso. Lo llama `src/interfaces/cli/main.ts`.
 */
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
 * @param payload Cualquier valor serializable a JSON (texto con campos).
 */
export function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

/**
 * Resuelve la carpeta Forge614 con la variable de entorno `FORGE614_HOME`. Si no es válida imprime la respuesta de
 * error en JSON con el código `INVALID_FORGE614_HOME` y marca la salida 1.
 * @returns La carpeta Forge614, o `undefined` si la variable no es válida (el error ya se imprimió).
 * @throws Propaga cualquier error que no sea `ForgeHomeError` (código `INVALID_FORGE614_HOME`, que aquí se imprime en vez de lanzarse).
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
 * Si `FORGE614_HOME` no es válida responde con el error `INVALID_FORGE614_HOME` y NO abre Engram.
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
 * Ejecuta `update`: baja y corre el instalador publicado y responde con las versiones (`updated`, `previousVersion`, `installedVersion`), o con un error (`INVALID_FORGE614_HOME`, `INVALID_ARGUMENT` o `UPDATE_FAILED`) y salida 1. No abre Engram.
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
 * Ejecuta `uninstall`: retira Atlas del disco y deja como código de salida el que devuelve `runUninstallCommand` (0 bien, 1 error, 130 cancelado). No abre Engram.
 * @param args Argumentos después de `uninstall`.
 */
export async function runUninstall(args: string[]): Promise<void> {
  process.exitCode = await runUninstallCommand(args, process.env, {
    isTerminal: process.stdin.isTTY === true,
    ask: askInTerminal,
    print: printJson,
  });
}
