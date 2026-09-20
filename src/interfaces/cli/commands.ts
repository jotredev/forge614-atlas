import { homedir } from "node:os";
import { MemoryWorkspace, WorkspaceConfig } from "forge614-engram";
import { resolveEnginesBinaryPath } from "../../modules/engines-client/binary-path";
import { runInitCommand } from "../../modules/cli/init";

export function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

export function runInit(directory: string, requestedEngineId: string | undefined, force: boolean): void {
  const workspace = new MemoryWorkspace();
  workspace.init();
  const store = workspace.open();
  try {
    const enginesBinaryPath = resolveEnginesBinaryPath(process.platform, homedir());
    const outcome = runInitCommand(store, { directory, enginesBinaryPath, requestedEngineId, force });
    printJson(outcome);
    if ("error" in outcome) process.exitCode = 1;
  } finally {
    store.close();
  }
}
