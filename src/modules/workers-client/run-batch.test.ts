/** Comprueba eventos de éxito, pausa por cuota y rechazo de salida inválida al ejecutar un lote de Workers. */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { runWorkersBatch, type WorkersEvent } from "./run-batch";
import { resolveWorkersBinaryPath } from "./binary-path";
import { resolveEnginesBinaryPath } from "../engines-client/binary-path";
import { resolveForgeHome } from "../forge-home/forge-home";

// Las dos primeras pruebas necesitan Engines y Workers instalados en las rutas fijas del ecosistema.
// La tercera sustituye solo Workers por un programa temporal que produce una línea inválida.
const forgeHome = resolveForgeHome(process.env, homedir());
const workersBinaryPath = resolveWorkersBinaryPath(process.platform, forgeHome);
const enginesBinaryPath = resolveEnginesBinaryPath(process.platform, forgeHome);

/**
 * Crea un programa temporal que imprime `FAKE_ANALYSIS:` seguido del texto recibido o, si el texto contiene `TRIGGER_QUOTA`, escribe un aviso de límite de uso agotado y sale con código 1 (simula una cuota agotada).
 * @param dir Carpeta temporal donde se escribe el programa ejecutable.
 * @returns Ruta del programa temporal creado.
 * @throws Error del sistema de archivos si no se puede escribir o marcar ejecutable el programa.
 */
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

/** Comprueba cómo `runWorkersBatch` entrega eventos y códigos de salida en tres situaciones. */
describe("runWorkersBatch", () => {
  /** Comprueba salida 0, los tres eventos en orden y el texto producido para la tarea `auth`. */
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

  /** Comprueba salida 75, evento de cuota y ausencia de inicio de la segunda tarea `billing`. */
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

  /** Comprueba que una línea que no es JSON rechace la promesa mediante `toThrow`. */
  test("rejects the promise instead of throwing when a stdout line is not valid JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-run-batch-badjson-"));
    // Reemplaza el binario real de Workers por uno de mentiras que imprime una línea
    // de texto plano en vez de NDJSON, para forzar el fallo de parseo sin depender de
    // que forge614-workers real produzca output inválido.
    const fakeWorkersBinary = join(dir, "fake-workers.sh");
    writeFileSync(
      fakeWorkersBinary,
      ["#!/bin/sh", "cat > /dev/null", 'echo "this is not json"', "exit 0"].join("\n"),
    );
    chmodSync(fakeWorkersBinary, 0o755);

    const events: WorkersEvent[] = [];
    await expect(
      runWorkersBatch(fakeWorkersBinary, enginesBinaryPath, [], event => events.push(event)),
    ).rejects.toThrow();

    rmSync(dir, { recursive: true, force: true });
  });
});
