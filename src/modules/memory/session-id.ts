/**
 * Deriva identificadores de sesión a partir de la carpeta Git común o de la ruta real de un proyecto sin Git.
 * `run-state.ts` usa el identificador estable; `init.ts` usa una variante nueva para la corrida forzada.
 */
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * Resuelve la identidad real del repositorio (no la ruta tal cual se pasó),
 * usando el mismo comando que Engram usa internamente para identidad de
 * proyecto (`--git-common-dir`). Esto garantiza que invocar Atlas desde la
 * raíz del repo o desde una subcarpeta — o incluso desde un git worktree
 * distinto del mismo repo — produzca el mismo sessionId. Sin esto, la
 * detección de "este repo ya se analizó" (`startOrResumeSession`) se rompe
 * silenciosamente: dos rutas del mismo proyecto generarían dos sesiones
 * distintas en Engram.
 *
 * Si el comando de git falla (directorio que no es un repo git), se cae de
 * vuelta a `realpathSync(directory)` directo — el mismo fallback que usa
 * Engram para proyectos que no son repos git.
 * @param directory Carpeta del proyecto o una de sus subcarpetas.
 * @returns Ruta real del directorio Git común, o ruta real de `directory` si Git no la reconoce.
 * @throws Error del sistema de archivos (por ejemplo `ENOENT`) si `realpathSync` no puede resolver la ruta elegida.
 */
function repositoryIdentity(directory: string): string {
  const result = spawnSync(
    "git",
    ["-C", directory, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    { encoding: "utf8" },
  );
  // Solo se usa la carpeta Git común cuando el comando termina bien y entrega una ruta no vacía.
  if (result.status === 0) {
    const commonDir = result.stdout.trim();
    if (commonDir) return realpathSync(commonDir);
  }
  return realpathSync(directory);
}

/**
 * sessionId es un identificador GLOBAL en la base de Engram (no tiene
 * espacio de nombres por proyecto), nunca un literal fijo compartido entre
 * proyectos. Debe derivarse de la identidad real del repositorio — no de la
 * ruta literal que se pasó — para que dos proyectos nunca choquen entre sí,
 * y para que la misma repo, vista desde cualquier subcarpeta o worktree,
 * produzca siempre el mismo id.
 * @param directory Carpeta del repositorio; puede ser su raíz, subcarpeta o un árbol de trabajo (worktree: copia ligada al mismo repositorio).
 * @returns Identificador `atlas:` seguido de los primeros 16 caracteres del hash (resumen estable) SHA-256 de la identidad real.
 * @throws Error del sistema de archivos (por ejemplo `ENOENT`) si la ruta de identidad no puede resolverse.
 */
export function deriveSessionId(directory: string): string {
  const canonical = repositoryIdentity(directory);
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  return `atlas:${hash}`;
}

/**
 * Para una re-corrida forzada (--force) sobre un repo cuya sesión
 * anterior ya está cerrada: una sesión cerrada no puede reabrirse con el
 * mismo id, así que se genera uno nuevo y distinto.
 * @param directory Carpeta del repositorio cuya corrida se fuerza.
 * @returns Identificador estable del repositorio seguido de la fecha actual en milisegundos.
 * @throws Error del sistema de archivos (por ejemplo `ENOENT`) si la ruta de identidad no puede resolverse.
 */
export function deriveForcedSessionId(directory: string): string {
  return `${deriveSessionId(directory)}:${Date.now()}`;
}
