import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveSessionId, deriveForcedSessionId } from "./session-id";

/**
 * Función auxiliar para ejecutar comandos git de forma síncrona en el fixture temporal
 * (mismo patrón que usa `src/modules/scoring/churn.test.ts`).
 */
function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

describe("deriveSessionId", () => {
  test("is deterministic for the same directory", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-sessionid-"));
    expect(deriveSessionId(root)).toBe(deriveSessionId(root));
    rmSync(root, { recursive: true, force: true });
  });

  test("differs between two different directories", () => {
    const rootA = mkdtempSync(join(tmpdir(), "atlas-sessionid-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "atlas-sessionid-b-"));
    expect(deriveSessionId(rootA)).not.toBe(deriveSessionId(rootB));
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  });

  test("starts with the atlas: prefix and is a valid Engram sessionId", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-sessionid-prefix-"));
    const id = deriveSessionId(root);
    expect(id.startsWith("atlas:")).toBe(true);
    expect(id.length).toBeLessThanOrEqual(200);
    expect(id.trim()).toBe(id);
    rmSync(root, { recursive: true, force: true });
  });

  test("resolves to the same id from the repo root and from a subdirectory of a real git repo", () => {
    // Escenario crítico del hallazgo del review: Engram deriva su projectId con
    // `git rev-parse --path-format=absolute --git-common-dir`, que devuelve la
    // MISMA ruta sin importar la subcarpeta desde la que se invoque. Si Atlas
    // hashea la ruta literal en vez de la identidad del repo, la raíz y una
    // subcarpeta del mismo repo producen sessionIds distintos — rompiendo
    // silenciosamente la detección de "este repo ya se analizó".
    const root = mkdtempSync(join(tmpdir(), "atlas-sessionid-gitrepo-"));
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "Test"]);

    const subdir = join(root, "src", "auth");
    mkdirSync(subdir, { recursive: true });
    git(root, ["commit", "-q", "--allow-empty", "-m", "initial commit"]);

    expect(deriveSessionId(root)).toBe(deriveSessionId(subdir));

    rmSync(root, { recursive: true, force: true });
  });
});

describe("deriveForcedSessionId", () => {
  test("differs from the deterministic id but keeps it as a prefix", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-sessionid-forced-"));
    const base = deriveSessionId(root);
    const forced = deriveForcedSessionId(root);
    expect(forced).not.toBe(base);
    expect(forced.startsWith(base)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
});
