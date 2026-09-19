import { existsSync } from "node:fs";
import type { ModuleDescriptor } from "./discovery";

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[tj]sx?$/.test(filePath);
}

function hasSiblingTest(filePath: string): boolean {
  const dotIndex = filePath.lastIndexOf(".");
  const base = filePath.slice(0, dotIndex);
  const ext = filePath.slice(dotIndex);
  return existsSync(`${base}.test${ext}`) || existsSync(`${base}.spec${ext}`);
}

export function computeTestCoverageGap(modules: ModuleDescriptor[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const module of modules) {
    const sourceFiles = module.files.filter(file => !isTestFile(file));
    if (sourceFiles.length === 0) {
      result.set(module.name, 0);
      continue;
    }
    const withTests = sourceFiles.filter(hasSiblingTest);
    result.set(module.name, 1 - withTests.length / sourceFiles.length);
  }
  return result;
}
