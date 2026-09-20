import { win32, posix } from "node:path";

export function resolveEnginesBinaryPath(platform: NodeJS.Platform, home: string): string {
  const name = platform === "win32" ? "forge614-engines.exe" : "forge614-engines";
  const join = platform === "win32" ? win32.join : posix.join;
  return join(home, ".forge614", "engines", "bin", name);
}
