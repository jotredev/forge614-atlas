import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeChurn } from "./churn";
import type { ModuleDescriptor } from "./discovery";

/**
 * Función auxiliar para ejecutar comandos git de forma síncrona en el fixture temporal.
 */
function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

describe("computeChurn", () => {
  test("counts changed-file entries per module across commit history", () => {
    // Escenario: Se inicializa un repo Git real y se simula el flujo de commits.
    // auth/login.ts se modifica en 2 commits.
    // billing/charge.ts se modifica en 1 commit.
    const root = mkdtempSync(join(tmpdir(), "atlas-churn-"));
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "Test"]);

    const authPath = join(root, "auth");
    const billingPath = join(root, "billing");
    mkdirSync(authPath, { recursive: true });
    mkdirSync(billingPath, { recursive: true });
    const authFile = join(authPath, "login.ts");
    const billingFile = join(billingPath, "charge.ts");

    // Commit 1: Crear login.ts en 'auth'
    writeFileSync(authFile, "export const login = () => true;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "add login"]);

    // Commit 2: Modificar login.ts en 'auth' (segundo cambio para 'auth')
    writeFileSync(authFile, "export const login = () => false;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "flip login"]);

    // Commit 3: Crear charge.ts en 'billing' (primer cambio para 'billing')
    writeFileSync(billingFile, "export const charge = () => true;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "add charge"]);

    const modules: ModuleDescriptor[] = [
      { name: "auth", path: authPath, files: [authFile] },
      { name: "billing", path: billingPath, files: [billingFile] },
    ];

    const result = computeChurn(root, modules);

    // Churn esperado: auth = 2 cambios históricos, billing = 1 cambio histórico
    expect(result.get("auth")).toBe(2);
    expect(result.get("billing")).toBe(1);

    rmSync(root, { recursive: true, force: true });
  });

  test("correctly attributes files to modules with prefix-overlapping names", () => {
    // Escenario de colisión de prefijo en Git: 'auth' vs 'auth-legacy'.
    // Cada módulo recibe 1 commit de forma aislada.
    const root = mkdtempSync(join(tmpdir(), "atlas-churn-prefix-"));
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "Test"]);

    const authPath = join(root, "auth");
    const authLegacyPath = join(root, "auth-legacy");
    mkdirSync(authPath, { recursive: true });
    mkdirSync(authLegacyPath, { recursive: true });
    const authFile = join(authPath, "login.ts");
    const authLegacyFile = join(authLegacyPath, "old-login.ts");

    writeFileSync(authFile, "export const login = () => true;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "add login"]);

    writeFileSync(authLegacyFile, "export const oldLogin = () => true;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "add old login"]);

    const modules: ModuleDescriptor[] = [
      { name: "auth", path: authPath, files: [authFile] },
      { name: "auth-legacy", path: authLegacyPath, files: [authLegacyFile] },
    ];

    const result = computeChurn(root, modules);

    // La regla `modulePath + sep` garantiza que 'auth-legacy' no aumente el churn de 'auth'
    expect(result.get("auth")).toBe(1);
    expect(result.get("auth-legacy")).toBe(1);

    rmSync(root, { recursive: true, force: true });
  });

  test("correctly attributes churn for modules with non-ASCII names", () => {
    // Escenario UTF-8 crítico: Módulo llamado 'señales' con letra 'ñ'.
    // Gracias al argumento `git -c core.quotepath=false`, Git no escapa en octal ("\303\261")
    // y Atlas puede atribuir el archivo sin pérdida de caracteres.
    const root = mkdtempSync(join(tmpdir(), "atlas-churn-nonascii-"));
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "Test"]);

    const signalesPath = join(root, "señales");
    mkdirSync(signalesPath, { recursive: true });
    const signalesFile = join(signalesPath, "procesador.ts");

    writeFileSync(signalesFile, "export const procesar = () => true;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "add señales"]);

    const modules: ModuleDescriptor[] = [{ name: "señales", path: signalesPath, files: [signalesFile] }];

    const result = computeChurn(root, modules);

    expect(result.get("señales")).toBe(1);

    rmSync(root, { recursive: true, force: true });
  });
});
