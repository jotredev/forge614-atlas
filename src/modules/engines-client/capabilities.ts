import { spawnSync } from "node:child_process";

export interface Capabilities {
  id: string;
  label: string;
  supportsMcp: boolean;
  supportsHooks: boolean;
  supportsHeadlessExec: boolean;
  supportsReasoningLevel: boolean;
}

export function getCapabilities(binaryPath: string, agentId: string): Capabilities {
  const result = spawnSync(binaryPath, ["capabilities", "--agent", agentId], { encoding: "utf8" });

  if (result.error || result.status !== 0) {
    const detail = result.stderr?.trim() || result.error?.message || `exit code ${result.status}`;
    throw new Error(`forge614-engines capabilities failed for ${agentId}: ${detail}`);
  }

  return JSON.parse(result.stdout) as Capabilities;
}
