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

async function runMain(
  args: string[],
  env: Record<string, string | undefined> = process.env,
  cwd?: string,
): Promise<{ exitCode: number; stdout: string }> {
  const child = Bun.spawn(["bun", entrypoint, ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", env, cwd });
  const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  return { exitCode, stdout };
}

test("--version and -v print the product name and the package version, and exit 0", async () => {
  for (const flag of ["--version", "-v"]) {
    const { exitCode, stdout } = await runMain([flag]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`forge614-atlas ${version}\n`);
  }
});

test("the printed version is exactly forge614-atlas 1.0.0 while package.json says 1.0.0", async () => {
  expect(version).toBe("1.0.0");
  const { stdout } = await runMain(["--version"]);
  expect(stdout.trim()).toBe("forge614-atlas 1.0.0");
});

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

test("update with an invalid FORGE614_HOME answers INVALID_FORGE614_HOME without downloading anything", async () => {
  const { exitCode, stdout } = await runMain(["update"], { ...process.env, FORGE614_HOME: "" });
  expect(exitCode).toBe(1);
  expect(JSON.parse(stdout)).toEqual({
    schemaVersion: 1,
    status: "error",
    error: { code: "INVALID_FORGE614_HOME", message: "FORGE614_HOME must be a non-empty absolute path." },
  });
});

test("update refuses extra arguments before touching the network", async () => {
  const { exitCode, stdout } = await runMain(["update", "--force"]);
  expect(exitCode).toBe(1);
  expect(JSON.parse(stdout)).toEqual({
    schemaVersion: 1,
    status: "error",
    error: { code: "INVALID_ARGUMENT", message: "forge614-atlas update takes no arguments." },
  });
});

test("an unknown command still returns the structured UNKNOWN_COMMAND error", async () => {
  const { exitCode, stdout } = await runMain(["--bogus"]);
  const payload = JSON.parse(stdout) as { status: string; error: { code: string } };
  expect(exitCode).toBe(1);
  expect(payload.status).toBe("error");
  expect(payload.error.code).toBe("UNKNOWN_COMMAND");
});
