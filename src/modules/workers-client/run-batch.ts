/**
 * Envía tareas de Atlas al programa Workers y entrega sus eventos según llegan por líneas de salida.
 * `dispatch-modules.ts` usa esta conexión para seguir cada módulo y reconocer una pausa por cuota.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/** Niveles de razonamiento que Workers acepta; Engines valida cuáles admite el agente elegido. */
export type WorkersReasoningLevel = "low" | "medium" | "high" | "xhigh" | "max";

/** Datos de un módulo que Atlas entrega a Workers para ejecutar un trabajador. */
export interface WorkersTask {
  /** Identificador de la tarea; Atlas usa el nombre del módulo para reconocer sus eventos. */
  id: string;
  /** Identificador del agente seleccionado para esta tarea. */
  agentId: string;
  /** Ruta del programa que inicia ese agente. */
  executable: string;
  /** Instrucción de análisis que recibe el agente. */
  prompt: string;
  /** Carpeta del proyecto que el agente puede leer. */
  readableDir?: string;
  /**
   * Si es `true`, Workers pide a Engines el candado de solo lectura y se niega a correr la tarea
   * (`READ_ONLY_UNSUPPORTED`) si Engines no lo garantiza. Atlas lo manda siempre en `true`.
   */
  readOnly?: boolean;
  /** Modelo elegido para el nivel del módulo, cuando se especifica. */
  model?: string;
  /** Nivel de razonamiento enviado solo cuando la configuración lo incluye. */
  reasoningLevel?: WorkersReasoningLevel;
  /** Límite de tiempo de la tarea en milisegundos, si se establece. */
  timeoutMs?: number;
}

/**
 * Un evento que Workers imprime como una línea de NDJSON (un objeto JSON por línea) mientras corre el lote. `task_failed`
 * con `reason: "engine_unsupported"` y `stderr` que empieza con `READ_ONLY_UNSUPPORTED` es la negativa a
 * correr una tarea sin candado de solo lectura. `fatal_error` puede aparecer antes de iniciar tareas por entrada inválida
 * o Engines ausente, o después de eventos de tarea si falla inesperadamente el control del lote.
 */
export type WorkersEvent =
  | { event: "task_started"; taskId: string; agentId: string; startedAt: string }
  | {
      event: "task_completed";
      taskId: string;
      exitCode: number;
      durationMs: number;
      stdout: string;
      stdoutBytes: number;
      stdoutTruncated: boolean;
      stderr: string;
      stderrBytes: number;
      stderrTruncated: boolean;
    }
  | {
      event: "task_failed";
      taskId: string;
      reason: "timeout" | "engine_unsupported" | "spawn_error" | "generic_error";
      exitCode: number | null;
      stdout: string;
      stdoutBytes: number;
      stdoutTruncated: boolean;
      stderr: string;
      stderrBytes: number;
      stderrTruncated: boolean;
    }
  | {
      event: "quota_exhausted";
      taskId: string;
      agentId: string;
      matchedPattern: string;
      stdout: string;
      stdoutBytes: number;
      stdoutTruncated: boolean;
      stderr: string;
      stderrBytes: number;
      stderrTruncated: boolean;
    }
  | {
      event: "run_completed";
      totalTasks: number;
      completed: number;
      failed: number;
      notStarted: number;
      pausedByQuota: boolean;
      totalDurationMs: number;
    }
  | { event: "fatal_error"; reason: "invalid_input" | "engines_bin_not_found" | "unexpected_error"; message: string };

/**
 * Lanza Forge614 Workers, le escribe el lote por la entrada estándar y entrega cada evento NDJSON de su
 * salida a `onEvent`. Si una línea no es JSON válido o `onEvent` lanza un error, mata a Workers y rechaza.
 * @param workersBinaryPath Ruta del binario de Workers.
 * @param enginesBin Ruta del binario de Engines, que Workers usa para armar cada comando.
 * @param tasks Las tareas del lote.
 * @param onEvent Función que recibe cada evento, en orden.
 * @returns El código de salida de Workers (0 completo, 75 pausado por cuota, 2 entrada inválida o Engines ausente, 1 fallo inesperado).
 * @throws Rechaza la promesa si no se puede lanzar Workers, una línea no es JSON válido o `onEvent` lanza.
 */
export function runWorkersBatch(
  workersBinaryPath: string,
  enginesBin: string,
  tasks: WorkersTask[],
  onEvent: (event: WorkersEvent) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(workersBinaryPath, [], { stdio: ["pipe", "pipe", "ignore"] });
    const rl = createInterface({ input: child.stdout });

    // Al fallar el arranque, el análisis de una línea o el receptor, se cierra la lectura y se mata al proceso hijo.
    const rejectAndKill = (error: Error) => {
      rl.close();
      child.kill();
      reject(error);
    };

    child.on("error", rejectAndKill);

    // Cada línea no vacía representa un evento; si no es JSON, se incluye una muestra de hasta 200 caracteres en el error.
    rl.on("line", line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let parsed: WorkersEvent;
      try {
        parsed = JSON.parse(trimmed) as WorkersEvent;
      } catch (error) {
        const preview = trimmed.length > 200 ? `${trimmed.slice(0, 200)}...` : trimmed;
        rejectAndKill(
          new Error(
            `runWorkersBatch: failed to parse NDJSON line from forge614-workers: ${preview}`,
            { cause: error },
          ),
        );
        return;
      }

      try {
        onEvent(parsed);
      } catch (error) {
        rejectAndKill(
          new Error(
            `runWorkersBatch: onEvent handler threw while processing a "${parsed.event}" event`,
            { cause: error },
          ),
        );
      }
    });

    child.on("close", code => resolve(code ?? 1));

    child.stdin.write(JSON.stringify({ enginesBin, tasks }));
    child.stdin.end();
  });
}
