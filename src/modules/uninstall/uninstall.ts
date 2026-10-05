/**
 * Prepara la desinstalación de Atlas: comprueba la carpeta y cuatro perfiles de shell (archivos de inicio de la
 * terminal), y ofrece operaciones para quitar sus bloques de PATH (lista de carpetas donde se buscan programas) antes
 * de borrar Atlas. `uninstall-command.ts` ejecuta el plan y presenta el resultado a la persona.
 */
import { chmodSync, lstatSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync, type Stats } from "node:fs";
import { join } from "node:path";
import { PathBlockError, removePathBlocks } from "./path-block";

/** Códigos de error de la desinstalación. */
export type UninstallErrorCode = "UNINSTALL_UNSAFE" | "PATH_REMOVE_FAILED";

/**
 * Algo impide desinstalar con seguridad; el código dice qué. `UNINSTALL_UNSAFE` y los `PATH_REMOVE_FAILED`
 * de la comprobación (`planUninstall`) salen antes de cambiar nada. En cambio, un `PATH_REMOVE_FAILED` al reescribir
 * un perfil puede llegar con los perfiles anteriores de la lista ya limpios, y el `UNINSTALL_UNSAFE` de
 * `removeFolder` llega cuando todos los perfiles ya están limpios.
 */
export class UninstallError extends Error {
  /** Indica si se encontró una ruta insegura o si no se pudo retirar un bloque del perfil. */
  readonly code: UninstallErrorCode;

  /** Conserva el motivo y el código para que el comando muestre el error correcto.
   * @param code `UNINSTALL_UNSAFE` para rutas inseguras o `PATH_REMOVE_FAILED` para perfiles que no se pueden limpiar.
   * @param message Explicación de la ruta o del perfil que impide continuar.
   */
  constructor(code: UninstallErrorCode, message: string) {
    super(message);
    this.name = "UninstallError";
    this.code = code;
  }
}

/** Un archivo de perfil que el plan va a cambiar; guarda su contenido nuevo y permisos antes de escribirlo. */
interface PlannedPathChange {
  /** Ruta del perfil que contenía al menos un bloque de Atlas. */
  path: string;
  /** Texto nuevo del archivo; `null` significa borrar el archivo (solo el archivo propio de fish, otra terminal, cuando solo traía el bloque). */
  content: string | null;
  /** Permisos originales para que el archivo reescrito conserve el mismo acceso. */
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
  /** Borra la carpeta de Atlas si existía al armar el plan (si no existía, no hace nada). @throws UninstallError con código `UNINSTALL_UNSAFE` si, justo antes de borrar, la ruta ya no es una carpeta real (se volvió un enlace u otro tipo de archivo, o desapareció); también puede propagar errores del sistema de archivos al consultar o borrar la ruta (por ejemplo, de permisos). */
  removeFolder(): void;
}

/** Consulta la ruta sin seguir enlaces y da `null` solo si no existe.
 * @param path Ruta del archivo o carpeta que se comprueba.
 * @returns Sus datos de tipo y permisos, o `null` ante `ENOENT` (ruta inexistente).
 * @throws Error del sistema de archivos con su código, salvo `ENOENT`, si la consulta falla.
 */
function lstatOrNull(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Distingue una carpeta real de un enlace simbólico (acceso que apunta a otra ruta) u otro tipo de archivo.
 * @param path Ruta que se inspecciona sin seguir enlaces.
 * @returns `true` solo si la ruta existe y es una carpeta real.
 * @throws Error del sistema de archivos si la consulta falla por un motivo distinto de `ENOENT`.
 */
function isRealDirectory(path: string): boolean {
  const entry = lstatOrNull(path);
  return entry !== null && entry.isDirectory() && !entry.isSymbolicLink();
}

/**
 * Comprueba todo lo que la desinstalación va a tocar y arma el plan, sin cambiar nada. Solo se tocan la
 * carpeta `<forgeHome>/atlas` y el bloque de PATH de Atlas en `<home>/.zshrc`, `<home>/.bash_profile`,
 * `<home>/.bashrc` y `<home>/.config/fish/conf.d/forge614-atlas.fish` (este último se borra entero si solo traía el
 * bloque); nunca Engram, Engines, Shell, Workers ni las memorias.
 * @param forgeHome Carpeta Forge614 ya resuelta (ver `resolveForgeHome`).
 * @param home Carpeta personal del usuario, donde viven los archivos de perfil de shell.
 * @returns El plan, con las operaciones para aplicarlo en el orden correcto.
 * @throws UninstallError con código `UNINSTALL_UNSAFE` si `<forgeHome>` o `<forgeHome>/atlas` existen
 * pero no son carpetas reales (por ejemplo un enlace simbólico); con código `PATH_REMOVE_FAILED` si un
 * archivo de perfil es un enlace, no es un archivo normal, no se puede leer o tiene marcas desparejas. También
 * propaga errores del sistema de archivos al consultar rutas por causas distintas de `ENOENT`.
 */
export function planUninstall(forgeHome: string, home: string): UninstallPlan {
  const atlas = join(forgeHome, "atlas");

  // Primero se valida la carpeta base y luego la de Atlas, antes de preparar cualquier cambio de perfil.
  const forgeEntry = lstatOrNull(forgeHome);
  if (forgeEntry !== null && !isRealDirectory(forgeHome)) {
    throw new UninstallError("UNINSTALL_UNSAFE", "The Forge614 folder is not a real folder; nothing was removed.");
  }
  const atlasEntry = lstatOrNull(atlas);
  if (atlasEntry !== null && !isRealDirectory(atlas)) {
    throw new UninstallError("UNINSTALL_UNSAFE", "The Forge614 Atlas folder is not a real folder; nothing was removed.");
  }

  // El orden fija la secuencia de escritura; el archivo propio de fish se borra si, sin el bloque de Atlas, solo queda espacio en blanco; los otros tres se reescriben aunque queden vacíos.
  const candidates: readonly { path: string; deleteWhenEmpty: boolean }[] = [
    { path: join(home, ".zshrc"), deleteWhenEmpty: false },
    { path: join(home, ".bash_profile"), deleteWhenEmpty: false },
    { path: join(home, ".bashrc"), deleteWhenEmpty: false },
    { path: join(home, ".config", "fish", "conf.d", "forge614-atlas.fish"), deleteWhenEmpty: true },
  ];

  const changes: PlannedPathChange[] = [];
  for (const candidate of candidates) {
    // Cada fallo señala el perfil concreto; la planificación termina antes de tocar alguno.
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
    // Solo se planifican perfiles donde apareció el bloque; los demás se dejan intactos.
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
      // Se aplican los perfiles en el orden planificado. Un fallo puede dejar los anteriores ya limpios.
      for (const change of changes) {
        try {
          if (change.content === null) {
            unlinkSync(change.path);
          } else {
            // Se escribe junto al perfil y se reemplaza al final para evitar dejarlo a medias.
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
      // La carpeta se borra solo después de los perfiles, cuando lo ordena el comando.
      if (atlasEntry === null) return;
      // Se vuelve a comprobar justo antes de borrar: entre el plan y el borrado la ruta no debe haberse vuelto un enlace.
      if (!isRealDirectory(atlas)) {
        throw new UninstallError("UNINSTALL_UNSAFE", "The Forge614 Atlas folder is not a real folder; it was not removed.");
      }
      rmSync(atlas, { recursive: true, force: false, maxRetries: 0 });
    },
  };
}
