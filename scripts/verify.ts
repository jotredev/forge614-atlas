/** Verifica Atlas en un entorno temporal aislado con las versiones fijadas de Engines y Workers. */
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ENGINES_VERSION = "1.17.0";
const WORKERS_VERSION = "1.0.0";

/** Devuelve la tupla plataforma-arquitectura correspondiente a esta máquina. */
function targetForHost(): string {
  const os = process.platform === "darwin" ? "darwin" : process.platform;
  const arch = process.arch;
  if ((os === "darwin" || os === "linux") && (arch === "arm64" || arch === "x64")) {
    return `${os}-${arch}`;
  }
  throw new Error(`No hay assets fijados para ${process.platform}-${process.arch}.`);
}

/** Descarga y verifica Engines 1.17.0 y lo instala en el FORGE614_HOME temporal. */
async function prepareEngines(cacheDir: string, enginesBinDir: string): Promise<void> {
  const target = targetForHost();
  const archiveName = `forge614-engines-${ENGINES_VERSION}-${target}.tar.gz`;
  const cachedArchive = join(cacheDir, archiveName);

  if (!existsSync(cachedArchive)) {
    const base = `https://github.com/jotredev/forge614-engines/releases/download/v${ENGINES_VERSION}`;
    const archiveResponse = await fetch(`${base}/${archiveName}`);
    if (!archiveResponse.ok) throw new Error(`No se pudo descargar Engines: HTTP ${archiveResponse.status}`);
    const archive = Buffer.from(await archiveResponse.arrayBuffer());

    const checksumResponse = await fetch(`${base}/${archiveName}.sha256`);
    if (!checksumResponse.ok) throw new Error(`No se pudo descargar el checksum de Engines: HTTP ${checksumResponse.status}`);
    const expectedChecksum = (await checksumResponse.text()).trim().split(/\s+/)[0]?.toLowerCase();
    const actualChecksum = createHash("sha256").update(archive).digest("hex");
    if (!expectedChecksum || actualChecksum !== expectedChecksum) throw new Error("Checksum de Engines no coincide");

    await writeFile(cachedArchive, archive);
  }

  const extractDir = join(cacheDir, `extracted-engines-${ENGINES_VERSION}-${target}`);
  if (!existsSync(extractDir)) {
    await mkdir(extractDir, { recursive: true });
    const tarResult = spawnSync("tar", ["-xzf", cachedArchive, "-C", extractDir]);
    if (tarResult.status !== 0) throw new Error("No se pudo extraer Engines");
  }

  const binarySource = join(extractDir, `forge614-engines-${ENGINES_VERSION}-${target}`, "forge614-engines");
  const binaryTarget = join(enginesBinDir, "forge614-engines");
  await copyFile(binarySource, binaryTarget);
  await chmod(binaryTarget, 0o755);
}

/** Descarga y verifica Workers 1.0.0 y lo instala en el FORGE614_HOME temporal. */
async function prepareWorkers(cacheDir: string, workersBinDir: string): Promise<void> {
  const target = targetForHost();
  const binaryName = `forge614-workers-${target}`;
  const cachedBinary = join(cacheDir, `${binaryName}-${WORKERS_VERSION}`);

  if (!existsSync(cachedBinary)) {
    const base = `https://github.com/jotredev/forge614-workers/releases/download/v${WORKERS_VERSION}`;
    const binaryResponse = await fetch(`${base}/${binaryName}`);
    if (!binaryResponse.ok) throw new Error(`No se pudo descargar Workers: HTTP ${binaryResponse.status}`);
    const binaryBytes = Buffer.from(await binaryResponse.arrayBuffer());

    const sumsResponse = await fetch(`${base}/SHA256SUMS`);
    if (!sumsResponse.ok) throw new Error(`No se pudo descargar SHA256SUMS de Workers: HTTP ${sumsResponse.status}`);
    const sumsText = await sumsResponse.text();

    const expectedEntry = sumsText.split("\n").find((line) => line.endsWith(`  ${binaryName}`));
    const expectedChecksum = expectedEntry?.split(/\s+/)[0]?.toLowerCase();
    const actualChecksum = createHash("sha256").update(binaryBytes).digest("hex");
    if (!expectedChecksum || actualChecksum !== expectedChecksum) throw new Error("Checksum de Workers no coincide");

    await writeFile(cachedBinary, binaryBytes);
  }

  const binaryTarget = join(workersBinDir, "forge614-workers");
  await copyFile(cachedBinary, binaryTarget);
  await chmod(binaryTarget, 0o755);
}

/** Ejecuta un comando heredando el entorno aislado. */
function run(command: string[]): boolean {
  const result = spawnSync(command[0]!, command.slice(1), { stdio: "inherit", env: process.env });
  return result.status === 0;
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "forge614-atlas-verify-"));
const cacheDir = join(tmpdir(), "forge614-test-cache");
await mkdir(cacheDir, { recursive: true });

try {
  const isolatedHome = join(temporaryRoot, "home");
  const isolatedForgeHome = join(isolatedHome, ".forge614");
  const enginesBinDir = join(isolatedForgeHome, "engines", "bin");
  const workersBinDir = join(isolatedForgeHome, "workers", "bin");
  await mkdir(enginesBinDir, { recursive: true });
  await mkdir(workersBinDir, { recursive: true });

  await prepareEngines(cacheDir, enginesBinDir);
  await prepareWorkers(cacheDir, workersBinDir);

  process.env.HOME = isolatedHome;
  process.env.USERPROFILE = isolatedHome;
  process.env.FORGE614_HOME = isolatedForgeHome;

  if (!run(["bun", "test"])) process.exitCode = 1;
  else if (!run(["bun", "run", "typecheck"])) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

