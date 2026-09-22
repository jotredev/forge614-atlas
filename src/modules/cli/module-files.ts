import { discoverModules } from "../scoring/discovery";

export function resolveModuleFiles(directory: string, moduleNames: string[]): Map<string, string[]> {
  const modules = discoverModules(directory);
  const filesByName = new Map(modules.map(module => [module.name, module.files]));

  const result = new Map<string, string[]>();
  for (const name of moduleNames) {
    result.set(name, filesByName.get(name) ?? []);
  }
  return result;
}
