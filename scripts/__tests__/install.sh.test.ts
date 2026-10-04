import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const installer = resolve(import.meta.dir, "../install.sh");
const temporaryDirectories: string[] = [];
const fixtureBytes = "#!/usr/bin/env sh\nprintf 'fixture release binary\\n'\n";
const testReleaseBaseUrl = "FORGE614_ATLAS_TEST_RELEASE_BASE_URL";
const testMode = "FORGE614_ATLAS_INSTALLER_TEST";
const engramInstallerTestUrl = "FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL";
const workersInstallerTestUrl = "FORGE614_ATLAS_WORKERS_INSTALLER_TEST_URL";
const forgeHomeVariable = "FORGE614_HOME";

/** Cómo debe responder el Engines FALSO: su versión y el campo `supportsReadOnly` (`"absent"` lo omite). */
interface EnginesSpec {
  version: string;
  supportsReadOnly: boolean | "absent";
}

const goodEngines: EnginesSpec = { version: "1.17.0", supportsReadOnly: true };

/**
 * Escribe un binario FALSO que responde `--version` con `<name> <version>`; con `version` en `null` no
 * responde `--version` (sale con error), como un Workers anterior a 1.0.0.
 */
function writeFakeVersioned(path: string, name: string, version: string | null) {
  mkdirSync(dirname(path), { recursive: true });
  const answer = version === null ? "exit 1" : `printf '${name} ${version}\\n'`;
  writeFileSync(path, `#!/bin/sh\nif [ "$1" = "--version" ]; then\n  ${answer}\n  exit 0\nfi\nexit 0\n`);
  chmodSync(path, 0o755);
}

/** Escribe un Engines FALSO que responde `--version` y `capabilities --agent claude-code`. */
function writeFakeEngines(path: string, spec: EnginesSpec) {
  mkdirSync(dirname(path), { recursive: true });
  const field = spec.supportsReadOnly === "absent" ? "" : `,"supportsReadOnly":${spec.supportsReadOnly}`;
  writeFileSync(
    path,
    [
      "#!/bin/sh",
      'case "$1" in',
      `  --version) printf 'forge614-engines ${spec.version}\\n' ;;`,
      `  capabilities) printf '{"id":"claude-code"${field}}\\n' ;;`,
      "  *) exit 2 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(path, 0o755);
}

/** Lo que hace el instalador publicado FALSO de otro producto cuando Atlas lo corre. */
interface InstallerBehavior {
  /** Si es `true`, sale con 1 sin instalar nada. */
  fails?: boolean;
  /** Versión que imprime el binario que deja instalado (`null`: un binario sin `--version`). Por defecto la mínima. */
  installs?: string | null;
  /** Solo para Workers: el Engines que deja instalado, como haría el instalador real de Workers. */
  engines?: EnginesSpec;
}

/**
 * Escribe un instalador publicado FALSO de Engram o de Workers. Anota cada llamada en `logFile` como
 * `<producto>|<FORGE614_HOME que recibió>|<argumentos>` y deja su binario en `$FORGE614_HOME/<producto>/bin`.
 */
function writeFakeInstaller(directory: string, product: "engram" | "workers", behavior: InstallerBehavior, logFile: string) {
  const payload = join(directory, `${product}-payload`);
  writeFakeVersioned(payload, `forge614-${product}`, behavior.installs === undefined ? (product === "engram" ? "1.8.7" : "1.0.0") : behavior.installs);
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `printf '%s|%s|%s\\n' '${product}' "$FORGE614_HOME" "$*" >> '${logFile}'`,
  ];
  if (behavior.fails) {
    lines.push("exit 1");
  } else {
    lines.push(
      `mkdir -p "$FORGE614_HOME/${product}/bin"`,
      `cp '${payload}' "$FORGE614_HOME/${product}/bin/forge614-${product}"`,
      `chmod 755 "$FORGE614_HOME/${product}/bin/forge614-${product}"`,
    );
    if (behavior.engines) {
      const enginesPayload = join(directory, "engines-payload");
      writeFakeEngines(enginesPayload, behavior.engines);
      lines.push(
        'mkdir -p "$FORGE614_HOME/engines/bin"',
        `cp '${enginesPayload}' "$FORGE614_HOME/engines/bin/forge614-engines"`,
        'chmod 755 "$FORGE614_HOME/engines/bin/forge614-engines"',
      );
    }
  }
  const path = join(directory, `${product}-install.sh`);
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

// Las primeras pruebas de este archivo son anteriores a las dependencias que Atlas instala antes de
// copiar su binario. Ninguna fija sus propios instaladores de Engram y Workers, así que sin un valor por
// omisión caerían a las URL reales y dejarían de ser herméticas: todas las corridas apuntan a estos dos
// instaladores locales (que dejan Engram 1.8.7, Workers 1.0.0 y un Engines 1.17.0 con candado), salvo que
// la prueba ponga el suyo.
const defaultsDirectory = mkdtempSync(join(tmpdir(), "forge614-atlas-default-installers-"));
const defaultEngramInstaller = writeFakeInstaller(defaultsDirectory, "engram", {}, "/dev/null");
const defaultWorkersInstaller = writeFakeInstaller(defaultsDirectory, "workers", { engines: goodEngines }, "/dev/null");

afterAll(() => {
  rmSync(defaultsDirectory, { recursive: true, force: true });
});

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "forge614-atlas-installer-"));
  temporaryDirectories.push(directory);
  return directory;
}

function markerCount(contents: string) {
  return contents.split("# >>> forge614-atlas PATH >>>").length - 1;
}

function targetArtifact() {
  const target = `${process.platform}/${process.arch}`;
  const artifacts: Record<string, string> = {
    "darwin/x64": "forge614-atlas-darwin-x64",
    "darwin/arm64": "forge614-atlas-darwin-arm64",
    "linux/x64": "forge614-atlas-linux-x64",
    "linux/arm64": "forge614-atlas-linux-arm64",
  };
  const artifact = artifacts[target];
  if (!artifact) throw new Error(`Unsupported test host: ${target}`);
  return artifact;
}

function sha256(path: string) {
  const result = Bun.spawnSync(["shasum", "-a", "256", path]);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().split(/\s+/)[0]!;
}

async function runInstaller(args: string[]) {
  const child = Bun.spawn(["/usr/bin/env", "bash", installer, ...args], {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: await child.exited,
    stdout: await new Response(child.stdout).text(),
    stderr: await new Response(child.stderr).text(),
  };
}

/**
 * Corre `operation` con `HOME`, `SHELL` y las variables de prueba del instalador puestas, y las deja como
 * estaban al terminar. `FORGE614_HOME` se borra salvo que `extraEnv` la fije (un `undefined` borra la
 * variable), para que una variable real de la persona que corre las pruebas nunca llegue al instalador.
 */
async function withFixtureEnvironment<T>(
  home: string,
  releaseBaseUrl: string,
  operation: () => Promise<T>,
  includeTestSentinel = true,
  shell?: string,
  extraEnv: Record<string, string | undefined> = {},
) {
  const managed = [
    "HOME",
    "SHELL",
    forgeHomeVariable,
    testReleaseBaseUrl,
    testMode,
    engramInstallerTestUrl,
    workersInstallerTestUrl,
  ];
  const saved = Object.fromEntries(managed.map(name => [name, process.env[name]]));
  const settings: Record<string, string | undefined> = {
    HOME: home,
    SHELL: shell,
    [forgeHomeVariable]: undefined,
    [testReleaseBaseUrl]: releaseBaseUrl,
    [testMode]: includeTestSentinel ? "1" : undefined,
    [engramInstallerTestUrl]: process.env[engramInstallerTestUrl] ?? `file://${defaultEngramInstaller}`,
    [workersInstallerTestUrl]: process.env[workersInstallerTestUrl] ?? `file://${defaultWorkersInstaller}`,
    ...extraEnv,
  };
  for (const [name, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await operation();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function fixtureReleaseServer(artifact: string, fixturePath: string) {
  const digest = sha256(fixturePath);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const mismatch = url.pathname.startsWith("/mismatch/");
      const unsafeAssets = url.pathname.startsWith("/unsafe-assets/");
      const prefix = mismatch ? "/mismatch" : "/good";
      const baseUrl = `http://${url.host}${prefix}`;
      const assetBaseUrl = unsafeAssets ? "https://127.0.0.1:1" : baseUrl;
      if (url.pathname.endsWith("/releases/latest") || url.pathname.includes("/releases/tags/")) {
        return Response.json({
          assets: [
            { name: "SHA256SUMS", browser_download_url: `${assetBaseUrl}/download/SHA256SUMS` },
            { name: artifact, browser_download_url: `${assetBaseUrl}/download/${artifact}` },
          ],
        });
      }
      if (url.pathname.endsWith("/download/SHA256SUMS")) {
        const manifestDigest = mismatch ? "0".repeat(64) : digest;
        return new Response(`${manifestDigest}  ${artifact}\n`);
      }
      if (url.pathname.endsWith(`/download/${artifact}`)) {
        return new Response(readFileSync(fixturePath));
      }
      return new Response("not found", { status: 404 });
    },
  });
  return server;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

test.each([
  ["zsh", "/bin/zsh", ".zshrc"],
  ["bash", "/bin/bash", process.platform === "darwin" ? ".bash_profile" : ".bashrc"],
  ["fish", "/usr/bin/fish", ".config/fish/conf.d/forge614-atlas.fish"],
])("publishes a custom bin directory once for %s", async (_name, shell, configurationFile) => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "custom-bin");
  const fakeHome = join(root, "home");
  const configurationPath = join(fakeHome, configurationFile);
  mkdirSync(fakeHome, { recursive: true });
  mkdirSync(resolve(configurationPath, ".."), { recursive: true });
  writeFileSync(fixture, fixtureBytes);
  writeFileSync(configurationPath, "# unrelated configuration\nexport KEEP_THIS=1\n");
  const server = fixtureReleaseServer(targetArtifact(), fixture);

  try {
    const first = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]), true, shell);
    const second = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination, "--force"]), true, shell);
    const configuration = readFileSync(configurationPath, "utf8");

    expect(first.exitCode, first.stderr).toBe(0);
    expect(second.exitCode, second.stderr).toBe(0);
    expect(first.stdout).toContain(configurationPath);
    expect(first.stdout).toContain("new terminal");
    expect(configuration).toContain("# unrelated configuration");
    expect(configuration).toContain("export KEEP_THIS=1");
    expect(configuration).toContain(destination);
    expect(configuration).toContain(
      shell.endsWith("fish") ? `set -gx PATH ${destination} $PATH` : `export PATH=${destination}:"$PATH"`,
    );
    expect(markerCount(configuration)).toBe(1);
  } finally {
    server.stop(true);
  }
});

test("leaves shell files untouched and prints manual PATH guidance for an unknown shell", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "custom-bin");
  const fakeHome = join(root, "home");
  const shellFiles = [".zshrc", ".bashrc", ".bash_profile", ".config/fish/conf.d/forge614-atlas.fish"];
  mkdirSync(fakeHome, { recursive: true });
  writeFileSync(fixture, fixtureBytes);
  for (const shellFile of shellFiles) {
    const path = join(fakeHome, shellFile);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, `unrelated ${shellFile}\n`);
  }
  const server = fixtureReleaseServer(targetArtifact(), fixture);

  try {
    const first = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]), true, "/bin/unknown");
    const second = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination, "--force"]), true, "/bin/unknown");

    expect(first.exitCode, first.stderr).toBe(0);
    expect(second.exitCode, second.stderr).toBe(0);
    expect(first.stdout).toContain(`export PATH=${destination}:\"$PATH\"`);
    expect(first.stdout).toContain("manually");
    expect(second.stdout).toContain("manually");
    for (const shellFile of shellFiles) {
      expect(readFileSync(join(fakeHome, shellFile), "utf8")).toBe(`unrelated ${shellFile}\n`);
    }
  } finally {
    server.stop(true);
  }
});

test("default install uses the product bin with locked-down permissions", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const fakeHome = join(root, "home");
  mkdirSync(fakeHome, { recursive: true });
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    const result = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller([]), true, "/bin/unknown");
    expect(result.exitCode, result.stderr).toBe(0);
    expect(existsSync(join(fakeHome, ".forge614", "atlas", "bin", "forge614-atlas"))).toBe(true);
    expect(result.stdout).toContain("forge614-atlas init");
    expect(statSync(join(fakeHome, ".forge614", "atlas")).mode & 0o777).toBe(0o700);
    expect(statSync(join(fakeHome, ".forge614", "atlas", "bin")).mode & 0o777).toBe(0o700);
  } finally {
    server.stop(true);
  }
});

test("refuses replacement without force", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "chosen-bin");
  const fakeHome = join(root, "empty-home");
  mkdirSync(fakeHome);
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]));
    const secondWithoutForce = await withFixtureEnvironment(fakeHome, `${server.url}good`, () =>
      runInstaller(["--bin-dir", destination]),
    );
    expect(secondWithoutForce.exitCode).not.toBe(0);
    expect(readFileSync(join(destination, "forge614-atlas"), "utf8")).toBe(fixtureBytes);
  } finally {
    server.stop(true);
  }
});

test("rejects a checksum mismatch before creating the destination", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const mismatchDestination = join(root, "checksum-mismatch-bin");
  const fakeHome = join(root, "empty-home");
  mkdirSync(fakeHome);
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    const checksumMismatch = await withFixtureEnvironment(fakeHome, `${server.url}mismatch`, () =>
      runInstaller(["--bin-dir", mismatchDestination]),
    );
    expect(checksumMismatch.exitCode).not.toBe(0);
    expect(existsSync(join(mismatchDestination, "forge614-atlas"))).toBe(false);
    expect(existsSync(join(fakeHome, ".forge614"))).toBe(false);
  } finally {
    server.stop(true);
  }
});

test.each([
  ["an HTTPS endpoint", "https://127.0.0.1:1"],
  ["a userinfo endpoint", "http://127.0.0.1:5432@localhost:1"],
])("rejects %s before downloading", async (_description, releaseBaseUrl) => {
  const root = temporaryDirectory();
  const fakeHome = join(root, "empty-home");
  const destination = join(root, "untrusted-bin");
  mkdirSync(fakeHome);

  const result = await withFixtureEnvironment(fakeHome, releaseBaseUrl, () =>
    runInstaller(["--bin-dir", destination]),
  );

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("test release endpoint must be a loopback HTTP URL");
  expect(existsSync(destination)).toBe(false);
  expect(existsSync(join(fakeHome, ".forge614"))).toBe(false);
});

test("rejects a test endpoint without the test sentinel", async () => {
  const root = temporaryDirectory();
  const fakeHome = join(root, "empty-home");
  const destination = join(root, "untrusted-bin");
  mkdirSync(fakeHome);

  const result = await withFixtureEnvironment(fakeHome, "http://127.0.0.1:1", () =>
    runInstaller(["--bin-dir", destination]),
  false);

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("reserved for test fixtures");
  expect(existsSync(destination)).toBe(false);
  expect(existsSync(join(fakeHome, ".forge614"))).toBe(false);
});

test("rejects non-loopback release asset URLs from a test fixture", async () => {
  const root = temporaryDirectory();
  const fakeHome = join(root, "empty-home");
  const destination = join(root, "untrusted-bin");
  const fixture = join(root, "fixture-binary");
  mkdirSync(fakeHome);
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    const result = await withFixtureEnvironment(fakeHome, `${server.url}unsafe-assets`, () =>
      runInstaller(["--bin-dir", destination]),
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("unsafe test fixture URL");
    expect(existsSync(destination)).toBe(false);
    expect(existsSync(join(fakeHome, ".forge614"))).toBe(false);
  } finally {
    server.stop(true);
  }
});

test("installs Forge614 Engram as a dependency without configuring an AI client", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "bin");
  const fakeHome = join(root, "home");
  const engramInstaller = writeFakeInstaller(root, "engram", {}, join(root, "calls.log"));
  mkdirSync(fakeHome, { recursive: true });
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    const result = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]), true, undefined, {
      [engramInstallerTestUrl]: `file://${engramInstaller}`,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(existsSync(join(fakeHome, ".forge614", "engram", "bin", "forge614-engram"))).toBe(true);
    expect(existsSync(join(fakeHome, ".claude.json"))).toBe(false);
    expect(existsSync(join(fakeHome, ".codex", "config.toml"))).toBe(false);
  } finally {
    server.stop(true);
  }
});

test("rejects a non-file Engram installer override", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "untrusted-bin");
  const fakeHome = join(root, "empty-home");
  mkdirSync(fakeHome);
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    const result = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]), true, undefined, {
      [engramInstallerTestUrl]: "https://example.invalid/install.sh",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("must be a local file URL");
    expect(existsSync(destination)).toBe(false);
  } finally {
    server.stop(true);
  }
});

test("rejects a non-file Workers installer override", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "untrusted-bin");
  const fakeHome = join(root, "empty-home");
  mkdirSync(fakeHome);
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    const result = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]), true, undefined, {
      [workersInstallerTestUrl]: "https://example.invalid/install.sh",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("The Workers test installer must be a local file URL");
    expect(existsSync(destination)).toBe(false);
  } finally {
    server.stop(true);
  }
});

/** Qué hay ya instalado antes de correr el instalador: una versión, `null` (sin `--version`) o nada. */
interface Scenario {
  engram?: string | null;
  workers?: string | null;
  engines?: EnginesSpec;
  engramInstaller?: InstallerBehavior;
  workersInstaller?: InstallerBehavior;
  /** `"custom"` (por defecto): una carpeta distinta de `$HOME/.forge614`; `"unset"`: sin variable; otro texto: ese valor. */
  forgeHome?: string;
  args?: string[];
}

/**
 * Corre el instalador en un `HOME` y un `FORGE614_HOME` temporales, con Engram, Workers y Engines FALSOS ya
 * instalados según `scenario` y con instaladores publicados FALSOS. Nunca toca el `HOME` real.
 * @returns El resultado, las carpetas usadas y las llamadas que recibieron los instaladores falsos.
 */
async function runScenario(scenario: Scenario) {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const home = join(root, "home");
  const log = join(root, "calls.log");
  mkdirSync(home, { recursive: true });
  writeFileSync(fixture, fixtureBytes);

  const forgeHomeSetting = scenario.forgeHome ?? "custom";
  const forgeHome =
    forgeHomeSetting === "custom" ? join(root, "forge614-custom") : forgeHomeSetting === "unset" ? join(home, ".forge614") : forgeHomeSetting;
  if (scenario.engram !== undefined) writeFakeVersioned(join(forgeHome, "engram", "bin", "forge614-engram"), "forge614-engram", scenario.engram);
  if (scenario.workers !== undefined) writeFakeVersioned(join(forgeHome, "workers", "bin", "forge614-workers"), "forge614-workers", scenario.workers);
  if (scenario.engines) writeFakeEngines(join(forgeHome, "engines", "bin", "forge614-engines"), scenario.engines);

  const engramInstaller = writeFakeInstaller(root, "engram", scenario.engramInstaller ?? {}, log);
  const workersInstaller = writeFakeInstaller(root, "workers", scenario.workersInstaller ?? { engines: goodEngines }, log);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    const result = await withFixtureEnvironment(home, `${server.url}good`, () => runInstaller(scenario.args ?? []), true, "/bin/zsh", {
      [engramInstallerTestUrl]: `file://${engramInstaller}`,
      [workersInstallerTestUrl]: `file://${workersInstaller}`,
      ...(forgeHomeSetting === "unset" ? {} : { [forgeHomeVariable]: forgeHomeSetting === "custom" ? forgeHome : forgeHomeSetting }),
    });
    const calls = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(line => line !== "") : [];
    return { result, home, forgeHome, calls, atlasBinary: join(forgeHome, "atlas", "bin", "forge614-atlas") };
  } finally {
    server.stop(true);
  }
}

describe("dependencies and FORGE614_HOME", () => {
  test("a clean machine runs the published Engram and Workers installers (no --force) and then installs Atlas", async () => {
    const run = await runScenario({});

    expect(run.result.exitCode, run.result.stderr).toBe(0);
    expect(run.calls).toEqual([`engram|${run.forgeHome}|`, `workers|${run.forgeHome}|`]);
    expect(existsSync(run.atlasBinary)).toBe(true);
    expect(existsSync(join(run.home, ".forge614"))).toBe(false);
  });

  test.each([
    ["the minimum versions", "1.8.7", "1.0.0", "1.17.0"],
    ["newer versions", "1.9.2", "2.0.0", "1.18.0"],
  ])("does not reinstall Engram, Workers or Engines when %s are already there", async (_name, engram, workers, engines) => {
    const run = await runScenario({ engram, workers, engines: { version: engines, supportsReadOnly: true } });

    expect(run.result.exitCode, run.result.stderr).toBe(0);
    expect(run.calls).toEqual([]);
    expect(run.result.stdout).toContain("Forge614 Engram is compatible");
    expect(run.result.stdout).toContain("Forge614 Workers is compatible");
    expect(existsSync(run.atlasBinary)).toBe(true);
  });

  test.each([
    ["is 1.5.0", "1.5.0"],
    ["is 1.8.6", "1.8.6"],
    ["does not answer --version", null],
  ])("updates an Engram that %s with --force, the way Engram's own update does", async (_name, engram) => {
    const run = await runScenario({ engram, workers: "1.0.0", engines: goodEngines });

    expect(run.result.exitCode, run.result.stderr).toBe(0);
    expect(run.calls).toEqual([`engram|${run.forgeHome}|--force`]);
    expect(existsSync(run.atlasBinary)).toBe(true);
  });

  test.each([
    ["is 0.1.0", "0.1.0"],
    ["has no --version", null],
  ])("installs a Workers that %s, without --force", async (_name, workers) => {
    const run = await runScenario({ engram: "1.8.7", workers, engines: goodEngines });

    expect(run.result.exitCode, run.result.stderr).toBe(0);
    expect(run.calls).toEqual([`workers|${run.forgeHome}|`]);
    expect(existsSync(run.atlasBinary)).toBe(true);
  });

  test.each([
    ["the Workers installer fails", { workersInstaller: { fails: true } }, "Forge614 Workers could not be installed"],
    ["the Workers installer leaves a Workers older than 1.0.0", { workersInstaller: { installs: "0.1.0", engines: goodEngines } }, "Forge614 Workers is still missing or older than 1.0.0"],
    ["the Engram installer fails", { engramInstaller: { fails: true } }, "Forge614 Engram could not be installed or updated"],
    ["Engram stays older than 1.8.7", { engram: "1.5.0", engramInstaller: { installs: "1.5.0" } }, "Forge614 Engram is still missing or older than 1.8.7"],
    ["Engines does not report supportsReadOnly: true", { engram: "1.8.7", workers: "1.0.0", engines: { version: "1.17.0", supportsReadOnly: false } }, "read-only lock"],
    ["Engines does not report supportsReadOnly at all", { engram: "1.8.7", workers: "1.0.0", engines: { version: "1.17.0", supportsReadOnly: "absent" } }, "read-only lock"],
    ["Engines is older than 1.17.0", { engram: "1.8.7", workers: "1.0.0", engines: { version: "1.16.0", supportsReadOnly: true } }, "Forge614 Engines 1.17.0 or newer"],
    ["Engines is missing although Workers is fine", { engram: "1.8.7", workers: "1.0.0" }, "Forge614 Engines 1.17.0 or newer"],
  ] as [string, Scenario, string][])("creates nothing of Atlas and exits 1 with the reason when %s", async (_name, scenario, reason) => {
    const run = await runScenario(scenario);

    expect(run.result.exitCode).toBe(1);
    expect(run.result.stderr).toContain(reason);
    expect(run.result.stderr).toContain("Atlas was not changed.");
    expect(existsSync(join(run.forgeHome, "atlas"))).toBe(false);
    expect(existsSync(run.atlasBinary)).toBe(false);
    // Tampoco se publicó el PATH en el perfil de la terminal.
    expect(existsSync(join(run.home, ".zshrc"))).toBe(false);
    expect(readdirSync(run.home)).toEqual([]);
  });

  test("an absolute FORGE614_HOME receives everything: the dependencies, the Atlas binary and its permissions", async () => {
    const run = await runScenario({ forgeHome: "custom" });

    expect(run.result.exitCode, run.result.stderr).toBe(0);
    expect(run.calls).toEqual([`engram|${run.forgeHome}|`, `workers|${run.forgeHome}|`]);
    expect(existsSync(join(run.forgeHome, "engram", "bin", "forge614-engram"))).toBe(true);
    expect(existsSync(join(run.forgeHome, "workers", "bin", "forge614-workers"))).toBe(true);
    expect(existsSync(join(run.forgeHome, "engines", "bin", "forge614-engines"))).toBe(true);
    expect(existsSync(run.atlasBinary)).toBe(true);
    expect(statSync(join(run.forgeHome, "atlas", "bin")).mode & 0o777).toBe(0o700);
    expect(readFileSync(join(run.home, ".zshrc"), "utf8")).toContain(join(run.forgeHome, "atlas", "bin"));
    // Nada cae en el $HOME/.forge614 de siempre.
    expect(existsSync(join(run.home, ".forge614"))).toBe(false);
  });

  test("without FORGE614_HOME everything falls in $HOME/.forge614", async () => {
    const run = await runScenario({ forgeHome: "unset" });

    expect(run.result.exitCode, run.result.stderr).toBe(0);
    expect(run.forgeHome).toBe(join(run.home, ".forge614"));
    expect(run.calls).toEqual([`engram|${run.forgeHome}|`, `workers|${run.forgeHome}|`]);
    expect(existsSync(run.atlasBinary)).toBe(true);
  });

  test.each([
    ["empty", ""],
    ["relative", "relative/forge614"],
  ])("a %s FORGE614_HOME is INVALID_FORGE614_HOME and nothing is created or downloaded", async (_name, value) => {
    const run = await runScenario({ forgeHome: value });

    expect(run.result.exitCode).toBe(1);
    expect(run.result.stderr).toContain("INVALID_FORGE614_HOME: FORGE614_HOME must be a non-empty absolute path.");
    expect(run.calls).toEqual([]);
    expect(readdirSync(run.home)).toEqual([]);
    expect(existsSync(join(process.cwd(), "relative"))).toBe(false);
  });

  test("--help names FORGE614_HOME and the minimum versions, and exits 0", async () => {
    const run = await runScenario({ args: ["--help"] });

    expect(run.result.exitCode, run.result.stderr).toBe(0);
    expect(run.result.stdout).toContain("FORGE614_HOME");
    expect(run.result.stdout).toContain("Engram 1.8.7");
    expect(run.result.stdout).toContain("Workers 1.0.0");
    expect(run.calls).toEqual([]);
  });
});
