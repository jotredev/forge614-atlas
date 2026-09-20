import { spawnSync } from "node:child_process";

export interface AgentDetection {
  id: string;
  label: string;
  installed: boolean;
  executable?: string;
  configDir: string;
  configFound: boolean;
}

export function detectAgents(binaryPath: string): AgentDetection[] {
  const result = spawnSync(binaryPath, ["detect"], { encoding: "utf8" });

  if (result.error || result.status !== 0) {
    const detail = result.stderr?.trim() || result.error?.message || `exit code ${result.status}`;
    throw new Error(`forge614-engines detect failed: ${detail}`);
  }

  const parsed = JSON.parse(result.stdout) as { agents: AgentDetection[] };
  return parsed.agents;
}
