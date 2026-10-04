/**
 * Arma la ruta fija donde vive el lanzador de Forge614 Engines (el programa que Atlas ejecuta para preguntarle qué agentes hay
 * y qué sabe hacer cada uno).
 * Existe para que Atlas encuentre ese programa siempre en el mismo lugar, con el sufijo `.exe` y las barras de Windows cuando toca.
 * Lo llama `src/interfaces/cli/commands.ts` y `src/index.ts` lo reexporta; varias pruebas (`detect`, `capabilities`, `init`, `run-batch` y `dispatch-modules`)
 * también lo usan para llegar al Engines real.
 * Pieza: `resolveEnginesBinaryPath`.
 */
import { win32, posix } from "node:path";

/**
 * Da la ruta estable del lanzador de Forge614 Engines.
 * @param platform Plataforma del proceso; decide el sufijo `.exe` y el separador de rutas.
 * @param forgeHome Carpeta Forge614 ya resuelta (ver `resolveForgeHome`), no la carpeta personal.
 * @returns `<forgeHome>/engines/bin/forge614-engines` (con `.exe` en Windows).
 */
export function resolveEnginesBinaryPath(platform: NodeJS.Platform, forgeHome: string): string {
  // Solo en Windows el programa lleva el sufijo `.exe`.
  const name = platform === "win32" ? "forge614-engines.exe" : "forge614-engines";
  // El separador se elige por la plataforma que se pide, no por la del sistema que corre el código
  // (`win32.join` usa `\` y `posix.join` usa `/`); así una misma máquina puede armar la ruta de las dos.
  const join = platform === "win32" ? win32.join : posix.join;
  return join(forgeHome, "engines", "bin", name);
}
