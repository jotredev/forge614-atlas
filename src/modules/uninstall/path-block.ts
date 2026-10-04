/** Marca de inicio del bloque de PATH que escribe `scripts/install.sh`. */
export const PATH_BLOCK_START = "# >>> forge614-atlas PATH >>>";
/** Marca de fin del bloque de PATH que escribe `scripts/install.sh`. */
export const PATH_BLOCK_END = "# <<< forge614-atlas PATH <<<";

/** El archivo tiene marcas desparejas, así que no se puede reescribir con seguridad. */
export class PathBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathBlockError";
  }
}

/** Resultado de quitar los bloques de PATH de un texto. */
export interface PathBlockRemoval {
  /** Si el texto traía al menos un bloque. */
  found: boolean;
  /** El texto sin los bloques (las líneas de marca y todo lo de entre ellas); igual al original si no había. */
  content: string;
}

/**
 * Quita del texto de un archivo de perfil de shell el bloque que puso el instalador de Atlas, y deja
 * intacto todo lo demás. Usa la misma regla que el instalador al reescribir el bloque: una línea de inicio
 * abre un bloque, una de fin lo cierra, y cualquier marca fuera de lugar invalida el archivo.
 * @param content Texto completo del archivo.
 * @returns El texto sin los bloques y si había alguno.
 * @throws PathBlockError si hay una marca de inicio dentro de un bloque, una de fin fuera de uno, o un bloque sin cerrar.
 */
export function removePathBlocks(content: string): PathBlockRemoval {
  const lines = content.split("\n");
  const kept: string[] = [];
  let inside = false;
  let found = false;
  for (const line of lines) {
    if (line === PATH_BLOCK_START) {
      if (inside) throw new PathBlockError("The Forge614 Atlas PATH block is nested or duplicated.");
      inside = true;
      found = true;
    } else if (line === PATH_BLOCK_END) {
      if (!inside) throw new PathBlockError("The Forge614 Atlas PATH block has an end mark without a start.");
      inside = false;
    } else if (!inside) {
      kept.push(line);
    }
  }
  if (inside) throw new PathBlockError("The Forge614 Atlas PATH block was never closed.");
  return { found, content: found ? kept.join("\n") : content };
}
