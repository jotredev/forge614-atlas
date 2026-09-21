import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverModules } from "./discovery";

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

  test("finds top-level folders that contain source files", () => {
    // Escaneo dentro de 'src': debe encontrar 'auth' y listar 'login.ts'
    const modules = discoverModules(join(root, "src"));
    expect(modules).toHaveLength(1);
    expect(modules[0]?.name).toBe("auth");
    expect(modules[0]?.files).toEqual([join(root, "src", "auth", "login.ts")]);
  });

  test("excludes folders with no ts/tsx/js/jsx files", () => {
    // Escaneo dentro de 'src': 'styles' contiene solo CSS, por ende no califica
    const modules = discoverModules(join(root, "src"));
    const names = modules.map(module => module.name);
    expect(names).not.toContain("styles");
  });

  test("ignores node_modules even when scanning from the repo root", () => {
    // Escaneo desde la raíz: 'node_modules' está en la lista de exclusión y debe omitirse
    const modules = discoverModules(root);
    const names = modules.map(module => module.name);
    expect(names).not.toContain("node_modules");
  });

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

  test("descends into a purely-nested container folder instead of collapsing it into one module", () => {
    // 'src' solo contiene subcarpetas (auth, styles) — no debe convertirse en un módulo único.
    // 'src/auth' debe ser su propio módulo, nombrado con la ruta relativa completa.
    const modules = discoverModules(root);
    const names = modules.map(module => module.name).sort();
    expect(names).toEqual(["src/auth"]);
    const authModule = modules.find(module => module.name === "src/auth");
    expect(authModule?.files).toEqual([join(root, "src", "auth", "login.ts")]);
  });

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

  test("keeps flat top-level modules working exactly as before (no regression)", () => {
    const flatRoot = mkdtempSync(join(tmpdir(), "atlas-discovery-flat-"));

    mkdirSync(join(flatRoot, "auth"), { recursive: true });
    writeFileSync(join(flatRoot, "auth", "login.ts"), "export const login = () => true;");

    const modules = discoverModules(flatRoot);
    expect(modules.map(module => module.name)).toEqual(["auth"]);

    rmSync(flatRoot, { recursive: true, force: true });
  });

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
