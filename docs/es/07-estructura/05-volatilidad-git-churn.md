# 07.05 Volatilidad Histórica de Código (Churn Git UTF-8)

> **Documento de Arquitectura y Código — Ecosistema Forge614 Atlas**  
> **Alcance:** `src/modules/scoring/churn.ts` y `churn.test.ts`  
> **Traducción hermana:** [07.05 (EN) Git Churn Volatility (churn.ts and test)](../../en/07-structure/05-git-churn-volatility.md)

---

## 1. Justificación Arquitectónica

El "Churn" mide la frecuencia histórica de modificación de archivos en los commits de Git. Aquellos módulos que sufren modificaciones constantes representan áreas de alta volatilidad: concentración de bugs, cambios frecuentes de requerimientos o refactorizaciones continuas.

### Reglas Críticas del Algoritmo
1. **Preservación UTF-8 Estricta (`-c core.quotepath=false`):** Por defecto, Git escapa en notación octal entrecomillada (`"\303\261"`) cualquier ruta con caracteres no ASCII (acentos, eñes, espacios o caracteres internacionales en español). Al configurar `core.quotepath=false`, Git emite texto UTF-8 puro, asegurando que carpetas como `señales` o `administración` sean correctamente atribuidas.
2. **Formato Mínimo de Alto Rendimiento (`--format= --name-only`):** Suprime encabezados, hashes de commit, autores y mensajes, emitiendo únicamente la lista plana de archivos tocados para un procesamiento síncrono ultraveloz.
3. **Manejo Riguroso de Excepciones:** Si `git log` falla (por ejemplo, en un directorio que no es repositorio Git o en un repositorio sin ningún commit), lanza una excepción descriptiva que no oculta el fallo al consumidor.
4. **Frontera de Directorio (`modulePath + sep`):** Evita la colisión de prefijos entre módulos con nombres compartidos (`auth` vs `auth-legacy`).

### Analogía del Mundo Real
> Es como la bitácora de mantenimiento de los motores de un avión: un motor que ha tenido que ser reparado y ajustado 40 veces en los últimos tres meses requiere una inspección mucho más minuciosa antes del despegue que uno idéntico que no ha necesitado tocarse en un año.

---

## 2. Código Fuente Documentado: `src/modules/scoring/churn.ts`

```typescript
import { spawnSync } from "node:child_process";
import { join, sep } from "node:path";
import type { ModuleDescriptor } from "./discovery";

/**
 * Calcula la Volatilidad de Código (Code Churn) por módulo a partir del historial de Git.
 * 
 * Fundamento de Ingeniería de Software:
 * - El "Churn" mide la frecuencia histórica con la que los archivos de un módulo han sido
 *   modificados a lo largo de los commits del repositorio.
 * - Los módulos con alto churn son zonas de cambio constante: acumulan deuda técnica,
 *   nuevos requisitos, refactorizaciones y regresiones potenciales. Un módulo altamente
 *   volátil requiere mayor contextualización y escrutinio en el ecosistema Forge614.
 * 
 * Detalles técnicos cruciales de la invocación a Git:
 * 1. Bandera `-c core.quotepath=false`:
 *    Por defecto, Git escapa en notación octal con comillas (ej. `"\303\261"`) cualquier ruta
 *    que contenga caracteres no ASCII (tildes en español, eñes, espacios o símbolos UTF-8).
 *    Configurar `core.quotepath=false` en la invocación obliga a Git a emitir nombres de ruta
 *    en UTF-8 puro, evitando que carpetas como `señales` o `administración` sean ignoradas.
 * 2. Formato `--format= --name-only`:
 *    Suprime el autor, hash y mensaje de commit (`--format=`), emitiendo únicamente los nombres
 *    de los archivos modificados línea por línea en la salida estándar (`stdout`).
 * 3. Manejo de Errores:
 *    Si `repoRoot` no es un repositorio de Git, o si es un repositorio recién inicializado sin commits
 *    (`HEAD` huérfano), Git retorna código de salida distinto de cero (`status !== 0`). En tal caso,
 *    la función lanza una excepción descriptiva para que el consumidor decida la estrategia de rescate.
 * 4. Atribución estricta con frontera de ruta (`modulePath + sep`):
 *    Garantiza que una ruta como `auth-service/index.ts` no incremente por error el churn de `auth`.
 * 
 * @param repoRoot - Ruta absoluta del directorio raíz del repositorio Git
 * @param modules - Lista de descriptores de módulos descubiertos
 * @returns Diccionario `Map<string, number>` asociando el nombre de cada módulo con su churn total
 * @throws Error si la ejecución de `git log` falla
 */
export function computeChurn(repoRoot: string, modules: ModuleDescriptor[]): Map<string, number> {
  // 1. Ejecución síncrona del comando de bajo nivel git log
  const result = spawnSync("git", ["-c", "core.quotepath=false", "log", "--format=", "--name-only"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  // 2. Validación del código de salida de Git
  if (result.status !== 0) {
    throw new Error(`git log failed in ${repoRoot}: ${result.stderr}`);
  }

  // 3. Inicializar el mapa de conteo con 0 para todos los módulos conocidos
  const churn = new Map(modules.map(module => [module.name, 0]));

  // 4. Dividir la salida estándar por saltos de línea, eliminar espacios y descartar líneas vacías
  const touchedFiles = result.stdout
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  // 5. Mapear cada archivo modificado en el historial hacia su módulo correspondiente
  for (const relativeFile of touchedFiles) {
    // Reconstruir la ruta absoluta en el sistema de archivos local
    const absolutePath = join(repoRoot, relativeFile);

    // Encontrar el módulo al que pertenece el archivo modificado
    const matchedModule = modules.find(module => {
      const modulePath = module.path;
      // Comprobar coincidencia exacta de carpeta o prefijo con separador de ruta para evitar colisiones
      return absolutePath === modulePath || absolutePath.startsWith(modulePath + sep);
    });

    // 6. Si el archivo pertenece a un módulo reconocido, incrementar su contador de churn
    if (matchedModule) {
      churn.set(matchedModule.name, (churn.get(matchedModule.name) ?? 0) + 1);
    }
  }

  return churn;
}
```

---

## 3. Pruebas Automatizadas: `src/modules/scoring/churn.test.ts`

```typescript
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
```
