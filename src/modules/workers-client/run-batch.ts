import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface WorkersTask {
  id: string;
  agentId: string;
  executable: string;
  prompt: string;
  readableDir?: string;
  model?: string;
  reasoningLevel?: "low" | "medium" | "high";
  timeoutMs?: number;
}

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
