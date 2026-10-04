import { chmodSync, lstatSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync, type Stats } from "node:fs";
import { join } from "node:path";
import { PathBlockError, removePathBlocks } from "./path-block";

/** Códigos de error de la desinstalación. */
export type UninstallErrorCode = "UNINSTALL_UNSAFE" | "PATH_REMOVE_FAILED";

/** Algo impide desinstalar con seguridad; no se borró ni se reescribió nada que no se haya dicho. */
export class UninstallError extends Error {
  readonly code: UninstallErrorCode;

  constructor(code: UninstallErrorCode, message: string) {
    super(message);
    this.name = "UninstallError";
    this.code = code;
  }
}

/** Un archivo de perfil de shell que el plan va a cambiar. */
interface PlannedPathChange {
  path: string;
  /** Texto nuevo del archivo; `null` significa borrar el archivo (solo el archivo de fish que solo traía el bloque). */
  content: string | null;
  mode: number;
}

/** Lo que la desinstalación hará, ya comprobado. Crearlo no cambia nada en el disco. */
export interface UninstallPlan {
  /** Si existe la carpeta de Atlas que se va a borrar. */
  hasFolder: boolean;
  /** Archivos de perfil de shell que cambiarán, en el orden en que se aplican. */
  pathFiles: string[];
  /** Quita los bloques de PATH. @returns Los archivos que cambió. @throws UninstallError con código `PATH_REMOVE_FAILED`. */
  removePathBlocks(): string[];
  /** Borra la carpeta de Atlas, si existía. @throws UninstallError con código `UNINSTALL_UNSAFE` si cambió a algo inseguro. */
  removeFolder(): void;
}

/** Como `lstatSync`, pero da `null` si la ruta no existe. */
function lstatOrNull(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Confirma que `path` es una carpeta real: ni enlace simbólico ni otro tipo de archivo. */
function isRealDirectory(path: string): boolean {
  const entry = lstatOrNull(path);
  return entry !== null && entry.isDirectory() && !entry.isSymbolicLink();
}

/**
 * Comprueba todo lo que la desinstalación va a tocar y arma el plan, sin cambiar nada. Solo se tocan la
 * carpeta `<forgeHome>/atlas` y el bloque de PATH de Atlas en `~/.zshrc`, `~/.bash_profile`, `~/.bashrc`
 * y `~/.config/fish/conf.d/forge614-atlas.fish`; nunca Engram, Engines, Shell, Workers ni las memorias.
 * @param forgeHome Carpeta Forge614 ya resuelta (ver `resolveForgeHome`).
 * @param home Carpeta personal del usuario, donde viven los archivos de perfil de shell.
 * @returns El plan, con las operaciones para aplicarlo en el orden correcto.
 * @throws UninstallError con código `UNINSTALL_UNSAFE` si `<forgeHome>` o `<forgeHome>/atlas` existen
 * pero no son carpetas reales (por ejemplo un enlace simbólico); con código `PATH_REMOVE_FAILED` si un
 * archivo de perfil es un enlace, no es un archivo normal, no se puede leer o tiene marcas desparejas.
 */
export function planUninstall(forgeHome: string, home: string): UninstallPlan {
  const atlas = join(forgeHome, "atlas");

  const forgeEntry = lstatOrNull(forgeHome);
  if (forgeEntry !== null && !isRealDirectory(forgeHome)) {
    throw new UninstallError("UNINSTALL_UNSAFE", "The Forge614 folder is not a real folder; nothing was removed.");
  }
  const atlasEntry = lstatOrNull(atlas);
  if (atlasEntry !== null && !isRealDirectory(atlas)) {
    throw new UninstallError("UNINSTALL_UNSAFE", "The Forge614 Atlas folder is not a real folder; nothing was removed.");
  }

  const candidates: readonly { path: string; deleteWhenEmpty: boolean }[] = [
    { path: join(home, ".zshrc"), deleteWhenEmpty: false },
    { path: join(home, ".bash_profile"), deleteWhenEmpty: false },
    { path: join(home, ".bashrc"), deleteWhenEmpty: false },
    { path: join(home, ".config", "fish", "conf.d", "forge614-atlas.fish"), deleteWhenEmpty: true },
  ];

  const changes: PlannedPathChange[] = [];
  for (const candidate of candidates) {
    const failure = (reason: string) =>
      new UninstallError("PATH_REMOVE_FAILED", `The Forge614 Atlas PATH block in ${candidate.path} cannot be removed safely: ${reason}`);
    const entry = lstatOrNull(candidate.path);
    if (entry === null) continue;
    if (entry.isSymbolicLink() || !entry.isFile()) throw failure("it is not a regular file.");
    let text: string;
    try {
      text = readFileSync(candidate.path, "utf8");
    } catch {
      throw failure("it cannot be read.");
    }
    let removal;
    try {
      removal = removePathBlocks(text);
    } catch (error) {
      if (error instanceof PathBlockError) throw failure(error.message);
      throw error;
    }
    if (!removal.found) continue;
    changes.push({
      path: candidate.path,
      content: candidate.deleteWhenEmpty && removal.content.trim() === "" ? null : removal.content,
      mode: entry.mode & 0o777,
    });
  }

  return {
    hasFolder: atlasEntry !== null,
    pathFiles: changes.map(change => change.path),
    removePathBlocks() {
      for (const change of changes) {
        try {
          if (change.content === null) {
            unlinkSync(change.path);
          } else {
            const temporary = `${change.path}.forge614-atlas-${process.pid}.tmp`;
            writeFileSync(temporary, change.content, { mode: change.mode });
            chmodSync(temporary, change.mode);
            renameSync(temporary, change.path);
          }
        } catch {
          throw new UninstallError("PATH_REMOVE_FAILED", `The Forge614 Atlas PATH block in ${change.path} could not be rewritten.`);
        }
      }
      return changes.map(change => change.path);
    },
    removeFolder() {
      if (atlasEntry === null) return;
      // Se vuelve a comprobar justo antes de borrar: entre el plan y el borrado la ruta no debe haberse vuelto un enlace.
      if (!isRealDirectory(atlas)) {
        throw new UninstallError("UNINSTALL_UNSAFE", "The Forge614 Atlas folder is not a real folder; it was not removed.");
      }
      rmSync(atlas, { recursive: true, force: false, maxRetries: 0 });
    },
  };
}
