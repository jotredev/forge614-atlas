/**
 * Prueba `forge614-atlas uninstall` ejecutándolo en procesos hijos (programas que lanza la prueba) con carpetas
 * temporales: qué borra y qué conserva (perfiles de shell, Engram y Workers), los errores ante rutas inseguras,
 * perfiles imposibles de reescribir, argumentos y `FORGE614_HOME` inválidos, y la confirmación antes de borrar Atlas.
 */
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
  /** Carpeta personal falsa donde se crean los perfiles de shell (archivos de inicio de la terminal). */
  home: string;
  /** Carpeta Forge614 falsa que separa la prueba de una instalación real. */
  forgeHome: string;
  /** Ruta de la carpeta de Atlas dentro de la instalación falsa. */
  atlas: string;
}

/** Crea las carpetas temporales y las registra para borrarlas al terminar cada prueba.
 * @returns Rutas de la carpeta personal, la carpeta Forge614 y la carpeta prevista para Atlas.
 */
function makeSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "atlas-uninstall-"));
  tempDirs.push(root);
  const home = join(root, "home");
  const forgeHome = join(root, "forge614");
  mkdirSync(home);
  mkdirSync(forgeHome);
  return { home, forgeHome, atlas: join(forgeHome, "atlas") };
}

/** Una instalación FALSA de Atlas: su carpeta con un binario y otro archivo, más vecinos que NO deben tocarse.
 * @param sandbox Carpetas falsas donde se dejan Atlas, Engram y Workers para comprobar qué se borra.
 */
function installFakeAtlas(sandbox: Sandbox): void {
  mkdirSync(join(sandbox.atlas, "bin"), { recursive: true });
  writeFileSync(join(sandbox.atlas, "bin", "forge614-atlas"), "fake binary\n");
  writeFileSync(join(sandbox.atlas, "notes.txt"), "inside atlas\n");
  mkdirSync(join(sandbox.forgeHome, "engram"), { recursive: true });
  writeFileSync(join(sandbox.forgeHome, "engram", "keep.txt"), "engram data\n");
  mkdirSync(join(sandbox.forgeHome, "workers"), { recursive: true });
  writeFileSync(join(sandbox.forgeHome, "workers", "keep.txt"), "workers data\n");
}

/** Forma el bloque de PATH (lista de carpetas donde la terminal busca programas) que escribe el instalador de Atlas.
 * @param binDir Carpeta falsa que se agrega a la búsqueda de programas.
 * @returns Bloque con marcas de inicio y fin y la orden de exportación.
 */
function pathBlock(binDir: string): string {
  return `${START}\ncase ":$PATH:" in\n  *:${binDir}:*) ;;\n  *) export PATH=${binDir}:"$PATH" ;;\nesac\n${END}\n`;
}

/** Aísla al proceso hijo con la carpeta personal falsa y, salvo petición contraria, la carpeta Forge614 falsa.
 * @param sandbox Carpetas temporales de esta prueba.
 * @param forgeHome Valor de `FORGE614_HOME`; si se omite, usa la carpeta falsa de `sandbox`.
 * @returns Variables de entorno que recibirá el comando de prueba.
 */
function childEnv(sandbox: Sandbox, forgeHome: string | undefined = sandbox.forgeHome): Record<string, string> {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: sandbox.home };
  if (forgeHome !== undefined) env.FORGE614_HOME = forgeHome;
  return env;
}

/** Corre `main.ts uninstall ...` en un proceso hijo, sin terminal en la entrada.
 * @param sandbox Carpetas falsas que recibe el proceso.
 * @param args Opciones de `uninstall`, como `--confirmed` o `--from`.
 * @param forgeHome Valor opcional de `FORGE614_HOME` para comprobar rutas inválidas.
 * @returns Código de salida y respuesta impresa en la salida estándar.
 */
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

/** Corre `uninstall` con terminal y escribe la respuesta cuando aparece la pregunta (espera hasta 5 s; si no aparece, la escribe igual).
 * @param sandbox Carpetas falsas que recibe el proceso.
 * @param answer Texto que se escribe como confirmación.
 * @returns Código de salida y texto mostrado por la terminal.
 */
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

/** Lee solo el código de error de la respuesta JSON (texto con campos) del comando.
 * @param stdout Respuesta impresa por `uninstall`.
 * @returns Valor de `error.code` para compararlo con el código esperado.
 * @throws SyntaxError si la respuesta no es JSON válido; TypeError si falta el objeto `error`.
 */
function errorCode(stdout: string): string {
  return (JSON.parse(stdout) as { error: { code: string } }).error.code;
}

/** Agrupa las pruebas de `forge614-atlas uninstall`: qué borra y qué conserva, cuándo se niega (rutas inseguras, perfiles que no se pueden reescribir, argumentos o `FORGE614_HOME` inválidos) y cómo se confirma. */
describe("forge614-atlas uninstall", () => {
  /** Comprueba que borra Atlas y solo su bloque de `.zshrc`, conservando el resto de los perfiles y los datos de Engram y Workers. */
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

  /** Comprueba que limpia los bloques de `.bash_profile` y `.bashrc` en ese orden y conserva sus otras líneas. */
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

  /** Comprueba que una segunda desinstalación responde `removed: false` y deja intacto el perfil ya limpio. */
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

  /** Comprueba que un enlace simbólico (acceso a otra ruta) en lugar de la carpeta Atlas se rechaza sin tocar el destino ni `.zshrc`. */
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

  /** Comprueba que una ruta Atlas ocupada por un archivo normal recibe `UNINSTALL_UNSAFE` y conserva sus bytes. */
  test("an atlas path that is a plain file is refused with UNINSTALL_UNSAFE", async () => {
    const sandbox = makeSandbox();
    writeFileSync(sandbox.atlas, "not a folder\n");

    const result = await runUninstall(sandbox, ["--confirmed"]);

    expect(result.exitCode).toBe(1);
    expect(errorCode(result.stdout)).toBe("UNINSTALL_UNSAFE");
    expect(readFileSync(sandbox.atlas, "utf8")).toBe("not a folder\n");
  });

  /** Comprueba que sin `--confirmed` ni terminal se exige confirmación y permanecen el binario y `.zshrc`. */
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

  /** Comprueba que `--from otra-cosa` se rechaza con `INVALID_ARGUMENT` antes de borrar el binario. */
  test("--from accepts only forge614-engram: any other value is INVALID_ARGUMENT and nothing is deleted", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);

    const result = await runUninstall(sandbox, ["--from", "otra-cosa", "--confirmed"]);

    expect(result.exitCode).toBe(1);
    expect(errorCode(result.stdout)).toBe("INVALID_ARGUMENT");
    expect(existsSync(join(sandbox.atlas, "bin", "forge614-atlas"))).toBe(true);
  });

  /** Comprueba que `--from` sin valor y una opción desconocida producen `INVALID_ARGUMENT` y conservan Atlas. */
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

  /** Comprueba que el archivo propio de fish (otra terminal; el instalador le crea su propio archivo) se borra si su único contenido era el bloque de Atlas. */
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

  /** Comprueba que el archivo de fish conserva la orden del editor y pierde solo el bloque de Atlas. */
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

  /** Comprueba que un perfil enlazado se rechaza con `PATH_REMOVE_FAILED` sin cambiar su destino ni borrar Atlas. */
  test("a terminal profile that is a symbolic link is PATH_REMOVE_FAILED and nothing is deleted", async () => {
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

  // Quitar el permiso de escritura solo frena a quien no es root; con root las dos pruebas siguientes se saltan (`skipIf`) porque con root el permiso no impide escribir ni borrar y no ocurriría el fallo que esperan.
  const asRoot = process.getuid?.() === 0;

  /** Comprueba que, sin permiso para crear el temporal del perfil, `PATH_REMOVE_FAILED` conserva perfil y Atlas. */
  test.skipIf(asRoot)("a terminal profile that cannot be rewritten is PATH_REMOVE_FAILED and the Atlas folder is kept", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);
    const profile = join(sandbox.home, ".zshrc");
    const original = `export FOO=1\n${pathBlock("/x/bin")}`;
    writeFileSync(profile, original);
    // El perfil se lee bien, pero la carpeta personal no deja crear el archivo temporal con el que se reescribe.
    chmodSync(sandbox.home, 0o555);

    let result: { exitCode: number; stdout: string };
    try {
      result = await runUninstall(sandbox, ["--confirmed"]);
    } finally {
      chmodSync(sandbox.home, 0o755);
    }

    expect(result.exitCode).toBe(1);
    expect(errorCode(result.stdout)).toBe("PATH_REMOVE_FAILED");
    expect(result.stdout).not.toContain("uninstalled");
    expect(readFileSync(profile, "utf8")).toBe(original);
    expect(existsSync(join(sandbox.atlas, "bin", "forge614-atlas"))).toBe(true);
  });

  /** Comprueba que si no se puede borrar Atlas, sale `UNINSTALL_FAILED` tras limpiar el perfil y sin anunciar éxito. */
  test.skipIf(asRoot)("an Atlas folder that cannot be deleted is UNINSTALL_FAILED, exit 1, and never prints uninstalled", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);
    const profile = join(sandbox.home, ".zshrc");
    writeFileSync(profile, `export FOO=1\n${pathBlock("/x/bin")}`);
    // Una subcarpeta sin permiso de escritura impide borrar lo que lleva dentro.
    const locked = join(sandbox.atlas, "locked");
    mkdirSync(locked);
    writeFileSync(join(locked, "stuck.txt"), "stuck\n");
    chmodSync(locked, 0o555);

    let result: { exitCode: number; stdout: string };
    try {
      result = await runUninstall(sandbox, ["--confirmed"]);
    } finally {
      chmodSync(locked, 0o755);
    }

    expect(result.exitCode).toBe(1);
    expect(result.stdout).not.toContain("uninstalled");
    const payload = JSON.parse(result.stdout) as { schemaVersion: number; status: string; error: { code: string; message: string } };
    expect(payload.schemaVersion).toBe(1);
    expect(payload.status).toBe("error");
    expect(payload.error.code).toBe("UNINSTALL_FAILED");
    expect(payload.error.message).toContain("PATH blocks were already removed");
    // Los bloques de PATH ya se quitaron antes de intentar borrar la carpeta.
    expect(readFileSync(profile, "utf8")).toBe("export FOO=1\n");
  });

  /** Comprueba que una marca de inicio sin cierre en `.bashrc` impide cambiar incluso el `.zshrc` válido y conserva Atlas. */
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

  /** Comprueba que valores vacío y relativo de `FORGE614_HOME` devuelven `INVALID_FORGE614_HOME` y conservan el binario. */
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

  /** Comprueba que la frase exacta de confirmación en la terminal permite borrar la carpeta de Atlas. */
  test("with a terminal, typing exactly REMOVE FORGE614-ATLAS removes it", async () => {
    const sandbox = makeSandbox();
    installFakeAtlas(sandbox);

    const result = await runUninstallInTerminal(sandbox, "REMOVE FORGE614-ATLAS");

    expect(result.exitCode).toBe(0);
    expect(existsSync(sandbox.atlas)).toBe(false);
  });

  /** Comprueba que una frase distinta cancela con código 130 y conserva el binario y `.zshrc`. */
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

  /** Comprueba la llamada exacta de Engram (`--from forge614-engram`, con la entrada, la salida y los errores ignorados): sale 0, borra Atlas y limpia `.zshrc`. */
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
