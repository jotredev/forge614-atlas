/**
 * Forma la ruta del lanzador de Workers según la plataforma y la carpeta Forge614.
 * `commands.ts` la usa para la corrida y `src/index.ts` la ofrece a los consumidores de Atlas.
 */
import { win32, posix } from "node:path";

/**
 * Da la ruta estable del lanzador de Forge614 Workers.
 * @param platform Plataforma del proceso; decide el sufijo `.exe` y el separador de rutas.
 * @param forgeHome Carpeta Forge614 ya resuelta (ver `resolveForgeHome`), no la carpeta personal.
 * @returns `<forgeHome>/workers/bin/forge614-workers` (con `.exe` en Windows).
 */
export function resolveWorkersBinaryPath(platform: NodeJS.Platform, forgeHome: string): string {
  // Windows necesita el sufijo de ejecutable además de sus propios separadores de ruta.
  const name = platform === "win32" ? "forge614-workers.exe" : "forge614-workers";
  const join = platform === "win32" ? win32.join : posix.join;
  return join(forgeHome, "workers", "bin", name);
}
