import { spawnSync } from "node:child_process";
import { join, sep } from "node:path";
import type { ModuleDescriptor } from "./discovery";

export function computeChurn(repoRoot: string, modules: ModuleDescriptor[]): Map<string, number> {
  const result = spawnSync("git", ["log", "--format=", "--name-only"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git log failed in ${repoRoot}: ${result.stderr}`);
  }

  const churn = new Map(modules.map(module => [module.name, 0]));
  const touchedFiles = result.stdout.split("\n").map(line => line.trim()).filter(Boolean);

  for (const relativeFile of touchedFiles) {
    const absolutePath = join(repoRoot, relativeFile);
    const matchedModule = modules.find(module => {
      const modulePath = module.path;
      return absolutePath === modulePath || absolutePath.startsWith(modulePath + sep);
    });
    if (matchedModule) {
      churn.set(matchedModule.name, (churn.get(matchedModule.name) ?? 0) + 1);
    }
  }
  return churn;
}
