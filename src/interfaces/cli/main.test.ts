import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { version } from "../../../package.json";

const entrypoint = resolve(import.meta.dir, "main.ts");

test("--version prints the package version and exits 0", async () => {
  const child = Bun.spawn(["bun", entrypoint, "--version"], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  expect(exitCode).toBe(0);
  expect(stdout.trim()).toBe(version);
});

test("init with an invalid FORGE614_HOME answers INVALID_FORGE614_HOME before opening Engram", async () => {
  for (const invalid of ["", "relative/forge614"]) {
    const child = Bun.spawn(["bun", entrypoint, "init"], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, FORGE614_HOME: invalid },
    });
    const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout)).toEqual({
      schemaVersion: 1,
      status: "error",
      error: { code: "INVALID_FORGE614_HOME", message: "FORGE614_HOME must be a non-empty absolute path." },
    });
  }
});

test("an unknown command still returns the structured UNKNOWN_COMMAND error", async () => {
  const child = Bun.spawn(["bun", entrypoint, "--bogus"], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  const payload = JSON.parse(stdout) as { status: string; error: { code: string } };
  expect(exitCode).toBe(1);
  expect(payload.status).toBe("error");
  expect(payload.error.code).toBe("UNKNOWN_COMMAND");
});
