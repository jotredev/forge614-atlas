import { isAbsolute, join, resolve } from "node:path";

/** Error de configuración: `FORGE614_HOME` está definida pero no sirve como carpeta. */
export class ForgeHomeError extends Error {
  /** Código estable que Atlas devuelve en el sobre de error de `init`. */
  readonly code = "INVALID_FORGE614_HOME";

  constructor(message: string) {
    super(message);
    this.name = "ForgeHomeError";
  }
}

/**
 * Da la carpeta Forge614 compartida por todos los productos del ecosistema, con la misma regla
 * estricta que usa la librería de Engram que Atlas lleva dentro (paths.ts de Engram): una variable
 * presente pero vacía NO se ignora, es un error.
 * @param env Variables de entorno (normalmente `process.env`).
 * @param home Carpeta personal del usuario, usada solo cuando la variable no existe.
 * @returns `FORGE614_HOME` resuelto a ruta absoluta si está definida; si no, `<home>/.forge614`.
 * @throws ForgeHomeError con código `INVALID_FORGE614_HOME` si la variable está definida pero vacía,
 * contiene un carácter nulo o no es una ruta absoluta.
 */
export function resolveForgeHome(env: Record<string, string | undefined>, home: string): string {
  if (!Object.hasOwn(env, "FORGE614_HOME")) return join(home, ".forge614");
  const configured = env.FORGE614_HOME;
  if (!configured || configured.includes("\0") || !isAbsolute(configured)) {
    throw new ForgeHomeError("FORGE614_HOME must be a non-empty absolute path.");
  }
  return resolve(configured);
}
