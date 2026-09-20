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
 */
function repositoryIdentity(directory: string): string {
  const result = spawnSync(
    "git",
    ["-C", directory, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    { encoding: "utf8" },
  );
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
 */
export function deriveForcedSessionId(directory: string): string {
  return `${deriveSessionId(directory)}:${Date.now()}`;
}
