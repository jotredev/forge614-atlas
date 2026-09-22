import { win32, posix } from "node:path";

export function resolveWorkersBinaryPath(platform: NodeJS.Platform, home: string): string {
  const name = platform === "win32" ? "forge614-workers.exe" : "forge614-workers";
  const join = platform === "win32" ? win32.join : posix.join;
  return join(home, ".forge614", "workers", "bin", name);
}
