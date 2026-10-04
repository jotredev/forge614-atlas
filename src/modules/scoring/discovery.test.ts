/**
 * Pruebas para `discoverModules`.
 * Comprueba que el explorador de archivos identifique y agrupe correctamente los archivos fuente en módulos,
 * descartando directorios ignorados como node_modules y resolviendo carpetas anidadas hasta dos niveles (`src/auth`),
 * carpetas mixtas, orden alfabético y carpetas que empiezan con punto.
 * Importa porque de estos módulos sale el plan de análisis.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverModules } from "./discovery";

/**
 * Comprueba `discoverModules`, que agrupa los archivos .ts/.tsx/.js/.jsx en módulos por carpeta.
 * Importa para verificar que no se pierda ninguna carpeta con código y que se omitan las de la lista de exclusión y las que empiezan con punto.
 */
describe("discoverModules", () => {
  let root: string;

  /**
   * Antes de cada prueba, se construye un entorno de sistema de archivos efímero
   * en el directorio temporal del sistema operativo para garantizar aislamiento total.
   */
  beforeEach(() => {
    // 1. Crear directorio temporal único
    root = mkdtempSync(join(tmpdir(), "atlas-discovery-"));

    // 2. Crear módulo 'src/auth' con archivo de código TypeScript válido
    mkdirSync(join(root, "src", "auth"), { recursive: true });
    writeFileSync(join(root, "src", "auth", "login.ts"), "export const login = () => true;");

    // 3. Crear módulo 'src/styles' con solo un archivo CSS (no debe ser módulo de código)
    mkdirSync(join(root, "src", "styles"), { recursive: true });
    writeFileSync(join(root, "src", "styles", "index.css"), "body { margin: 0; }");

    // 4. Crear carpeta 'node_modules' (debe ser ignorada por lista negra)
    mkdirSync(join(root, "node_modules", "some-package"), { recursive: true });
    writeFileSync(join(root, "node_modules", "some-package", "index.js"), "module.exports = {};");
  });

  /**
   * Limpieza obligatoria post-prueba para no saturar el disco temporal.
   */
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * Comprueba que al escanear `src` salga un solo módulo, `auth`, con su archivo `login.ts`.
   * Importa como caso base de la detección.
   */
  test("finds top-level folders that contain source files", () => {
    // Escaneo dentro de 'src': debe encontrar 'auth' y listar 'login.ts'
    const modules = discoverModules(join(root, "src"));
    expect(modules).toHaveLength(1);
    expect(modules[0]?.name).toBe("auth");
    expect(modules[0]?.files).toEqual([join(root, "src", "auth", "login.ts")]);
  });

  /**
   * Comprueba que una carpeta con solo CSS (`styles`) no aparezca como módulo; solo cuentan .ts, .tsx, .js y .jsx.
   * Importa para no procesar como código de negocio carpetas de estilos o documentación.
   */
  test("excludes folders with no ts/tsx/js/jsx files", () => {
    // Escaneo dentro de 'src': 'styles' contiene solo CSS, por ende no califica
    const modules = discoverModules(join(root, "src"));
    const names = modules.map(module => module.name);
    expect(names).not.toContain("styles");
  });

  /**
   * Comprueba que, al escanear desde la raíz, ningún módulo se llame `node_modules`; el expect no detecta un módulo `node_modules/some-package` (compara nombres exactos).
   * Importa para evitar que el analizador evalúe código de terceros.
   */
  test("ignores node_modules even when scanning from the repo root", () => {
    // Escaneo desde la raíz: 'node_modules' está en la lista de exclusión y debe omitirse
    const modules = discoverModules(root);
    const names = modules.map(module => module.name);
    expect(names).not.toContain("node_modules");
  });

  /**
   * Comprueba que se ignoren las subcarpetas que comienzan con punto (como .cache).
   * Importa para excluir archivos generados o internos sin tener que listarlos individualmente.
   */
  test("excludes nested dot-directories from file scanning", () => {
    const srcPath = join(root, "src");
    // Crear una subcarpeta oculta '.cache' dentro de un módulo válido
    mkdirSync(join(srcPath, "auth", ".cache"), { recursive: true });
    writeFileSync(join(srcPath, "auth", ".cache", "generated.ts"), "export const x = 1;");

    const modules = discoverModules(srcPath);
    expect(modules).toHaveLength(1);
    expect(modules[0]?.name).toBe("auth");
    // El archivo dentro de '.cache' debe ser ignorado; solo debe figurar 'login.ts'
    expect(modules[0]?.files).toHaveLength(1);
    expect(modules[0]?.files).toEqual([join(srcPath, "auth", "login.ts")]);
  });

  /**
   * Comprueba que una carpeta que solo contiene subcarpetas (aquí `src`) no se vuelva un módulo y que el módulo `src/auth` se
   * llame con su ruta relativa a la raíz.
   * Importa para que un contenedor como `src` no se convierta en un solo módulo que junte a sus subcarpetas.
   */
  test("descends into a purely-nested container folder instead of collapsing it into one module", () => {
    // 'src' solo contiene subcarpetas (auth, styles) — no debe convertirse en un módulo único.
    // 'src/auth' debe ser su propio módulo, nombrado con la ruta relativa completa.
    const modules = discoverModules(root);
    const names = modules.map(module => module.name).sort();
    expect(names).toEqual(["src/auth"]);
    const authModule = modules.find(module => module.name === "src/auth");
    expect(authModule?.files).toEqual([join(root, "src", "auth", "login.ts")]);
  });

  /**
   * Comprueba que `src` (con `index.ts` suelto y las subcarpetas `auth` y `billing`) dé tres módulos: `src` (solo `index.ts`),
   * `src/auth` y `src/billing`.
   * Importa para que un `index.ts` suelto no esconda los módulos de sus subcarpetas.
   */
  test("splits a mixed folder (loose files + subfolders) into a loose-files module plus one module per subfolder", () => {
    const mixedRoot = mkdtempSync(join(tmpdir(), "atlas-discovery-mixed-"));

    // 'src' tiene un archivo suelto (index.ts) Y subcarpetas (auth, billing) con código propio.
    mkdirSync(join(mixedRoot, "src", "auth"), { recursive: true });
    writeFileSync(join(mixedRoot, "src", "index.ts"), "export * from './auth';");
    writeFileSync(join(mixedRoot, "src", "auth", "login.ts"), "export const login = () => true;");

    mkdirSync(join(mixedRoot, "src", "billing"), { recursive: true });
    writeFileSync(join(mixedRoot, "src", "billing", "invoice.ts"), "export const invoice = () => 1;");

    const modules = discoverModules(mixedRoot);
    const names = modules.map(module => module.name).sort();
    expect(names).toEqual(["src", "src/auth", "src/billing"]);

    const srcModule = modules.find(module => module.name === "src");
    expect(srcModule?.files).toEqual([join(mixedRoot, "src", "index.ts")]);

    const authModule = modules.find(module => module.name === "src/auth");
    expect(authModule?.files).toEqual([join(mixedRoot, "src", "auth", "login.ts")]);

    rmSync(mixedRoot, { recursive: true, force: true });
  });

  /**
   * Comprueba que una carpeta de primer nivel con código directo (`auth/login.ts`) dé el módulo `auth`.
   * Importa para no romper los proyectos sin carpeta `src`.
   */
  test("keeps flat top-level modules working exactly as before (no regression)", () => {
    const flatRoot = mkdtempSync(join(tmpdir(), "atlas-discovery-flat-"));

    mkdirSync(join(flatRoot, "auth"), { recursive: true });
    writeFileSync(join(flatRoot, "auth", "login.ts"), "export const login = () => true;");

    const modules = discoverModules(flatRoot);
    expect(modules.map(module => module.name)).toEqual(["auth"]);

    rmSync(flatRoot, { recursive: true, force: true });
  });

  /**
   * Comprueba que los módulos (`apple`, `mango`, `zebra`) y los archivos de `apple` salgan en orden alfabético aunque se hayan
   * creado en otro orden.
   * Importa para que el plan de corrida no cambie según el orden en que el disco devuelve las carpetas.
   */
  test("returns modules and files in stable, alphabetically sorted order regardless of creation order", () => {
    const stableRoot = mkdtempSync(join(tmpdir(), "atlas-discovery-stable-"));

    // Se crean directorios y archivos intencionalmente en orden inverso
    // para demostrar que la ordenación es estricta por algoritmo (localeCompare)
    // y no dependiente de la asignación de inodos del sistema de archivos.
    mkdirSync(join(stableRoot, "zebra"), { recursive: true });
    writeFileSync(join(stableRoot, "zebra", "z.ts"), "export const z = 1;");

    mkdirSync(join(stableRoot, "mango"), { recursive: true });
    writeFileSync(join(stableRoot, "mango", "m.ts"), "export const m = 1;");

    mkdirSync(join(stableRoot, "apple"), { recursive: true });
    writeFileSync(join(stableRoot, "apple", "z-file.ts"), "export const z = 1;");
    writeFileSync(join(stableRoot, "apple", "a-file.ts"), "export const a = 1;");
    writeFileSync(join(stableRoot, "apple", "m-file.ts"), "export const m = 1;");

    const modules = discoverModules(stableRoot);

    // Los módulos deben presentarse ordenados: apple -> mango -> zebra
    expect(modules.map(module => module.name)).toEqual(["apple", "mango", "zebra"]);

    // Los archivos dentro de 'apple' deben figurar ordenados: a-file -> m-file -> z-file
    const apple = modules.find(module => module.name === "apple");
    expect(apple?.files).toEqual([
      join(stableRoot, "apple", "a-file.ts"),
      join(stableRoot, "apple", "m-file.ts"),
      join(stableRoot, "apple", "z-file.ts"),
    ]);

    rmSync(stableRoot, { recursive: true, force: true });
  });
});
