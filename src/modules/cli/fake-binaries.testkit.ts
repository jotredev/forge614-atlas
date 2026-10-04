import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Crea una carpeta temporal del sistema para los dobles de una prueba. */
export function makeFakeDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Escribe un script de shell ejecutable con el cuerpo dado.
 * @param path Ruta del archivo a crear.
 * @param body Líneas que van después de `#!/bin/sh`.
 * @returns La misma ruta, ya con permiso de ejecución.
 */
function writeExecutable(path: string, body: string): string {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

/** Cómo debe responder el Forge614 Engines FALSO a `capabilities`. */
export interface FakeEnginesOptions {
  /** Valor de `supportsReadOnly`; `"absent"` omite el campo, como haría un Engines anterior a 1.17.0. */
  supportsReadOnly: boolean | "absent";
  supportsReasoningLevel?: boolean;
}

/**
 * Escribe un Engines FALSO que detecta un único agente instalado, `claude-code`, y responde
 * `capabilities` con lo pedido. No ejecuta ningún motor real.
 * @returns La ruta del script ejecutable.
 */
export function writeFakeEngines(dir: string, options: FakeEnginesOptions): string {
  const detect = {
    agents: [{ id: "claude-code", label: "Claude Code", installed: true, executable: "/bin/claude", configDir: "/tmp/.claude", configFound: true }],
  };
  const capabilities: Record<string, unknown> = {
    id: "claude-code",
    label: "Claude Code",
    supportsMcp: true,
    supportsHooks: true,
    supportsHeadlessExec: true,
    supportsReasoningLevel: options.supportsReasoningLevel ?? true,
  };
  if (options.supportsReadOnly !== "absent") capabilities.supportsReadOnly = options.supportsReadOnly;
  writeFileSync(join(dir, "detect.json"), JSON.stringify(detect));
  writeFileSync(join(dir, "capabilities.json"), JSON.stringify(capabilities));
  return writeExecutable(
    join(dir, "fake-engines.sh"),
    `case "$1" in\n  detect) cat "${join(dir, "detect.json")}" ;;\n  capabilities) cat "${join(dir, "capabilities.json")}" ;;\n  *) exit 2 ;;\nesac`,
  );
}

/** Cómo debe comportarse el Forge614 Workers FALSO. */
export interface FakeWorkersOptions {
  /** Lo que imprime `--version`; `null` no imprime nada. */
  versionOutput: string | null;
  /** Código de salida de `--version`. */
  versionExitCode?: number;
  /** Si es `true`, `--version` nunca termina (para probar el tope de tiempo). */
  hangOnVersion?: boolean;
  /** Líneas NDJSON que imprime al recibir un lote. */
  events: object[];
}

/**
 * Escribe un Workers FALSO: responde `--version` según `options` y, ante un lote, guarda su stdin
 * en `<dir>/stdin.json` y emite los eventos pedidos.
 * @returns La ruta del script y la del archivo donde guarda su stdin.
 */
export function writeFakeWorkers(dir: string, options: FakeWorkersOptions): { path: string; stdinFile: string } {
  const stdinFile = join(dir, "stdin.json");
  writeFileSync(join(dir, "version.txt"), options.versionOutput === null ? "" : `${options.versionOutput}\n`);
  writeFileSync(join(dir, "events.ndjson"), options.events.map(event => JSON.stringify(event)).join("\n") + "\n");
  const versionBranch = options.hangOnVersion
    ? "exec sleep 30"
    : `cat "${join(dir, "version.txt")}"\n  exit ${options.versionExitCode ?? 0}`;
  const path = writeExecutable(
    join(dir, "fake-workers.sh"),
    `if [ "$1" = "--version" ]; then\n  ${versionBranch}\nfi\ncat > "${stdinFile}"\ncat "${join(dir, "events.ndjson")}"`,
  );
  return { path, stdinFile };
}

/** Evento `run_completed` válido de Workers para un lote de `totalTasks` tareas sin fallas. */
export function runCompletedEvent(totalTasks: number): object {
  return { event: "run_completed", totalTasks, completed: totalTasks, failed: 0, notStarted: 0, pausedByQuota: false, totalDurationMs: 5 };
}
