import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { runWorkersBatch, type WorkersEvent } from "./run-batch";
import { resolveWorkersBinaryPath } from "./binary-path";
import { resolveEnginesBinaryPath } from "../engines-client/binary-path";

// Requiere forge614-engines y forge614-workers instalados en sus rutas fijas del
// ecosistema (confirmado presentes en esta máquina de desarrollo).
const workersBinaryPath = resolveWorkersBinaryPath(process.platform, homedir());
const enginesBinaryPath = resolveEnginesBinaryPath(process.platform, homedir());

function writeFakeClaudeScript(dir: string): string {
  const scriptPath = join(dir, "fake-claude.sh");
  writeFileSync(
    scriptPath,
    [
      "#!/bin/sh",
      "INPUT=$(cat)",
      'if echo "$INPUT" | grep -q "TRIGGER_QUOTA"; then',
      '  echo "Claude AI usage limit reached" >&2',
      "  exit 1",
      "fi",
      'echo "FAKE_ANALYSIS: $INPUT"',
      "exit 0",
    ].join("\n"),
  );
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

describe("runWorkersBatch", () => {
  test("streams task_started/task_completed/run_completed for a successful task", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-run-batch-"));
    const fakeClaude = writeFakeClaudeScript(dir);

    const events: WorkersEvent[] = [];
    const exitCode = await runWorkersBatch(workersBinaryPath, enginesBinaryPath, [
      { id: "auth", agentId: "claude-code", executable: fakeClaude, prompt: "analiza esto" },
    ], event => events.push(event));

    expect(exitCode).toBe(0);
    const kinds = events.map(e => e.event);
    expect(kinds).toEqual(["task_started", "task_completed", "run_completed"]);

    const completed = events.find(e => e.event === "task_completed");
    expect(completed?.taskId).toBe("auth");
    expect(completed?.stdout).toContain("FAKE_ANALYSIS: analiza esto");

    rmSync(dir, { recursive: true, force: true });
  });

  test("stops the batch and reports quota_exhausted when the pattern matches", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-run-batch-quota-"));
    const fakeClaude = writeFakeClaudeScript(dir);

    const events: WorkersEvent[] = [];
    const exitCode = await runWorkersBatch(workersBinaryPath, enginesBinaryPath, [
      { id: "auth", agentId: "claude-code", executable: fakeClaude, prompt: "TRIGGER_QUOTA" },
      { id: "billing", agentId: "claude-code", executable: fakeClaude, prompt: "nunca debe correr" },
    ], event => events.push(event));

    expect(exitCode).toBe(75);
    const kinds = events.map(e => e.event);
    expect(kinds).toEqual(["task_started", "quota_exhausted", "run_completed"]);
    expect(events.some(e => e.event === "task_started" && e.taskId === "billing")).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });
});
