/**
 * Implementa `forge614-atlas uninstall`: valida los argumentos, pide confirmación (salvo con `--confirmed`) y ejecuta
 * el plan de borrado de `src/modules/uninstall`. Lo llama `runUninstall`, de `src/interfaces/cli/commands.ts`.
 */
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { ForgeHomeError, resolveForgeHome } from "../../modules/forge-home/forge-home";
import { UninstallError, planUninstall } from "../../modules/uninstall/uninstall";

/** Frase exacta que la persona debe escribir para confirmar sin `--confirmed`. */
export const UNINSTALL_CONFIRMATION_PHRASE = "REMOVE FORGE614-ATLAS";

/** Lo que el comando necesita del proceso; sustituible en pruebas. */
export interface UninstallIo {
  /** Si la entrada estándar es una terminal (solo entonces se puede preguntar). */
  isTerminal: boolean;
  /** Muestra la pregunta y devuelve lo que la persona escribió, sin el salto de línea. */
  ask: (question: string) => Promise<string>;
  /** Imprime la respuesta JSON en la salida estándar. */
  print: (payload: object) => void;
  /** Imprime una línea de texto plano en la salida estándar. */
  writeLine?: (line: string) => void;
  /** Directorio de trabajo del proceso a verificar (por defecto `process.cwd()`). */
  cwd?: string;
}

/**
 * Arma la respuesta de error en JSON (texto con campos): `{ schemaVersion: 1, status: "error", error: { code, message } }`.
 * @param code Código del error.
 * @param message Mensaje para la persona.
 * @returns El objeto listo para imprimir.
 */
function failure(code: string, message: string): object {
  return { schemaVersion: 1, status: "error", error: { code, message } };
}

/**
 * Da la carpeta personal del usuario: `$HOME` si es una ruta absoluta, y si no la que dé el sistema.
 * @param env Variables de entorno.
 * @returns La ruta a usar como directorio personal.
 */
function resolveHome(env: Record<string, string | undefined>): string {
  const configured = env.HOME;
  return configured && isAbsolute(configured) ? configured : homedir();
}

/**
 * Ejecuta `forge614-atlas uninstall [--from forge614-engram] [--confirmed] [--json] [--self]`.
 * `--self` responde que no hay integraciones que retirar con salida 0.
 * Retira SOLO la carpeta `<forgeHome>/atlas` (`FORGE614_HOME`, o `<home>/.forge614` si no está definida)
 * y el bloque de PATH que puso el instalador; nunca toca Engram, Engines, Shell, Workers, las memorias ni otros archivos.
 * Rechaza la desinstalación si el directorio actual está dentro de la carpeta de Atlas (`realpathSync.native`).
 * @param args Argumentos después de `uninstall`.
 * @param env Variables de entorno (`HOME` y `FORGE614_HOME`).
 * @param io Si hay terminal, cómo preguntar y cómo imprimir la respuesta.
 * @returns El código de salida: 0 si salió bien, 1 si hubo un error, 130 si la persona canceló.
 */
export async function runUninstallCommand(args: string[], env: Record<string, string | undefined>, io: UninstallIo): Promise<number> {
  let confirmed = false;
  let json = false;
  let self = false;

  // Se recorren los argumentos: `--confirmed` salta la pregunta; `--from` exige el valor `forge614-engram`; cualquier otro se rechaza.
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--confirmed") {
      confirmed = true;
    } else if (argument === "--json") {
      json = true;
    } else if (argument === "--self") {
      self = true;
    } else if (argument === "--help" || argument === "-h") {
      const helpMsg = "forge614-atlas uninstall [--from forge614-engram] [--confirmed] [--json] [--self]";
      if (io.writeLine) io.writeLine(helpMsg); else io.print({ message: helpMsg });
      return 0;
    } else if (argument === "--from") {
      const value = args[index + 1];
      if (value !== "forge614-engram") {
        io.print(failure("INVALID_ARGUMENT", "--from only accepts forge614-engram."));
        return 1;
      }
      index += 1;
    } else {
      io.print(failure("INVALID_ARGUMENT", `Unknown argument for uninstall: ${argument}`));
      return 1;
    }
  }

  if (self) {
    if (json) {
      io.print({ schemaVersion: 1, result: { integrationsRemoved: true } });
    } else {
      const msg = "forge614-atlas no tiene integraciones de asistentes que retirar.";
      if (io.writeLine) io.writeLine(msg); else io.print({ message: msg });
    }
    return 0;
  }

  // Se comprueba todo el plan antes de preguntar o de tocar algo; un error previsto sale como respuesta con código 1.
  const home = resolveHome(env);
  let forgeHome: string;
  try {
    forgeHome = resolveForgeHome(env, home);
  } catch (error) {
    if (error instanceof ForgeHomeError) {
      io.print(failure(error.code, error.message));
      return 1;
    }
    throw error;
  }

  // Se comprueba que el directorio actual no dependa de la carpeta de Atlas que se va a borrar.
  const atlas = join(forgeHome, "atlas");
  try {
    const root = realpathSync.native(atlas);
    const current = realpathSync.native(io.cwd ?? process.cwd());
    const child = relative(root, current);
    if (child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child))) {
      io.print(failure("UNINSTALL_FAILED", "uninstall cannot run from inside FORGE614_HOME/atlas"));
      return 1;
    }
  } catch {
    // Si la carpeta de Atlas no existe, realpathSync lanza ENOENT; se ignora con seguridad.
  }

  let plan;
  try {
    plan = planUninstall(forgeHome, home);
  } catch (error) {
    if (error instanceof UninstallError) {
      io.print(failure(error.code, error.message));
      return 1;
    }
    throw error;
  }

  // Sin `--confirmed` hace falta una terminal donde escribir la confirmación; escribir otra cosa cancela con código 130.
  if (!confirmed) {
    if (!io.isTerminal) {
      io.print(failure("CONFIRMATION_REQUIRED", `Run it from a terminal and type ${UNINSTALL_CONFIRMATION_PHRASE}, or pass --confirmed.`));
      return 1;
    }
    const answer = await io.ask(`This removes Forge614 Atlas. Type exactly ${UNINSTALL_CONFIRMATION_PHRASE} to confirm: `);
    const normalized = answer.trim().toLowerCase();
    if (answer !== UNINSTALL_CONFIRMATION_PHRASE && normalized !== "s" && normalized !== "y") {
      io.print(failure("UNINSTALL_CANCELLED", "The confirmation did not match; nothing was removed."));
      return 130;
    }
  }

  // Se quitan los bloques de PATH de los perfiles; si falla, no se toca la carpeta de Atlas.
  let pathPublications: string[];
  try {
    pathPublications = plan.removePathBlocks();
  } catch (error) {
    if (error instanceof UninstallError) {
      io.print(failure(error.code, error.message));
      return 1;
    }
    throw error;
  }

  // La carpeta se borra ANTES de responder: el binario en ejecución puede borrarse en macOS y Linux, y así
  // nunca se imprime `uninstalled` si el borrado falla (Engram solo mira el código de salida, pero la
  // persona lee la respuesta).
  try {
    plan.removeFolder();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    io.print(
      failure(
        "UNINSTALL_FAILED",
        `The Forge614 Atlas folder could not be removed (${reason}). The PATH blocks were already removed.`,
      ),
    );
    return 1;
  }

  if (existsSync(atlas)) {
    io.print(
      failure(
        "UNINSTALL_FAILED",
        "The Forge614 Atlas folder could not be removed. The PATH blocks were already removed.",
      ),
    );
    return 1;
  }

  if (json) {
    io.print({
      schemaVersion: 1,
      status: "uninstalled",
      result: { removed: plan.hasFolder },
      removed: plan.hasFolder,
      pathPublications,
    });
  } else {
    const msg = plan.hasFolder ? "forge614-atlas se desinstaló." : "forge614-atlas no estaba instalado.";
    if (io.writeLine) io.writeLine(msg); else io.print({ message: msg });
  }
  return 0;
}
