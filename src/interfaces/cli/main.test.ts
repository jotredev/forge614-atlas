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

test("an unknown command still returns the structured UNKNOWN_COMMAND error", async () => {
  const child = Bun.spawn(["bun", entrypoint, "--bogus"], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  const payload = JSON.parse(stdout) as { status: string; error: { code: string } };
  expect(exitCode).toBe(1);
  expect(payload.status).toBe("error");
  expect(payload.error.code).toBe("UNKNOWN_COMMAND");
});
