/**
 * Autoactualización de Forge614 Atlas: baja el portero publicado con la versión requerida o la más reciente,
 * verifica su integridad contra SHA256SUMS con formato GNU estricto, lo corre para actualizar y luego
 * informa qué versión quedó instalada.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Repositorio oficial de Forge614 Atlas en GitHub. */
export const REPOSITORY = "jotredev/forge614-atlas";

/** Instalador que acompaña cada release de Atlas; mantenido por compatibilidad hacia atrás. */
export const LATEST_INSTALLER_URL = `https://github.com/${REPOSITORY}/releases/latest/download/install.sh`;

/** Opciones al lanzar el proceso del instalador: `inherit` muestra su salida en la terminal actual. */
type SpawnOptions = { stdio: "inherit" };

/** Forma de un lanzador de procesos: recibe comando, argumentos y salida heredada; devuelve estado y posible error. */
type Spawn = (command: string, args: string[], options?: SpawnOptions) => { status: number | null; error?: Error };

/** Forma de la descarga del instalador: devuelve su ruta y una función que borra el temporal. */
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
 * @returns La versión informada, por ejemplo `1.2.0`.
 * @throws Error del proceso si el comando no corre o sale con código distinto de 0, o Error de validación si lo que imprime no es exactamente `forge614-atlas X.Y.Z` (con un posible sufijo de versión como `-rc.1`).
 */
function readVersionOf(command: string): string {
  const output = execFileSync(command, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const match = /^forge614-atlas\s+([0-9]+\.[0-9]+\.[0-9]+(?:[.-][0-9A-Za-z][0-9A-Za-z.-]*)?)$/.exec(output);
  if (!match) throw new Error("The installed Forge614 Atlas did not report a valid version.");
  return match[1]!;
}

/**
 * Valida la dirección base de pruebas local (puerto HTTP en loopback) si está definida en `FORGE614_INSTALL_TEST_BASE_URL`.
 * @param env Variables de entorno (por defecto `process.env`).
 * @returns El origen HTTP validado o `undefined` si no está definida.
 * @throws Error si la URL no es HTTP loopback (127.0.0.1 o [::1]).
 */
export function resolveTestBaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const candidate = env.FORGE614_INSTALL_TEST_BASE_URL;
  if (!candidate) return undefined;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("FORGE614_INSTALL_TEST_BASE_URL only accepts loopback HTTP.");
  }
  const localHost = url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "::1";
  if (url.protocol !== "http:" || !localHost || !url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("FORGE614_INSTALL_TEST_BASE_URL only accepts loopback HTTP.");
  }
  return url.origin;
}

/**
 * Resuelve la etiqueta de versión a instalar: la pedida o la más reciente consultada por API.
 * @param base Origen de pruebas si aplica.
 * @param requestedTag Etiqueta pedida opcional (ej. `1.2.0` o `v1.2.0`).
 * @param fetcher Función de descarga HTTP.
 * @returns La etiqueta formateada como `vX.Y.Z`.
 */
export async function resolveReleaseTag(
  base: string | undefined,
  requestedTag?: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (requestedTag !== undefined) {
    if (!/^v?\d+\.\d+\.\d+(?:[.-][0-9A-Za-z.-]+)?$/.test(requestedTag)) {
      throw new Error(`invalid version '${requestedTag}'`);
    }
    return requestedTag.startsWith("v") ? requestedTag : `v${requestedTag}`;
  }
  const url = base ? `${base}/repos/${REPOSITORY}/releases/latest` : `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
  let response: Response;
  try {
    response = await fetcher(url, { headers: { Accept: "application/vnd.github+json" } });
  } catch (error) {
    throw new Error(`Could not resolve the latest release: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    throw new Error(`Could not resolve the latest release (HTTP ${response.status}).`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The latest release response was not valid JSON.");
  }
  const tag = typeof payload === "object" && payload !== null && "tag_name" in payload ? String((payload as { tag_name: unknown }).tag_name) : "";
  if (!/^v?\d+\.\d+\.\d+(?:[.-][0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Error("The latest Forge614 Atlas release has an invalid tag.");
  }
  return tag.startsWith("v") ? tag : `v${tag}`;
}

/**
 * Verifica que el contenido de un activo coincida exactamente con su entrada en SHA256SUMS con formato GNU estricto.
 * @param filename Nombre del archivo en SHA256SUMS.
 * @param bytes Contenido descargado.
 * @param sums Contenido completo del archivo SHA256SUMS.
 * @throws Error si SHA256SUMS no sigue formato GNU o si la suma no coincide.
 */
export function verifyGnuSha256(filename: string, bytes: Uint8Array, sums: string): void {
  const lines = sums.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const entries = lines.map(line => /^([0-9a-f]{64})  ([^\r\n]+)$/.exec(line));
  if (entries.length === 0 || entries.some(entry => entry === null)) {
    throw new Error("SHA256SUMS does not use strict GNU SHA-256 format.");
  }
  const matches = entries.filter(entry => entry?.[2] === filename);
  if (matches.length !== 1 || !matches[0]?.[1]) {
    throw new Error(`SHA256SUMS has no unique entry for ${filename}.`);
  }
  const expectedHash = matches[0][1];
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(`SHA-256 verification failed for ${filename}.`);
  }
}

/**
 * Baja un instalador a un archivo temporal privado marcado como ejecutable (mantenido por compatibilidad de pruebas).
 * @param url De dónde bajar el instalador.
 * @returns La ruta del instalador y un `cleanup` que borra su carpeta temporal.
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

/** Opciones opcionales para actualizar Atlas. */
export interface UpdateOptions {
  /** Etiqueta de versión específica solicitada con `--version`. */
  versionTag?: string;
  /** Variables de entorno para comprobar configuración de pruebas. */
  env?: Record<string, string | undefined>;
  /** Función de fetch inyectable. */
  fetcher?: typeof fetch;
  /** Función sustituible de descarga (compatibilidad con pruebas unitarias heredadas). */
  download?: Download;
  /** Función sustituible de lanzamiento de procesos. */
  spawn?: Spawn;
  /** Función sustituible de lectura de versión instalada. */
  readInstalledVersion?: ReadInstalledVersion;
  /** Plataforma destino (por defecto `process.platform`). */
  platform?: string;
}

/**
 * Baja el portero de instalación de la release resuelta, verifica su SHA-256 en SHA256SUMS y lo ejecuta
 * para reemplazar la versión activa, y luego lee qué versión quedó instalada.
 * @param currentVersion Versión del programa en ejecución, tomada como la instalada antes de actualizar.
 * @param forgeHome Carpeta Forge614 ya resuelta.
 * @param options Sustituciones opcionales de descarga, ejecución y lectura de versión para las pruebas.
 * @returns Si la versión cambió, la anterior y la instalada.
 */
export async function updateInstalledAtlas(
  currentVersion: string,
  forgeHome: string,
  options: UpdateOptions = {},
): Promise<UpdateResult> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const spawn: Spawn = options.spawn ?? ((command, args, spawnOptions) => spawnSync(command, args, spawnOptions));

  let downloaded: { installer: string; cleanup: () => void };
  let spawnCommand: string;
  let spawnArgs: string[];

  if (options.download) {
    downloaded = await options.download(LATEST_INSTALLER_URL);
    spawnCommand = "bash";
    spawnArgs = [downloaded.installer, "--force"];
  } else {
    const base = resolveTestBaseUrl(env);
    const tag = await resolveReleaseTag(base, options.versionTag, options.fetcher ?? fetch);
    const file = platform === "win32" ? "install.ps1" : "install.sh";
    const fetcher = options.fetcher ?? fetch;

    const buildAssetUrl = (name: string) => {
      const path = `releases/download/${encodeURIComponent(tag)}/${name}`;
      return base ? `${base}/repos/${REPOSITORY}/${path}` : `https://github.com/${REPOSITORY}/${path}`;
    };

    let assetResponse: Response;
    try {
      assetResponse = await fetcher(buildAssetUrl(file));
    } catch (error) {
      throw new Error(`Could not download ${file} for ${tag}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!assetResponse.ok) {
      throw new Error(`Could not download ${file} for ${tag} (HTTP ${assetResponse.status}).`);
    }
    const assetBytes = new Uint8Array(await assetResponse.arrayBuffer());

    let sumsResponse: Response;
    try {
      sumsResponse = await fetcher(buildAssetUrl("SHA256SUMS"));
    } catch (error) {
      throw new Error(`Could not download SHA256SUMS for ${tag}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!sumsResponse.ok) {
      throw new Error(`Could not download SHA256SUMS for ${tag} (HTTP ${sumsResponse.status}).`);
    }
    const sumsText = await sumsResponse.text();

    verifyGnuSha256(file, assetBytes, sumsText);

    const directory = mkdtempSync(join(tmpdir(), "forge614-atlas-update-"));
    const installer = join(directory, file);
    writeFileSync(installer, assetBytes, { mode: 0o600 });
    if (platform !== "win32") {
      chmodSync(installer, 0o700);
    }
    downloaded = {
      installer,
      cleanup: () => rmSync(directory, { recursive: true, force: true }),
    };
    spawnCommand = platform === "win32" ? "powershell" : "bash";
    spawnArgs = platform === "win32"
      ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", installer, "--version", tag]
      : [installer, "--version", tag];
  }

  try {
    const result = spawn(spawnCommand, spawnArgs, { stdio: "inherit" });
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

/** Lo que el comando `update` responde: el JSON a imprimir y/o texto plano y el código de salida. */
export interface UpdateCommandOutcome {
  /** Código 0 ante éxito, 1 ante argumentos sobrantes o actualización fallida. */
  exitCode: number;
  /** Respuesta con estado y versiones, o con el código y mensaje del error. */
  payload?: object;
  /** Mensaje plano cuando no se pasa `--json`. */
  stdout?: string;
}

/**
 * Ejecuta el comando `update`: valida sus argumentos (`[--version X.Y.Z] [--json]`), actualiza y arma la respuesta.
 * @param args Argumentos después de `update`.
 * @param currentVersion Versión del programa en ejecución.
 * @param forgeHome Carpeta Forge614 ya resuelta.
 * @param update Actualización a correr; por defecto {@link updateInstalledAtlas}.
 * @returns Código 0 con éxito (texto o payload JSON), o código 1 con respuesta de error.
 */
export async function runUpdateCommand(
  args: string[],
  currentVersion: string,
  forgeHome: string,
  update: (currentVersion: string, forgeHome: string, options?: UpdateOptions) => Promise<UpdateResult> = updateInstalledAtlas,
): Promise<UpdateCommandOutcome> {
  let json = false;
  let versionTag: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--version") {
      const next = args[index + 1];
      if (!next || !/^v?\d+\.\d+\.\d+(?:[.-][0-9A-Za-z.-]+)?$/.test(next)) {
        return {
          exitCode: 1,
          payload: {
            schemaVersion: 1,
            status: "error",
            error: { code: "INVALID_ARGUMENT", message: `Invalid version format for update: ${next ?? ""}` },
          },
        };
      }
      versionTag = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      return {
        exitCode: 0,
        stdout: "forge614-atlas update [--version X.Y.Z] [--json]\n",
      };
    } else {
      return {
        exitCode: 1,
        payload: {
          schemaVersion: 1,
          status: "error",
          error: { code: "INVALID_ARGUMENT", message: `Unknown argument for update: ${arg}` },
        },
      };
    }
  }

  try {
    const result = await update(currentVersion, forgeHome, { versionTag, env: process.env });
    if (json) {
      return { exitCode: 0, payload: { schemaVersion: 1, status: "updated", ...result } };
    }
    const isEn = process.env.FORGE614_LOCALE === "en";
    const stdout = isEn
      ? (result.updated
          ? `forge614-atlas was updated from ${result.previousVersion} to ${result.installedVersion}.\n`
          : `forge614-atlas is already up to date (${result.installedVersion}).\n`)
      : (result.updated
          ? `forge614-atlas se actualizó de ${result.previousVersion} a ${result.installedVersion}.\n`
          : `forge614-atlas ya está al día (${result.installedVersion}).\n`);
    return { exitCode: 0, stdout };
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
