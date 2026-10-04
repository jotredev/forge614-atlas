import { win32, posix } from "node:path";

/**
 * Da la ruta estable del lanzador de Forge614 Engines.
 * @param platform Plataforma del proceso; decide el sufijo `.exe` y el separador de rutas.
 * @param forgeHome Carpeta Forge614 ya resuelta (ver `resolveForgeHome`), no la carpeta personal.
 * @returns `<forgeHome>/engines/bin/forge614-engines` (con `.exe` en Windows).
 */
export function resolveEnginesBinaryPath(platform: NodeJS.Platform, forgeHome: string): string {
  const name = platform === "win32" ? "forge614-engines.exe" : "forge614-engines";
  const join = platform === "win32" ? win32.join : posix.join;
  return join(forgeHome, "engines", "bin", name);
}
