#!/usr/bin/env bun
/**
 * Punto de entrada de la línea de comandos de Atlas: despacha `init`, `update`, `uninstall`, `--help` y `--version`.
 * La ayuda y la versión salen como texto; las demás respuestas, incluidos el comando desconocido y un error imprevisto,
 * salen en JSON (texto con campos).
 */
import { version } from "../../../package.json";
import { runInit, runUninstall, runUpdate } from "./commands";
import { helpText } from "./help";

/**
 * Lee el valor que sigue a una opción, por ejemplo `--engine claude-code`.
 * @param args Argumentos del comando.
 * @param name Nombre de la opción.
 * @returns El argumento que sigue a la opción, o `undefined` si la opción no está o es el último argumento (no comprueba que el valor no sea otra opción).
 */
function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

/**
 * Despacha el comando: `--help`/`-h` (en cualquier posición), `--version`/`-v` (primer argumento),
 * `update` y `uninstall` se atienden sin abrir Engram; solo `init` lo abre. Cualquier otro comando
 * responde `UNKNOWN_COMMAND` con salida 1.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [command, ...rest] = args;

  // --help y -h se atienden en CUALQUIER posición y antes que todo lo demás: `init --help` es una
  // petición de ayuda, no una orden de analizar el proyecto, y `uninstall --help` no debe borrar nada.
  if (args.includes("--help") || args.includes("-h")) {
    console.log(helpText(version));
    return;
  }

  // --version, update y uninstall se atienden ANTES de abrir Engram.
  if (command === "--version" || command === "-v") {
    console.log(`forge614-atlas ${version}`);
    return;
  }

  if (command === "update") {
    await runUpdate(rest, version);
    return;
  }

  if (command === "uninstall") {
    await runUninstall(rest);
    return;
  }

  // `init` es el único comando que abre Engram; `--engine <id>` elige el motor y `--force` rehace un análisis ya completo.
  if (command === "init") {
    const engine = flag(rest, "--engine");
    const force = rest.includes("--force");
    await runInit(process.cwd(), engine, force);
    return;
  }

  // Si el comando no existe se responde con error estructurado y código de salida 1.
  console.log(
    JSON.stringify(
      { schemaVersion: 1, status: "error", error: { code: "UNKNOWN_COMMAND", argv: process.argv.slice(2) } },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}

main().catch(error => {
  // Un error imprevisto de main() se responde con `UNEXPECTED_ERROR` en JSON y salida 1; sin este .catch Node
  // imprimiría su propio texto (no JSON) en stderr.
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        status: "error",
        error: { code: "UNEXPECTED_ERROR", message: error instanceof Error ? error.message : String(error) },
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
