/**
 * Autoactualización de Forge614 Atlas: baja el instalador publicado con la última versión y lo corre con
 * `--force` (la opción que le permite reemplazar la instalación existente), y luego informa qué versión quedó
 * instalada. Toda dependencia externa (la descarga, el lanzamiento del proceso y la lectura de la versión instalada)
 * se puede sustituir por parámetro para probar el flujo sin red ni un instalador real. Sigue el mismo orden de
 * descarga, ejecución y lectura de versión que `updater.ts` de Forge614 Workers (son archivos separados, sin código
 * común); aquí `runUpdateCommand` devuelve el código de salida y la respuesta JSON (texto con campos), y
 * `src/interfaces/cli/commands.ts` la imprime.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Instalador que acompaña cada release (versión publicada en GitHub) de Atlas; `latest` apunta al de la release más reciente (sin contar borradores ni versiones previas). */
export const LATEST_INSTALLER_URL = "https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh";

/** Opciones al lanzar el proceso del instalador: `inherit` muestra su salida en la terminal actual. */
type SpawnOptions = { stdio: "inherit" };
/** Forma de un lanzador de procesos: recibe comando, argumentos y salida heredada; devuelve estado y posible error.
 * Las pruebas lo sustituyen por uno que no corre nada real.
 */
type Spawn = (command: string, args: string[], options?: SpawnOptions) => { status: number | null; error?: Error };
/** Forma de la descarga del instalador: devuelve su ruta y una función que borra el temporal.
 * Las pruebas la sustituyen por una que nunca toca la red.
 */
type Download = (url: string) => Promise<{ installer: string; cleanup: () => void }>;
/** Forma de la lectura de la versión instalada; las pruebas la sustituyen por una constante. */
type ReadInstalledVersion = () => string;

/** Resultado de un intento de actualización. */
export interface UpdateResult {
  /** Si la versión instalada después del intento es distinta de la del programa en ejecución. */
  updated: boolean;
  /** Versión del programa en ejecución, que se toma como la instalada antes del intento. */
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
 * @throws Error del proceso si el comando no corre o sale con código distinto de 0, o Error de validación si lo que imprime no es exactamente `forge614-atlas X.Y.Z` (con un posible sufijo de versión como `-rc.1`).
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
 * @throws Error con el mensaje de descarga si el servidor responde con un estado HTTP de error (el número con que un
 * servidor web indica un fallo, como 404); propaga los errores de `fetch` (la función estándar que descarga de la red)
 * ante fallas de red y los del sistema de archivos al crear o escribir el temporal.
 */
export async function downloadInstaller(url: string): Promise<{ installer: string; cleanup: () => void }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not download the Forge614 Atlas installer.");
  // Solo se crea el temporal después de una respuesta correcta; el permiso 700 permite ejecutarlo sin abrirlo a otros.
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
 * @param options Sustituciones opcionales de descarga, ejecución y lectura de versión para las pruebas.
 * @param options.download Descarga a usar; por defecto una descarga HTTP real.
 * @param options.spawn Lanzador de procesos; por defecto `spawnSync`, heredando la terminal para que se vean los mensajes del instalador.
 * @param options.readInstalledVersion Lectura de la versión tras instalar; por defecto corre el comando instalado.
 * @returns Si la versión cambió, la anterior y la instalada.
 * @throws Error de descarga; Error del proceso si el instalador no arranca o si, al leer la versión, el comando instalado no corre; Error del instalador si sale con estado distinto de 0 o termina por una señal; Error de validación si la versión instalada no tiene la forma esperada. También propaga errores de limpieza del temporal.
 */
export async function updateInstalledAtlas(
  currentVersion: string,
  forgeHome: string,
  options: { download?: Download; spawn?: Spawn; readInstalledVersion?: ReadInstalledVersion } = {},
): Promise<UpdateResult> {
  const downloaded = await (options.download ?? downloadInstaller)(LATEST_INSTALLER_URL);
  const spawn: Spawn = options.spawn ?? ((command, args, spawnOptions) => spawnSync(command, args, spawnOptions));
  try {
    // El instalador recibe `--force` porque la ruta activa ya puede contener una versión anterior.
    const result = spawn("bash", [downloaded.installer, "--force"], { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error("The Forge614 Atlas installer failed; the installed version was not confirmed.");
    }
    // Se lee el binario instalado después del éxito; `updated` compara esa versión con la del proceso en ejecución.
    const installedVersion = (options.readInstalledVersion ?? (() => readVersionOf(installedAtlasCommand(forgeHome))))();
    return { updated: installedVersion !== currentVersion, previousVersion: currentVersion, installedVersion };
  } finally {
    // El temporal se borra tanto si el instalador termina bien como si falla o informa una versión inválida.
    downloaded.cleanup();
  }
}

/** Lo que el comando `update` responde: el JSON a imprimir y el código de salida. */
export interface UpdateCommandOutcome {
  /** Código 0 ante éxito, 1 ante argumentos sobrantes o actualización fallida. */
  exitCode: number;
  /** Respuesta con estado y versiones, o con el código y mensaje del error. */
  payload: object;
}

/**
 * Ejecuta el comando `update`: valida sus argumentos, actualiza y arma la respuesta JSON. No imprime nada
 * por sí mismo, para poder probarlo sin tocar la salida del proceso.
 * @param args Argumentos después de `update`; no acepta ninguno.
 * @param currentVersion Versión del programa en ejecución.
 * @param forgeHome Carpeta Forge614 ya resuelta.
 * @param update Actualización a correr; por defecto {@link updateInstalledAtlas}.
 * @returns Código 0 con `status: "updated"` (también si la versión no cambió: eso lo dice el campo `updated`), o código 1 con respuesta de error (`INVALID_ARGUMENT` si sobran argumentos, `UPDATE_FAILED` si la actualización falla). No lanza: todo error de `update` se convierte en `UPDATE_FAILED`.
 */
export async function runUpdateCommand(
  args: string[],
  currentVersion: string,
  forgeHome: string,
  update: (currentVersion: string, forgeHome: string) => Promise<UpdateResult> = updateInstalledAtlas,
): Promise<UpdateCommandOutcome> {
  if (args.length > 0) {
    // Los argumentos sobrantes se rechazan antes de llamar a la función de actualización.
    return {
      exitCode: 1,
      payload: { schemaVersion: 1, status: "error", error: { code: "INVALID_ARGUMENT", message: "forge614-atlas update takes no arguments." } },
    };
  }
  try {
    const result = await update(currentVersion, forgeHome);
    return { exitCode: 0, payload: { schemaVersion: 1, status: "updated", ...result } };
  } catch (error) {
    // Solo los fallos de actualización se convierten en `UPDATE_FAILED`; se conserva su mensaje.
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
