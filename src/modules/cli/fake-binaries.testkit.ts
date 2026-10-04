/**
 * Kit de pruebas (conjunto de ayudas compartidas, no es una prueba): crea carpetas temporales y escribe
 * programas FALSOS de Engines y de Workers (scripts de shell) para no ejecutar los reales.
 * Lo importan `dispatch-modules-readonly.test.ts`, `dispatch-modules-secrets.test.ts`, `init-requirements.test.ts`
 * y `engines-client/capabilities.test.ts`. Piezas: `makeFakeDir`, `writeFakeEngines`, `writeFakeWorkers`,
 * `runCompletedEvent` y los tipos de opciones `FakeEnginesOptions` y `FakeWorkersOptions`.
 */
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Crea una carpeta temporal del sistema para los dobles de una prueba (programas falsos que sustituyen a los reales).
 * @param prefix Texto con que empieza el nombre de la carpeta (el sistema le agrega caracteres al azar).
 * @returns Ruta absoluta de la carpeta nueva; no se borra sola, quien la pide debe limpiarla.
 */
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
  /** Valor de `supportsReasoningLevel` en la respuesta; si no se da, responde `true`. */
  supportsReasoningLevel?: boolean;
}

/**
 * Escribe un Engines FALSO que detecta un único agente instalado, `claude-code`, y responde
 * `capabilities` con lo pedido. No ejecuta ningún motor real.
 * Deja en `dir` los archivos `detect.json` y `capabilities.json` y el script `fake-engines.sh`; el script
 * imprime el primero con `detect`, el segundo con `capabilities` y termina con código 2 ante cualquier otro argumento.
 * @param dir Carpeta existente donde se escriben los archivos.
 * @param options Respuesta que debe dar a `capabilities`.
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
  // Con "absent" el campo no se escribe, para imitar a un Engines viejo que no lo conocía.
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
  /** Código de salida de `--version` (0 si no se da); se ignora cuando `hangOnVersion` es `true`. */
  versionExitCode?: number;
  /** Si es `true`, `--version` no responde y el script espera 30 segundos (`exec sleep 30`) antes de terminar; sirve para probar el tope de tiempo con que se espera la versión. */
  hangOnVersion?: boolean;
  /** Eventos, uno por línea en formato JSON (NDJSON), que imprime al recibir un lote. */
  events: object[];
}

/**
 * Escribe un Workers FALSO: responde `--version` según `options` y, ante un lote, guarda lo que recibe por su entrada estándar (stdin) en
 * `<dir>/stdin.json` y emite los eventos pedidos.
 * Deja además `version.txt` y `events.ndjson` en `dir`; el script los imprime con `cat`. Con `hangOnVersion`
 * la rama de `--version` es `exec sleep 30` (espera 30 segundos), no un bloqueo infinito.
 * @param dir Carpeta existente donde se escriben los archivos.
 * @param options Versión que imprime, su código de salida, si se cuelga y los eventos que emite.
 * @returns La ruta del script y la del archivo donde guarda su stdin.
 */
export function writeFakeWorkers(dir: string, options: FakeWorkersOptions): { path: string; stdinFile: string } {
  const stdinFile = join(dir, "stdin.json");
  writeFileSync(join(dir, "version.txt"), options.versionOutput === null ? "" : `${options.versionOutput}\n`);
  writeFileSync(join(dir, "events.ndjson"), options.events.map(event => JSON.stringify(event)).join("\n") + "\n");
  // Rama del script para `--version`: colgarse, o imprimir la versión y salir con el código pedido (0 por omisión).
  const versionBranch = options.hangOnVersion
    ? "exec sleep 30"
    : `cat "${join(dir, "version.txt")}"\n  exit ${options.versionExitCode ?? 0}`;
  const path = writeExecutable(
    join(dir, "fake-workers.sh"),
    `if [ "$1" = "--version" ]; then\n  ${versionBranch}\nfi\ncat > "${stdinFile}"\ncat "${join(dir, "events.ndjson")}"`,
  );
  return { path, stdinFile };
}

/**
 * Evento `run_completed` válido de Workers para un lote de `totalTasks` tareas sin fallas.
 * @param totalTasks Número de tareas del lote; se usa como total y como completadas, con 0 fallidas y 0 sin iniciar.
 * @returns El objeto del evento, listo para ponerlo en la lista `events` de `writeFakeWorkers`.
 */
export function runCompletedEvent(totalTasks: number): object {
  return { event: "run_completed", totalTasks, completed: totalTasks, failed: 0, notStarted: 0, pausedByQuota: false, totalDurationMs: 5 };
}
