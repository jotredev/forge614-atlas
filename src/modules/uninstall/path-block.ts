/**
 * Reconoce y retira del perfil de shell (archivo que prepara la terminal) las líneas que el instalador añade al PATH
 * (lista de carpetas donde la terminal busca programas), con la misma regla que `scripts/install.sh` al reescribir
 * ese bloque. `uninstall.ts` usa `removePathBlocks` para conservar el resto del perfil.
 */
/** Marca de inicio del bloque de PATH que escribe `scripts/install.sh`. */
export const PATH_BLOCK_START = "# >>> forge614-atlas PATH >>>";
/** Marca de fin del bloque de PATH que escribe `scripts/install.sh`. */
export const PATH_BLOCK_END = "# <<< forge614-atlas PATH <<<";

/** El archivo tiene marcas desparejas, así que no se puede reescribir con seguridad. */
export class PathBlockError extends Error {
  /** Crea el error que `uninstall.ts` convierte en `UninstallError` con código `PATH_REMOVE_FAILED`.
   * @param message Motivo concreto por el que las marcas no permiten retirar el bloque.
   */
  constructor(message: string) {
    super(message);
    this.name = "PathBlockError";
  }
}

/** Resultado de quitar los bloques de PATH de un texto; permite decidir si el perfil necesita escritura. */
export interface PathBlockRemoval {
  /** Si el texto traía al menos un bloque. */
  found: boolean;
  /** El texto sin los bloques (las líneas de marca y todo lo de entre ellas); igual al original si no había. */
  content: string;
}

/**
 * Quita del texto de un perfil el bloque que puso el instalador de Atlas y deja intacto lo demás. Reconoce una marca
 * solo cuando la línea es idéntica a ella (sin espacios ni `\r` de más); un inicio abre el bloque y un fin lo cierra. Rechaza un inicio anidado,
 * un fin sin inicio y un bloque abierto al final para que el desinstalador no reescriba un perfil ambiguo.
 * @param content Texto completo del archivo.
 * @returns El texto sin los bloques y si había alguno.
 * @throws PathBlockError si hay una marca de inicio dentro de un bloque, una de fin fuera de uno, o un bloque sin cerrar; `uninstall.ts` lo traduce a `PATH_REMOVE_FAILED`.
 */
export function removePathBlocks(content: string): PathBlockRemoval {
  const lines = content.split("\n");
  const kept: string[] = [];
  let inside = false;
  let found = false;
  // Se compara la línea completa: una marca dentro de otra orden no delimita un bloque del instalador.
  for (const line of lines) {
    if (line === PATH_BLOCK_START) {
      if (inside) throw new PathBlockError("The Forge614 Atlas PATH block is nested or duplicated.");
      inside = true;
      found = true;
    } else if (line === PATH_BLOCK_END) {
      if (!inside) throw new PathBlockError("The Forge614 Atlas PATH block has an end mark without a start.");
      inside = false;
    } else if (!inside) {
      // Mientras el bloque está abierto se descarta su contenido; fuera de él se conserva cada línea.
      kept.push(line);
    }
  }
  if (inside) throw new PathBlockError("The Forge614 Atlas PATH block was never closed.");
  // Sin marcas se devuelve el texto recibido tal cual; `found` en `false` avisa que no hay nada que reescribir.
  return { found, content: found ? kept.join("\n") : content };
}
