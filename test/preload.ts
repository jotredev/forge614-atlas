/** Precarga de aislamiento de pruebas para Bun test: garantiza HOME y FORGE614_HOME temporales y seguros. */
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir, userInfo } from "node:os";
import { join } from "node:path";

const realUserHome = userInfo().homedir || homedir();
const realForgeHome = join(realUserHome, ".forge614");

// Si HOME o FORGE614_HOME apuntan al directorio real del usuario o no están definidos,
// se aíslan forzosamente en un directorio temporal desechable antes de ejecutar cualquier prueba.
const currentHome = process.env.HOME;
const currentForgeHome = process.env.FORGE614_HOME;

if (
  !currentHome ||
  !currentForgeHome ||
  currentHome === realUserHome ||
  currentForgeHome === realForgeHome ||
  !currentForgeHome.includes("test")
) {
  const isolatedHome = mkdtempSync(join(tmpdir(), "forge614-atlas-isolated-test-home-"));
  const isolatedForgeHome = join(isolatedHome, ".forge614");
  mkdirSync(isolatedForgeHome, { recursive: true });

  process.env.HOME = isolatedHome;
  process.env.USERPROFILE = isolatedHome;
  process.env.FORGE614_HOME = isolatedForgeHome;

  // Si existen binarios de prueba en la caché local, ponerlos a disposición de los clientes de Engines y Workers
  const testCacheDirs = [
    "/tmp/forge614-test-cache",
    "/tmp/claude-t46/test-cache",
    join(tmpdir(), "forge614-test-cache"),
  ];
  const target = process.platform === "darwin" ? `darwin-${process.arch}` : `linux-${process.arch}`;
  const candidatesEngines = testCacheDirs.flatMap((dir) => [
    join(dir, `forge614-engines-1.17.0-${target}`, "forge614-engines"),
    join(dir, `extracted-engines-1.17.0-${target}`, `forge614-engines-1.17.0-${target}`, "forge614-engines"),
  ]);
  const candidatesWorkers = testCacheDirs.flatMap((dir) => [
    join(dir, `forge614-workers-1.0.0-${target}`),
    join(dir, `forge614-workers-${target}-1.0.0`),
    join(dir, `forge614-workers-${target}`),
  ]);

  const cachedEngines = candidatesEngines.find((p) => existsSync(p));
  const cachedWorkers = candidatesWorkers.find((p) => existsSync(p));

  if (cachedEngines) {
    const enginesBinDir = join(isolatedForgeHome, "engines", "bin");
    mkdirSync(enginesBinDir, { recursive: true });
    const target = join(enginesBinDir, "forge614-engines");
    copyFileSync(cachedEngines, target);
    chmodSync(target, 0o755);
  }

  if (cachedWorkers) {
    const workersBinDir = join(isolatedForgeHome, "workers", "bin");
    mkdirSync(workersBinDir, { recursive: true });
    const target = join(workersBinDir, "forge614-workers");
    copyFileSync(cachedWorkers, target);
    chmodSync(target, 0o755);
  }
}

