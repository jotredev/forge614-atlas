/**
 * Pruebas para `computeChurn`.
 * Comprueba que el churn (cuántos cambios de archivos hubo por módulo en el historial de git) se cuente bien: un archivo
 * cambiado en 2 commits suma 2, las carpetas con prefijo parecido no se mezclan y un módulo con ñ se cuenta.
 * Importa porque un prefijo compartido (`auth` y `auth-legacy`) o un nombre con ñ podrían sumar el churn al módulo equivocado o perderlo.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeChurn } from "./churn";
import type { ModuleDescriptor } from "./discovery";

/**
 * Función auxiliar que ejecuta un comando git (esperando a que termine) dentro de la carpeta temporal de la prueba
 * (el repositorio de ejemplo).
 * @param cwd Ruta del directorio donde se ejecuta el comando.
 * @param args Lista de argumentos para el comando git.
 * @throws Error con el mensaje "git <argumentos> failed: <salida de error>" si git termina con código distinto de cero o no se puede ejecutar.
 */
function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

/**
 * Comprueba `computeChurn`, que cuenta los cambios de archivos por módulo en el historial de git.
 * Importa para verificar que cada archivo del historial se cuente en su módulo exacto, incluso con prefijos parecidos y nombres con ñ.
 */
describe("computeChurn", () => {
  /**
   * Comprueba que `auth` (un archivo cambiado en 2 commits) cuente 2 y `billing` (1 commit) cuente 1.
   * Importa porque es el caso base del conteo: un cambio por cada commit en que aparece el archivo.
   */
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

  /**
   * Comprueba que `auth` y `auth-legacy` (un commit cada uno) cuenten 1 cada uno, sin mezclarse.
   * Importa porque `auth-legacy/old-login.ts` empieza con el texto `auth`, y un cruce sumaría el cambio al módulo equivocado.
   */
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

  /**
   * Comprueba que el módulo `señales` (con ñ) cuente 1 cambio. Sin la opción `core.quotepath=false` git escribiría la ruta
   * con códigos numéricos entre comillas (octal, como `"\303\261"` para la ñ) y no coincidiría con la carpeta.
   * Importa para que las carpetas con caracteres fuera de ASCII (como la ñ o las vocales con tilde) no se queden sin contar.
   */
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

  /**
   * Comprueba que con una carpeta mixta (`src` con las subcarpetas `src/auth` y `src/billing`) cada archivo cambiado se
   * cuente en el módulo más específico: `src` = 1, `src/auth` = 2, `src/billing` = 1.
   * Importa porque `discoverModules` entrega los módulos ordenados por nombre (`src` antes que `src/auth`), y si el archivo
   * de `src/auth` se contara en `src`, el módulo `src/auth` quedaría siempre en 0.
   */
  test("attributes each changed file to the most specific module in a mixed folder", () => {
    // Escenario: carpeta mixta; el commit 1 crea los tres archivos y el commit 2 cambia solo `src/auth/login.ts`.
    const root = mkdtempSync(join(tmpdir(), "atlas-churn-mixed-"));
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "Test"]);

    const srcPath = join(root, "src");
    const authPath = join(srcPath, "auth");
    const billingPath = join(srcPath, "billing");
    mkdirSync(authPath, { recursive: true });
    mkdirSync(billingPath, { recursive: true });
    const srcFile = join(srcPath, "index.ts");
    const authFile = join(authPath, "login.ts");
    const billingFile = join(billingPath, "invoice.ts");

    // Commit 1: crear los tres archivos (un cambio para cada módulo)
    writeFileSync(srcFile, "export const version = 1;");
    writeFileSync(authFile, "export const login = () => true;");
    writeFileSync(billingFile, "export const invoice = () => true;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "add src files"]);

    // Commit 2: cambiar solo src/auth/login.ts (segundo cambio para `src/auth`)
    writeFileSync(authFile, "export const login = () => false;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "flip login"]);

    const modules: ModuleDescriptor[] = [
      { name: "src", path: srcPath, files: [srcFile] },
      { name: "src/auth", path: authPath, files: [authFile] },
      { name: "src/billing", path: billingPath, files: [billingFile] },
    ];

    const result = computeChurn(root, modules);

    // Churn esperado: src = 1 (solo index.ts), src/auth = 2, src/billing = 1
    expect(result.get("src")).toBe(1);
    expect(result.get("src/auth")).toBe(2);
    expect(result.get("src/billing")).toBe(1);

    rmSync(root, { recursive: true, force: true });
  });
});
