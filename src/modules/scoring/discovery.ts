import { Glob } from "bun";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "coverage", ".next", "out", ".forge614",
]);

export interface ModuleDescriptor {
  name: string;
  path: string;
  files: string[];
}

export function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[tj]sx?$/.test(filePath);
}

export function discoverModules(root: string): ModuleDescriptor[] {
  const topLevelDirs = readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith("."))
    .map(entry => entry.name);

  const modules: ModuleDescriptor[] = [];
  for (const dirName of topLevelDirs) {
    const modulePath = join(root, dirName);
    const files = listSourceFiles(modulePath);
    if (files.length > 0) {
      modules.push({ name: dirName, path: modulePath, files });
    }
  }
  return modules;
}

function listSourceFiles(dir: string): string[] {
  const glob = new Glob("**/*.{ts,tsx,js,jsx}");
  const matches: string[] = [];
  for (const relativePath of glob.scanSync({ cwd: dir, onlyFiles: true })) {
    const segments = relativePath.split("/");
    if (segments.some(segment => EXCLUDED_DIRS.has(segment) || segment.startsWith("."))) continue;
    matches.push(join(dir, relativePath));
  }
  return matches;
}
