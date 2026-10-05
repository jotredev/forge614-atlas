/**
 * Texto de ayuda de la línea de comandos de Atlas: comandos, opciones y la variable `FORGE614_HOME`. Lo imprime
 * `main.ts` con `--help` o `-h`.
 */
/**
 * Arma el texto de la ayuda corta del CLI.
 * @param version Versión de Atlas, tomada de `package.json`.
 * @returns La ayuda lista para imprimir.
 */
export function helpText(version: string): string {
  return [
    `forge614-atlas ${version}`,
    "Deep project contextualization: scores the modules, sends read-only helpers and saves one report per module in Engram.",
    "",
    "Usage:",
    "  forge614-atlas init [--engine <id>] [--force]   Contextualize the project in the current folder",
    "  forge614-atlas update                           Update to the latest release",
    "  forge614-atlas uninstall [--from forge614-engram] [--confirmed]",
    "                                                  Remove Atlas; never touches Engram, Engines, Shell or Workers",
    "  forge614-atlas --version, -v                    Print the product name and version",
    "  forge614-atlas --help, -h                       Print this help (also answered in any position, e.g. init --help)",
    "",
    "Environment:",
    "  FORGE614_HOME   Absolute path that replaces ~/.forge614 as the Forge614 folder",
  ].join("\n");
}
