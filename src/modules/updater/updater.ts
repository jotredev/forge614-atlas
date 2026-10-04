/**
 * Autoactualización de Forge614 Atlas: baja el instalador publicado con la última versión y lo corre con
 * `--force`, y luego informa qué versión quedó instalada. Toda dependencia externa (la descarga, el
 * lanzamiento del proceso y la lectura de la versión instalada) se puede sustituir por parámetro para
 * probar el flujo sin red ni un instalador real. Sigue la misma forma que `updater.ts` de Forge614 Workers.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Instalador que acompaña cada release de Atlas; `latest` siempre apunta al más nuevo. */
export const LATEST_INSTALLER_URL = "https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh";

/** Opciones al lanzar el proceso del instalador. */
type SpawnOptions = { stdio: "inherit" };
/** Forma de un lanzador de procesos; las pruebas lo sustituyen por uno que no corre nada real. */
type Spawn = (command: string, args: string[], options?: SpawnOptions) => { status: number | null; error?: Error };
/** Forma de la descarga del instalador; las pruebas la sustituyen por una que nunca toca la red. */
type Download = (url: string) => Promise<{ installer: string; cleanup: () => void }>;
/** Forma de la lectura de la versión instalada; las pruebas la sustituyen por una constante. */
type ReadInstalledVersion = () => string;

/** Resultado de un intento de actualización. */
export interface UpdateResult {
  /** Si la versión instalada cambió. */
  updated: boolean;
  /** Versión que estaba instalada antes del intento. */
  previousVersion: string;
  /** Versión instalada después del intento (igual a `previousVersion` si nada cambió). */
  installedVersion: string;
}

/**
 * Da la ruta donde el instalador deja el comando activo de Atlas.
 * @param forgeHome Carpeta Forge614 ya resuelta (ver `resolveForgeHome`).
 * @returns La ruta absoluta de `forge614-atlas` dentro de `<forgeHome>/atlas/bin`.
 */
export function installedAtlasCommand(forgeHome: string): string {
  return join(forgeHome, "atlas", "bin", "forge614-atlas");
}

/**
 * Corre el comando instalado con `--version` y comprueba la forma de su respuesta.
 * @param command Ruta del comando instalado.
 * @returns La versión informada, por ejemplo `1.1.0`.
 * @throws Error si el comando no corre o no imprime exactamente `forge614-atlas X.Y.Z[...]`.
 */
function readVersionOf(command: string): string {
  const output = execFileSync(command, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const match = /^forge614-atlas\s+([0-9]+\.[0-9]+\.[0-9]+(?:[.-][0-9A-Za-z][0-9A-Za-z.-]*)?)$/.exec(output);
  if (!match) throw new Error("The installed Forge614 Atlas did not report a valid version.");
  return match[1]!;
}

/**
 * Baja un instalador a un archivo temporal privado marcado como ejecutable.
 * @param url De dónde bajar el instalador.
 * @returns La ruta del instalador y un `cleanup` que borra su carpeta temporal.
 * @throws Error con un mensaje claro si el servidor responde con un estado HTTP de error; una falla de
 * red rechaza con el error propio de `fetch`.
 */
export async function downloadInstaller(url: string): Promise<{ installer: string; cleanup: () => void }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not download the Forge614 Atlas installer.");
  const directory = mkdtempSync(join(tmpdir(), "forge614-atlas-update-"));
  const installer = join(directory, "install.sh");
  writeFileSync(installer, new Uint8Array(await response.arrayBuffer()), { mode: 0o600 });
  chmodSync(installer, 0o700);
  return { installer, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

/**
 * Baja el instalador más reciente y lo corre con `--force` para reemplazar la versión activa, y luego lee
 * qué versión quedó instalada. El archivo descargado se borra siempre, aun si la instalación falla.
 * @param currentVersion Versión del programa en ejecución, tomada como la instalada antes de actualizar.
 * @param forgeHome Carpeta Forge614 ya resuelta; de ahí se lee la versión instalada.
 * @param options.download Descarga a usar; por defecto una descarga HTTP real.
 * @param options.spawn Lanzador de procesos; por defecto `spawnSync`, heredando la terminal para que se vean los mensajes del instalador.
 * @param options.readInstalledVersion Lectura de la versión tras instalar; por defecto corre el comando instalado.
 * @returns Si la versión cambió, la anterior y la instalada.
 * @throws Error si falla la descarga, si el instalador no arranca o sale con código distinto de 0, o si el comando instalado no informa una versión válida.
 */
export async function updateInstalledAtlas(
  currentVersion: string,
  forgeHome: string,
  options: { download?: Download; spawn?: Spawn; readInstalledVersion?: ReadInstalledVersion } = {},
): Promise<UpdateResult> {
  const downloaded = await (options.download ?? downloadInstaller)(LATEST_INSTALLER_URL);
  const spawn: Spawn = options.spawn ?? ((command, args, spawnOptions) => spawnSync(command, args, spawnOptions));
  try {
    const result = spawn("bash", [downloaded.installer, "--force"], { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error("The Forge614 Atlas installer failed; the installed version was not confirmed.");
    }
    const installedVersion = (options.readInstalledVersion ?? (() => readVersionOf(installedAtlasCommand(forgeHome))))();
    return { updated: installedVersion !== currentVersion, previousVersion: currentVersion, installedVersion };
  } finally {
    downloaded.cleanup();
  }
}

/** Lo que el comando `update` responde: el JSON a imprimir y el código de salida. */
export interface UpdateCommandOutcome {
  exitCode: number;
  payload: object;
}

/**
 * Ejecuta el comando `update`: valida sus argumentos, actualiza y arma la respuesta JSON. No imprime nada
 * por sí mismo, para poder probarlo sin tocar la salida del proceso.
 * @param args Argumentos después de `update`; no acepta ninguno.
 * @param currentVersion Versión del programa en ejecución.
 * @param forgeHome Carpeta Forge614 ya resuelta.
 * @param update Actualización a correr; por defecto {@link updateInstalledAtlas}.
 * @returns Código 0 con `status: "updated"`, o código 1 con el sobre de error (`INVALID_ARGUMENT` si sobran argumentos, `UPDATE_FAILED` si la actualización falla).
 */
export async function runUpdateCommand(
  args: string[],
  currentVersion: string,
  forgeHome: string,
  update: (currentVersion: string, forgeHome: string) => Promise<UpdateResult> = updateInstalledAtlas,
): Promise<UpdateCommandOutcome> {
  if (args.length > 0) {
    return {
      exitCode: 1,
      payload: { schemaVersion: 1, status: "error", error: { code: "INVALID_ARGUMENT", message: "forge614-atlas update takes no arguments." } },
    };
  }
  try {
    const result = await update(currentVersion, forgeHome);
    return { exitCode: 0, payload: { schemaVersion: 1, status: "updated", ...result } };
  } catch (error) {
    return {
      exitCode: 1,
      payload: {
        schemaVersion: 1,
        status: "error",
        error: { code: "UPDATE_FAILED", message: error instanceof Error ? error.message : String(error) },
      },
    };
  }
}
