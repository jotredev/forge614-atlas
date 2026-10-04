import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const entrypoint = resolve(import.meta.dir, "../../interfaces/cli/main.ts");
const START = "# >>> forge614-atlas PATH >>>";
const END = "# <<< forge614-atlas PATH <<<";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Carpetas temporales del sistema que hacen de `$HOME` y de `FORGE614_HOME`; nunca las reales. */
interface Sandbox {
  home: string;
  forgeHome: string;
  atlas: string;
}

function makeSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "atlas-uninstall-"));
  tempDirs.push(root);
  const home = join(root, "home");
  const forgeHome = join(root, "forge614");
  mkdirSync(home);
  mkdirSync(forgeHome);
  return { home, forgeHome, atlas: join(forgeHome, "atlas") };
}

/** Una instalación FALSA de Atlas: su carpeta con un binario y otro archivo, más vecinos que NO deben tocarse. */
function installFakeAtlas(sandbox: Sandbox): void {
  mkdirSync(join(sandbox.atlas, "bin"), { recursive: true });
  writeFileSync(join(sandbox.atlas, "bin", "forge614-atlas"), "fake binary\n");
  writeFileSync(join(sandbox.atlas, "notes.txt"), "inside atlas\n");
  mkdirSync(join(sandbox.forgeHome, "engram"), { recursive: true });
  writeFileSync(join(sandbox.forgeHome, "engram", "keep.txt"), "engram data\n");
  mkdirSync(join(sandbox.forgeHome, "workers"), { recursive: true });
  writeFileSync(join(sandbox.forgeHome, "workers", "keep.txt"), "workers data\n");
}

/** El bloque de PATH tal como lo escribe el instalador de Atlas. */
function pathBlock(binDir: string): string {
  return `${START}\ncase ":$PATH:" in\n  *:${binDir}:*) ;;\n  *) export PATH=${binDir}:"$PATH" ;;\nesac\n${END}\n`;
}

function childEnv(sandbox: Sandbox, forgeHome: string | undefined = sandbox.forgeHome): Record<string, string> {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: sandbox.home };
  if (forgeHome !== undefined) env.FORGE614_HOME = forgeHome;
  return env;
}

/** Corre `main.ts uninstall ...` en un proceso hijo, sin terminal en stdin. */
async function runUninstall(sandbox: Sandbox, args: string[], forgeHome?: string): Promise<{ exitCode: number; stdout: string }> {
  const child = Bun.spawn(["bun", entrypoint, "uninstall", ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: childEnv(sandbox, forgeHome),
  });
  const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  return { exitCode, stdout };
}

/** Corre `uninstall` en un proceso hijo con una terminal real y escribe `answer` cuando pide confirmación. */
async function runUninstallInTerminal(sandbox: Sandbox, answer: string): Promise<{ exitCode: number; output: string }> {
  let output = "";
  const child = Bun.spawn(["bun", entrypoint, "uninstall"], {
    env: childEnv(sandbox),
    terminal: {
      cols: 120,
      rows: 24,
      data(_terminal: unknown, data: Uint8Array) {
        output += new TextDecoder().decode(data);
      },
    },
  });
  // Espera a que el comando muestre su pregunta antes de contestar.
  for (let waited = 0; !output.includes("REMOVE FORGE614-ATLAS") && waited < 100; waited += 1) await Bun.sleep(50);
  child.terminal?.write(`${answer}\n`);
  const exitCode = await child.exited;
  return { exitCode, output };
}

function errorCode(stdout: string): string {
  return (JSON.parse(stdout) as { error: { code: string } }).error.code;
}

describe("forge614-atlas uninstall", () => {
  test("removes the Atlas folder and only the PATH block, leaves every other line and every other product alone", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);
    const binDir = join(sandbox.atlas, "bin");
    writeFileSync(join(sandbox.home, ".zshrc"), `export FOO=1\n${pathBlock(binDir)}alias ll='ls -l'\n`);
    writeFileSync(join(sandbox.home, ".bashrc"), "export BAR=2\n");
    const bashrcBefore = readFileSync(join(sandbox.home, ".bashrc"), "utf8");

    const result = await runUninstall(sandbox, ["--confirmed"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      status: "uninstalled",
      removed: true,
      pathPublications: [join(sandbox.home, ".zshrc")],
    });
    expect(readFileSync(join(sandbox.home, ".zshrc"), "utf8")).toBe("export FOO=1\nalias ll='ls -l'\n");
    expect(readFileSync(join(sandbox.home, ".bashrc"), "utf8")).toBe(bashrcBefore);
    expect(existsSync(join(sandbox.home, ".bash_profile"))).toBe(false);
    expect(existsSync(sandbox.atlas)).toBe(false);
    expect(readFileSync(join(sandbox.forgeHome, "engram", "keep.txt"), "utf8")).toBe("engram data\n");
    expect(readFileSync(join(sandbox.forgeHome, "workers", "keep.txt"), "utf8")).toBe("workers data\n");
  });

  test("removes the block from .bash_profile and .bashrc too, keeping their other lines", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);
    writeFileSync(join(sandbox.home, ".bash_profile"), `# profile\n${pathBlock("/x/bin")}`);
    writeFileSync(join(sandbox.home, ".bashrc"), `${pathBlock("/x/bin")}export BAR=2\n`);

    const result = await runUninstall(sandbox, ["--confirmed"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).pathPublications).toEqual([join(sandbox.home, ".bash_profile"), join(sandbox.home, ".bashrc")]);
    expect(readFileSync(join(sandbox.home, ".bash_profile"), "utf8")).toBe("# profile\n");
    expect(readFileSync(join(sandbox.home, ".bashrc"), "utf8")).toBe("export BAR=2\n");
  });

  test("running it again finds nothing to do: exit 0 with removed: false", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);
    writeFileSync(join(sandbox.home, ".zshrc"), `export FOO=1\n${pathBlock("/x/bin")}`);
    await runUninstall(sandbox, ["--confirmed"]);

    const second = await runUninstall(sandbox, ["--confirmed"]);

    expect(second.exitCode).toBe(0);
    expect(JSON.parse(second.stdout)).toEqual({ schemaVersion: 1, status: "uninstalled", removed: false, pathPublications: [] });
    expect(readFileSync(join(sandbox.home, ".zshrc"), "utf8")).toBe("export FOO=1\n");
  });

  test("an atlas folder that is a symbolic link is refused with UNINSTALL_UNSAFE and nothing is deleted or rewritten", async () => {
    const sandbox = makeSandbox();
    const target = join(sandbox.forgeHome, "..", "somewhere-else");
    mkdirSync(target);
    writeFileSync(join(target, "precious.txt"), "do not delete\n");
    symlinkSync(target, sandbox.atlas);
    writeFileSync(join(sandbox.home, ".zshrc"), `export FOO=1\n${pathBlock("/x/bin")}`);
    const zshrcBefore = readFileSync(join(sandbox.home, ".zshrc"), "utf8");

    const result = await runUninstall(sandbox, ["--confirmed"]);

    expect(result.exitCode).toBe(1);
    expect(errorCode(result.stdout)).toBe("UNINSTALL_UNSAFE");
    expect(JSON.parse(result.stdout).status).toBe("error");
    expect(lstatSync(sandbox.atlas).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(target, "precious.txt"), "utf8")).toBe("do not delete\n");
    expect(readFileSync(join(sandbox.home, ".zshrc"), "utf8")).toBe(zshrcBefore);
    rmSync(target, { recursive: true, force: true });
  });

  test("an atlas path that is a plain file is refused with UNINSTALL_UNSAFE", async () => {
    const sandbox = makeSandbox();
    writeFileSync(sandbox.atlas, "not a folder\n");

    const result = await runUninstall(sandbox, ["--confirmed"]);

    expect(result.exitCode).toBe(1);
    expect(errorCode(result.stdout)).toBe("UNINSTALL_UNSAFE");
    expect(readFileSync(sandbox.atlas, "utf8")).toBe("not a folder\n");
  });

  test("without --confirmed and without a terminal it answers CONFIRMATION_REQUIRED and deletes nothing", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);
    writeFileSync(join(sandbox.home, ".zshrc"), `export FOO=1\n${pathBlock("/x/bin")}`);
    const zshrcBefore = readFileSync(join(sandbox.home, ".zshrc"), "utf8");

    const result = await runUninstall(sandbox, []);

    expect(result.exitCode).toBe(1);
    expect(errorCode(result.stdout)).toBe("CONFIRMATION_REQUIRED");
    expect(existsSync(join(sandbox.atlas, "bin", "forge614-atlas"))).toBe(true);
    expect(readFileSync(join(sandbox.home, ".zshrc"), "utf8")).toBe(zshrcBefore);
  });

  test("--from accepts only forge614-engram: any other value is INVALID_ARGUMENT and nothing is deleted", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);

    const result = await runUninstall(sandbox, ["--from", "otra-cosa", "--confirmed"]);

    expect(result.exitCode).toBe(1);
    expect(errorCode(result.stdout)).toBe("INVALID_ARGUMENT");
    expect(existsSync(join(sandbox.atlas, "bin", "forge614-atlas"))).toBe(true);
  });

  test("--from without a value and unknown arguments are INVALID_ARGUMENT too", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);

    const withoutValue = await runUninstall(sandbox, ["--confirmed", "--from"]);
    const unknown = await runUninstall(sandbox, ["--confirmed", "--wipe-everything"]);

    expect(withoutValue.exitCode).toBe(1);
    expect(errorCode(withoutValue.stdout)).toBe("INVALID_ARGUMENT");
    expect(unknown.exitCode).toBe(1);
    expect(errorCode(unknown.stdout)).toBe("INVALID_ARGUMENT");
    expect(existsSync(join(sandbox.atlas, "bin", "forge614-atlas"))).toBe(true);
  });

  test("a fish file that holds only the block is deleted", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);
    const fish = join(sandbox.home, ".config", "fish", "conf.d", "forge614-atlas.fish");
    mkdirSync(join(sandbox.home, ".config", "fish", "conf.d"), { recursive: true });
    writeFileSync(fish, pathBlock("/x/bin"));

    const result = await runUninstall(sandbox, ["--confirmed"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).pathPublications).toEqual([fish]);
    expect(existsSync(fish)).toBe(false);
  });

  test("a fish file with more than the block keeps its other content and loses only the block", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);
    const fish = join(sandbox.home, ".config", "fish", "conf.d", "forge614-atlas.fish");
    mkdirSync(join(sandbox.home, ".config", "fish", "conf.d"), { recursive: true });
    writeFileSync(fish, `set -gx EDITOR vim\n${pathBlock("/x/bin")}`);

    const result = await runUninstall(sandbox, ["--confirmed"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).pathPublications).toEqual([fish]);
    expect(readFileSync(fish, "utf8")).toBe("set -gx EDITOR vim\n");
  });

  test("a terminal profile that cannot be rewritten is PATH_REMOVE_FAILED and nothing is deleted", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);
    const real = join(sandbox.home, "real-zshrc");
    writeFileSync(real, `export FOO=1\n${pathBlock("/x/bin")}`);
    symlinkSync(real, join(sandbox.home, ".zshrc"));

    const result = await runUninstall(sandbox, ["--confirmed"]);

    expect(result.exitCode).toBe(1);
    expect(errorCode(result.stdout)).toBe("PATH_REMOVE_FAILED");
    expect(readFileSync(real, "utf8")).toBe(`export FOO=1\n${pathBlock("/x/bin")}`);
    expect(existsSync(join(sandbox.atlas, "bin", "forge614-atlas"))).toBe(true);
  });

  test("a profile with an unclosed block is PATH_REMOVE_FAILED: no profile is touched and nothing is deleted", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);
    writeFileSync(join(sandbox.home, ".zshrc"), `export FOO=1\n${pathBlock("/x/bin")}`);
    writeFileSync(join(sandbox.home, ".bashrc"), `export BAR=2\n${START}\nunclosed\n`);
    const zshrcBefore = readFileSync(join(sandbox.home, ".zshrc"), "utf8");

    const result = await runUninstall(sandbox, ["--confirmed"]);

    expect(result.exitCode).toBe(1);
    expect(errorCode(result.stdout)).toBe("PATH_REMOVE_FAILED");
    expect(readFileSync(join(sandbox.home, ".zshrc"), "utf8")).toBe(zshrcBefore);
    expect(existsSync(join(sandbox.atlas, "bin", "forge614-atlas"))).toBe(true);
  });

  test("an invalid FORGE614_HOME is INVALID_FORGE614_HOME and nothing is touched", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);

    const empty = await runUninstall(sandbox, ["--confirmed"], "");
    const relative = await runUninstall(sandbox, ["--confirmed"], "relative/forge614");

    for (const result of [empty, relative]) {
      expect(result.exitCode).toBe(1);
      expect(errorCode(result.stdout)).toBe("INVALID_FORGE614_HOME");
    }
    expect(existsSync(join(sandbox.atlas, "bin", "forge614-atlas"))).toBe(true);
  });

  test("with a terminal, typing exactly REMOVE FORGE614-ATLAS removes it", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);

    const result = await runUninstallInTerminal(sandbox, "REMOVE FORGE614-ATLAS");

    expect(result.exitCode).toBe(0);
    expect(existsSync(sandbox.atlas)).toBe(false);
  });

  test("with a terminal, any other answer cancels with exit 130 and deletes nothing", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);
    writeFileSync(join(sandbox.home, ".zshrc"), `export FOO=1\n${pathBlock("/x/bin")}`);
    const zshrcBefore = readFileSync(join(sandbox.home, ".zshrc"), "utf8");

    const result = await runUninstallInTerminal(sandbox, "remove forge614-atlas");

    expect(result.exitCode).toBe(130);
    expect(existsSync(join(sandbox.atlas, "bin", "forge614-atlas"))).toBe(true);
    expect(readFileSync(join(sandbox.home, ".zshrc"), "utf8")).toBe(zshrcBefore);
  });

  test("the exact call Engram makes (stdin, stdout and stderr ignored) succeeds with exit code 0", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);
    // El "binario instalado" es un lanzador que corre el código real de Atlas, para ejercitarlo tal como lo llama Engram.
    const launcher = join(sandbox.atlas, "bin", "forge614-atlas");
    writeFileSync(launcher, `#!/bin/sh\nexec bun ${entrypoint} "$@"\n`);
    chmodSync(launcher, 0o755);
    writeFileSync(join(sandbox.home, ".zshrc"), `export FOO=1\n${pathBlock(join(sandbox.atlas, "bin"))}`);

    const child = Bun.spawn([launcher, "uninstall", "--from", "forge614-engram", "--confirmed"], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      env: childEnv(sandbox),
    });
    const exitCode = await child.exited;

    expect(exitCode).toBe(0);
    expect(existsSync(sandbox.atlas)).toBe(false);
    expect(readFileSync(join(sandbox.home, ".zshrc"), "utf8")).toBe("export FOO=1\n");
  });
});
