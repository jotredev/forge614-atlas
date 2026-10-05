/**
 * Pruebas del punto de entrada de la línea de comandos de Atlas (`src/interfaces/cli/main.ts`), que corre en un
 * proceso hijo (programa que lanza la prueba): `--version`, `--help` en cualquier posición, `FORGE614_HOME` inválida en
 * `init` y `update`, argumentos sobrantes en `update` y el error `UNKNOWN_COMMAND`.
 */
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { version } from "../../../package.json";

const entrypoint = resolve(import.meta.dir, "main.ts");

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * Llama a `main.ts` en un proceso hijo para probar la interfaz real con la línea de comandos.
 * @param args Argumentos que se pasan al proceso (después del nombre del archivo).
 * @param env Variables de entorno (se hereda `process.env` por omisión).
 * @param cwd Directorio de trabajo del proceso.
 * @returns El código de salida y lo impreso en la salida estándar.
 */
async function runMain(
  args: string[],
  env: Record<string, string | undefined> = process.env,
  cwd?: string,
): Promise<{ exitCode: number; stdout: string }> {
  const child = Bun.spawn(["bun", entrypoint, ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", env, cwd });
  const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  return { exitCode, stdout };
}

/** Comprueba que `--version` y `-v` imprimen exactamente `forge614-atlas <versión de package.json>` y salen con 0. */
test("--version and -v print the product name and the package version, and exit 0", async () => {
  for (const flag of ["--version", "-v"]) {
    const { exitCode, stdout } = await runMain([flag]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`forge614-atlas ${version}\n`);
  }
});

/** Comprueba que `package.json` dice `1.1.1` y que `--version` imprime exactamente `forge614-atlas 1.1.1`; hay que actualizarla en cada cambio de versión. */
test("the printed version is exactly forge614-atlas 1.1.1 while package.json says 1.1.1", async () => {
  expect(version).toBe("1.1.1");
  const { stdout } = await runMain(["--version"]);
  expect(stdout.trim()).toBe("forge614-atlas 1.1.1");
});

/** Comprueba que `--help` y `-h` salen con 0 e imprimen cada comando con sus opciones, `--version, -v`, `--help, -h` y `FORGE614_HOME`. */
test("--help and -h exit 0, name every command, the aliases and FORGE614_HOME", async () => {
  for (const flag of ["--help", "-h"]) {
    const { exitCode, stdout } = await runMain([flag]);
    expect(exitCode).toBe(0);
    for (const expected of [
      "init [--engine <id>] [--force]",
      "update",
      "uninstall [--from forge614-engram] [--confirmed]",
      "--version, -v",
      "--help, -h",
      "FORGE614_HOME",
    ]) {
      expect(stdout).toContain(expected);
    }
  }
});

/** Comprueba que `--help` y `-h`, también tras `init` y sus opciones o junto a un argumento desconocido, imprimen la ayuda y salen con 0 sin crear nada en `FORGE614_HOME` ni en la carpeta del proyecto. */
test("--help and -h in any position print the help and exit 0 without running anything: init creates nothing", async () => {
  const root = mkdtempSync(join(tmpdir(), "atlas-help-"));
  tempDirs.push(root);
  const forgeHome = join(root, "forge614");
  const project = join(root, "project");
  mkdirSync(forgeHome);
  mkdirSync(project);
  const env = { PATH: process.env.PATH ?? "", HOME: root, FORGE614_HOME: forgeHome };

  for (const args of [
    ["init", "--help"],
    ["init", "-h"],
    ["init", "--engine", "claude-code", "--help"],
    ["init", "--force", "-h"],
    ["--bogus", "--help"],
  ]) {
    const { exitCode, stdout } = await runMain(args, env, project);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("forge614-atlas uninstall [--from forge614-engram] [--confirmed]");
  }
  // init de verdad abre Engram: con la ayuda no debe aparecer ninguna base ni sesión.
  expect(readdirSync(forgeHome)).toEqual([]);
  expect(readdirSync(project)).toEqual([]);
});

/** Comprueba que `update --help`, `uninstall --help` y `uninstall --confirmed -h` imprimen la ayuda, salen con 0 y dejan el binario de Atlas en su lugar. */
test("update --help and uninstall --help print the help, exit 0 and delete nothing", async () => {
  const root = mkdtempSync(join(tmpdir(), "atlas-help-"));
  tempDirs.push(root);
  const forgeHome = join(root, "forge614");
  mkdirSync(join(forgeHome, "atlas", "bin"), { recursive: true });
  writeFileSync(join(forgeHome, "atlas", "bin", "forge614-atlas"), "fake binary\n");
  const env = { PATH: process.env.PATH ?? "", HOME: root, FORGE614_HOME: forgeHome };

  for (const args of [["update", "--help"], ["uninstall", "--help"], ["uninstall", "--confirmed", "-h"]]) {
    const { exitCode, stdout } = await runMain(args, env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("forge614-atlas update");
  }
  expect(existsSync(join(forgeHome, "atlas", "bin", "forge614-atlas"))).toBe(true);
});

/** Comprueba que `init` con `FORGE614_HOME` vacía o relativa sale con 1 y responde exactamente `INVALID_FORGE614_HOME` en JSON. */
test("init with an invalid FORGE614_HOME answers INVALID_FORGE614_HOME before opening Engram", async () => {
  for (const invalid of ["", "relative/forge614"]) {
    const { exitCode, stdout } = await runMain(["init"], { ...process.env, FORGE614_HOME: invalid });
    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout)).toEqual({
      schemaVersion: 1,
      status: "error",
      error: { code: "INVALID_FORGE614_HOME", message: "FORGE614_HOME must be a non-empty absolute path." },
    });
  }
});

/** Comprueba que `update` con `FORGE614_HOME` vacía (definida pero sin valor) sale con 1 y responde `INVALID_FORGE614_HOME`. */
test("update with an invalid FORGE614_HOME answers INVALID_FORGE614_HOME without downloading anything", async () => {
  const { exitCode, stdout } = await runMain(["update"], { ...process.env, FORGE614_HOME: "" });
  expect(exitCode).toBe(1);
  expect(JSON.parse(stdout)).toEqual({
    schemaVersion: 1,
    status: "error",
    error: { code: "INVALID_FORGE614_HOME", message: "FORGE614_HOME must be a non-empty absolute path." },
  });
});

/** Comprueba que `update --force` sale con 1 y responde `INVALID_ARGUMENT` (`update` no acepta argumentos). */
test("update refuses extra arguments before touching the network", async () => {
  const { exitCode, stdout } = await runMain(["update", "--force"]);
  expect(exitCode).toBe(1);
  expect(JSON.parse(stdout)).toEqual({
    schemaVersion: 1,
    status: "error",
    error: { code: "INVALID_ARGUMENT", message: "forge614-atlas update takes no arguments." },
  });
});

/** Comprueba que un comando desconocido (`--bogus`) sale con 1 y responde `status: "error"` con el código `UNKNOWN_COMMAND`. */
test("an unknown command still returns the structured UNKNOWN_COMMAND error", async () => {
  const { exitCode, stdout } = await runMain(["--bogus"]);
  const payload = JSON.parse(stdout) as { status: string; error: { code: string } };
  expect(exitCode).toBe(1);
  expect(payload.status).toBe("error");
  expect(payload.error.code).toBe("UNKNOWN_COMMAND");
});
