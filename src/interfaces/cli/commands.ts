import { homedir } from "node:os";
import { MemoryWorkspace } from "forge614-engram";
import { resolveEnginesBinaryPath } from "../../modules/engines-client/binary-path";
import { resolveWorkersBinaryPath } from "../../modules/workers-client/binary-path";
import { runInitCommand } from "../../modules/cli/init";

export function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

export async function runInit(directory: string, requestedEngineId: string | undefined, force: boolean): Promise<void> {
  const workspace = new MemoryWorkspace();
  workspace.init();
  const store = workspace.open();
  store.enableSessions();
  try {
    const enginesBinaryPath = resolveEnginesBinaryPath(process.platform, homedir());
    const workersBinaryPath = resolveWorkersBinaryPath(process.platform, homedir());
    const outcome = await runInitCommand(store, { directory, enginesBinaryPath, workersBinaryPath, requestedEngineId, force });
    printJson(outcome);
    if ("error" in outcome) process.exitCode = 1;
  } finally {
    store.close();
  }
}
