import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/** Niveles de razonamiento que Forge614 Workers acepta (Engines valida cuáles admite cada agente). */
export type WorkersReasoningLevel = "low" | "medium" | "high" | "xhigh" | "max";

/** Una tarea del lote que Atlas le manda a Forge614 Workers. */
export interface WorkersTask {
  id: string;
  agentId: string;
  executable: string;
  prompt: string;
  readableDir?: string;
  /**
   * Si es `true`, Workers pide a Engines el candado de solo lectura y se niega a correr la tarea
   * (`READ_ONLY_UNSUPPORTED`) si Engines no lo garantiza. Atlas lo manda siempre en `true`.
   */
  readOnly?: boolean;
  model?: string;
  reasoningLevel?: WorkersReasoningLevel;
  timeoutMs?: number;
}

/**
 * Un evento que Forge614 Workers imprime como una línea de NDJSON mientras corre el lote. `task_failed`
 * con `reason: "engine_unsupported"` y `stderr` que empieza con `READ_ONLY_UNSUPPORTED` es la negativa a
 * correr una tarea sin candado de solo lectura; `fatal_error` significa que no corrió nada.
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
 * @returns El código de salida de Workers (0 completo, 75 pausado por cuota, 2 fallo fatal).
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

    const rejectAndKill = (error: Error) => {
      rl.close();
      child.kill();
      reject(error);
    };

    child.on("error", rejectAndKill);

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
