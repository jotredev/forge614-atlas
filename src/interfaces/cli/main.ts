#!/usr/bin/env bun
import { runInit } from "./commands";

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "init") {
    const engine = flag(rest, "--engine");
    const force = rest.includes("--force");
    await runInit(process.cwd(), engine, force);
    return;
  }

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
  // main() ahora es async (Task 8: runInitCommand pasó a async por el streaming
  // de eventos de Workers) — sin este .catch(), un error inesperado se volvería un
  // unhandled promise rejection en vez de una salida estructurada, y Node podría
  // imprimir su propio texto (no JSON) a stderr antes de salir con código 1.
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
