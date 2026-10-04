import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import type { Capabilities } from "../engines-client/capabilities";

/** Tope por defecto, en milisegundos, para que `forge614-workers --version` responda. */
export const DEFAULT_WORKERS_VERSION_TIMEOUT_MS = 10_000;

/** Prefijo con el que Workers marca en `stderr` una tarea que no corrió por falta de candado de solo lectura. */
export const READ_ONLY_UNSUPPORTED_PREFIX = "READ_ONLY_UNSUPPORTED";

/** Códigos de error que puede dar la comprobación de requisitos. */
export type RequirementsErrorCode = "READ_ONLY_UNSUPPORTED" | "WORKERS_UNREACHABLE" | "WORKERS_OUTDATED";

/** Un requisito que no se cumple, listo para convertirse en el sobre de error de `init`. */
export interface RequirementsFailure {
  code: RequirementsErrorCode;
  message: string;
}

// Misma expresión que usa Workers para validar su propia versión (workers/src/updater.ts).
const WORKERS_VERSION_PATTERN = /^forge614-workers\s+([0-9]+)\.([0-9]+)\.([0-9]+)(?:[.-][0-9A-Za-z][0-9A-Za-z.-]*)?$/;

/**
 * Da el mensaje de error cuando Engines no garantiza ayudantes de solo lectura.
 * @param engineId Identificador del agente elegido.
 */
export function readOnlyUnsupportedMessage(engineId: string): string {
  return `Forge614 Engines does not guarantee read-only helpers for "${engineId}" (Engines 1.17.0 or newer is required). Update it with: forge614-engines update`;
}

/**
 * Da el mensaje de error cuando Workers es más viejo que 1.0.0 o no responde bien a `--version`.
 * @param found Versión leída, o `undefined` si no se pudo leer.
 */
export function workersOutdatedMessage(found: string | undefined): string {
  return `Forge614 Workers 1.0.0 or newer is required (found: ${found ?? "unknown"}). Install it with: curl -fsSL https://github.com/jotredev/forge614-workers/releases/latest/download/install.sh | bash`;
}

/**
 * Corre `<workers> --version` (sin stdin y con tope de tiempo) y lee la versión.
 * @param workersBinaryPath Ruta del binario de Workers.
 * @param timeoutMs Tiempo máximo de espera.
 * @returns Los tres números de la versión y su texto, o `undefined` si la respuesta no es exactamente
 * `forge614-workers X.Y.Z`, si el código de salida no es 0 o si venció el tope.
 */
function readWorkersVersion(workersBinaryPath: string, timeoutMs: number): { major: number; text: string } | undefined {
  const result = spawnSync(workersBinaryPath, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: timeoutMs,
  });
  if (result.error || result.status !== 0) return undefined;
  const match = WORKERS_VERSION_PATTERN.exec(result.stdout.trim());
  if (!match) return undefined;
  return { major: Number(match[1]), text: `${match[1]}.${match[2]}.${match[3]}` };
}

/**
 * Comprueba, ANTES de tocar Engram, que Atlas puede mandar ayudantes de solo lectura: que Engines
 * garantice el candado, que el binario de Workers exista y que Workers sea 1.0.0 o posterior (un
 * Workers anterior ignoraría `readOnly` sin avisar y el ayudante correría sin candado).
 * @param input.engineId Agente elegido.
 * @param input.capabilities Capacidades que Engines declaró para ese agente.
 * @param input.workersBinaryPath Ruta del binario de Workers.
 * @param input.workersVersionTimeoutMs Tope para `--version`; por defecto 10 s.
 * @returns El primer requisito que falla, o `undefined` si todo se cumple.
 */
export function checkDispatchRequirements(input: {
  engineId: string;
  capabilities: Capabilities;
  workersBinaryPath: string;
  workersVersionTimeoutMs?: number;
}): RequirementsFailure | undefined {
  if (input.capabilities.supportsReadOnly !== true) {
    return { code: "READ_ONLY_UNSUPPORTED", message: readOnlyUnsupportedMessage(input.engineId) };
  }

  try {
    accessSync(input.workersBinaryPath, constants.X_OK);
  } catch (error) {
    return { code: "WORKERS_UNREACHABLE", message: error instanceof Error ? error.message : String(error) };
  }

  const version = readWorkersVersion(input.workersBinaryPath, input.workersVersionTimeoutMs ?? DEFAULT_WORKERS_VERSION_TIMEOUT_MS);
  if (!version || version.major < 1) {
    return { code: "WORKERS_OUTDATED", message: workersOutdatedMessage(version?.text) };
  }
  return undefined;
}
