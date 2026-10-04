import { homedir } from "node:os";
import { isAbsolute } from "node:path";
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
  /** Avisa algo a la persona por la salida de errores, sin ensuciar el JSON. */
  warn: (message: string) => void;
}

function failure(code: string, message: string): object {
  return { schemaVersion: 1, status: "error", error: { code, message } };
}

/**
 * Da la carpeta personal del usuario: `$HOME` si es una ruta absoluta, y si no la que dé el sistema.
 * @param env Variables de entorno.
 */
function resolveHome(env: Record<string, string | undefined>): string {
  const configured = env.HOME;
  return configured && isAbsolute(configured) ? configured : homedir();
}

/**
 * Ejecuta `forge614-atlas uninstall [--from forge614-engram] [--confirmed]`. Retira SOLO la carpeta
 * `<FORGE614_HOME>/atlas` y el bloque de PATH que puso el instalador; nunca toca Engram, Engines, Shell,
 * Workers, las memorias ni otros archivos. Orden: comprobar todo, quitar los bloques de PATH, imprimir el
 * resultado y borrar la carpeta al final (así el resultado sale aunque el binario en ejecución viva ahí).
 * Es idempotente: si no hay nada que quitar, termina bien con `removed: false`.
 * @param args Argumentos después de `uninstall`.
 * @param env Variables de entorno (`HOME` y `FORGE614_HOME`).
 * @param io Terminal, pregunta e impresión.
 * @returns El código de salida: 0 si salió bien, 1 si hubo un error, 130 si la persona canceló.
 */
export async function runUninstallCommand(args: string[], env: Record<string, string | undefined>, io: UninstallIo): Promise<number> {
  let confirmed = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--confirmed") {
      confirmed = true;
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

  const home = resolveHome(env);
  let plan;
  try {
    plan = planUninstall(resolveForgeHome(env, home), home);
  } catch (error) {
    if (error instanceof ForgeHomeError || error instanceof UninstallError) {
      io.print(failure(error.code, error.message));
      return 1;
    }
    throw error;
  }

  if (!confirmed) {
    if (!io.isTerminal) {
      io.print(failure("CONFIRMATION_REQUIRED", `Run it from a terminal and type ${UNINSTALL_CONFIRMATION_PHRASE}, or pass --confirmed.`));
      return 1;
    }
    const answer = await io.ask(`This removes Forge614 Atlas. Type exactly ${UNINSTALL_CONFIRMATION_PHRASE} to confirm: `);
    if (answer !== UNINSTALL_CONFIRMATION_PHRASE) {
      io.print(failure("UNINSTALL_CANCELLED", "The confirmation did not match; nothing was removed."));
      return 130;
    }
  }

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

  io.print({ schemaVersion: 1, status: "uninstalled", removed: plan.hasFolder, pathPublications });

  try {
    plan.removeFolder();
  } catch (error) {
    io.warn(`The Forge614 Atlas folder could not be removed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  return 0;
}
