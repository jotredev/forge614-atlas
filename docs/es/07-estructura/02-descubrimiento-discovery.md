# 07.02 Descubrimiento de Módulos (Discovery)

> **Documento de Arquitectura y Código — Ecosistema Forge614 Atlas**  
> **Alcance:** `src/modules/scoring/discovery.ts` y `discovery.test.ts`  
> **Traducción hermana:** [07.02 (EN) Module Discovery (discovery.ts and test)](../../en/07-structure/02-module-discovery.md)

---

## 1. Justificación Arquitectónica

El primer paso de Atlas es mapear el proyecto de manera autónoma, descubriendo qué carpetas de primer nivel califican como módulos arquitectónicos funcionales y qué archivos fuente contienen. Para ser determinista:
1. Ignora directorios estándar de infraestructura (`node_modules`, `.git`, `dist`, `build`, etc.) mediante un conjunto $O(1)$ inmutable.
2. Ordena carpetas y archivos con `localeCompare` lexicográfico estricto, garantizando idéntico comportamiento en macOS, Linux o entornos CI/CD.
3. Distingue archivos de pruebas unitarias (`.test.ts`, `.spec.ts`) mediante expresiones regulares para aislar el código productivo.

### Analogía del Mundo Real
> Es como el censo catastral de una ciudad: el inspector recorre únicamente los edificios residenciales y comerciales habitados, ignorando los almacenes de chatarra (`node_modules`) y los túneles subterráneos de servicio (`.git`), anotando con precisión la dirección de cada departamento para visitarlo después.

---

## 2. Código Fuente Documentado: `src/modules/scoring/discovery.ts`

```typescript
import { Glob } from "bun";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Conjunto inmutable en memoria (O(1) lookup) con las carpetas estándar
 * que jamás deben considerarse módulos de código de negocio ni explorarse
 * recursivamente, evitando bucles infinitos, artefactos compilados y datos efímeros.
 */
const EXCLUDED_DIRS = new Set([
  "node_modules", // Dependencias externas instaladas por el gestor de paquetes
  ".git",         // Base de datos interna de control de versiones de Git
  "dist",         // Salidas de compilación empaquetadas
  "build",        // Artefactos de construcción intermedia
  "coverage",     // Reportes de cobertura de pruebas automatizadas
  ".next",        // Caché de compilación del framework Next.js
  "out",          // Exportaciones estáticas de frontend
  ".forge614",    // Almacén persistente local de Forge614 Engram
]);

/**
 * Descriptor canónico de un módulo descubierto en disco.
 */
export interface ModuleDescriptor {
  /** Nombre del directorio raíz de primer nivel que define el módulo */
  name: string;
  /** Ruta absoluta en el sistema de archivos hacia la carpeta del módulo */
  path: string;
  /** Lista exhaustiva y ordenada alfabéticamente de archivos fuente TypeScript/JavaScript */
  files: string[];
}

/**
 * Predicado determinista para detectar si un archivo es una prueba unitaria o de integración.
 * 
 * Regla de concordancia:
 * - Extensiones admitidas: .test.ts, .test.tsx, .test.js, .test.jsx, .spec.ts, .spec.tsx, etc.
 * - Utilizado por los motores de ciclomática y fan-in para excluir aserciones de prueba
 *   y no inflar artificialmente la complejidad del código de producción.
 * 
 * @param filePath - Ruta relativa o absoluta del archivo a inspeccionar
 * @returns `true` si el nombre finaliza en `.(test|spec).[tj]sx?`
 */
export function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[tj]sx?$/.test(filePath);
}

/**
 * Algoritmo de descubrimiento de módulos de primer nivel.
 * 
 * Paso a paso:
 * 1. Lee todas las entradas del directorio raíz (`root`) de forma síncrona.
 * 2. Filtra exclusivamente las entradas que sean directorios, ignorando carpetas
 *    del sistema (`EXCLUDED_DIRS`) y carpetas ocultas que comiencen con punto (`.`).
 * 3. Ordena los nombres alfabéticamente usando `localeCompare` para garantizar determinismo estricto.
 * 4. Por cada directorio calificado, explora recursivamente todos los archivos de código fuente.
 * 5. Si el directorio contiene al menos 1 archivo fuente válido, lo registra como un `ModuleDescriptor`.
 * 
 * @param root - Ruta absoluta del repositorio del proyecto
 * @returns Lista de módulos descubiertos ordenada alfabéticamente por nombre
 */
export function discoverModules(root: string): ModuleDescriptor[] {
  // 1. Obtener entradas de primer nivel con tipos de archivo (evita statSync adicional)
  const topLevelDirs = readdirSync(root, { withFileTypes: true })
    // 2. Filtrar solo directorios que no estén en la lista negra ni sean carpetas ocultas
    .filter(entry => entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith("."))
    // 3. Extraer solo el nombre de la carpeta
    .map(entry => entry.name)
    // 4. Ordenamiento lexicográfico estable para eliminar variabilidad dependiente del sistema operativo
    .sort((a, b) => a.localeCompare(b));

  const modules: ModuleDescriptor[] = [];

  // 5. Inspeccionar cada carpeta candidata para verificar si contiene código real
  for (const dirName of topLevelDirs) {
    const modulePath = join(root, dirName);
    const files = listSourceFiles(modulePath);

    // Solo se califica como módulo funcional si posee al menos un archivo .ts, .tsx, .js o .jsx
    if (files.length > 0) {
      modules.push({
        name: dirName,
        path: modulePath,
        files,
      });
    }
  }

  return modules;
}

/**
 * Escanea recursivamente un directorio en búsqueda de archivos de código TypeScript y JavaScript.
 * 
 * Paso a paso:
 * 1. Inicializa un escáner `Bun.Glob` con el patrón global `**\/*.{ts,tsx,js,jsx}`.
 * 2. Ejecuta el escaneo síncrono filtrando solo archivos (excluye subcarpetas).
 * 3. Divide cada ruta relativa en segmentos para verificar si atraviesa alguna carpeta
 *    oculta o excluida en niveles anidados (ej. `mi-modulo/.cache/archivo.ts`).
 * 4. Resuelve la ruta absoluta final y la agrega a la lista de coincidencias.
 * 5. Retorna la lista ordenada alfabéticamente para preservar el determinismo.
 * 
 * @param dir - Ruta absoluta del directorio del módulo
 * @returns Lista de rutas absolutas de archivos de código fuente ordenadas
 */
function listSourceFiles(dir: string): string[] {
  // 1. Instanciar patrón glob optimizado para Bun
  const glob = new Glob("**/*.{ts,tsx,js,jsx}");
  const matches: string[] = [];

  // 2. Iterar sobre los resultados síncronos dentro del directorio del módulo
  for (const relativePath of glob.scanSync({ cwd: dir, onlyFiles: true })) {
    const segments = relativePath.split("/");

    // 3. Protección contra subdirectorios anidados no deseados (ej. submódulos git o node_modules anidados)
    if (segments.some(segment => EXCLUDED_DIRS.has(segment) || segment.startsWith("."))) {
      continue;
    }

    // 4. Reconstruir ruta absoluta normalizada
    matches.push(join(dir, relativePath));
  }

  // 5. Ordenamiento lexicográfico para asegurar orden idéntico en macOS, Linux y CI/CD
  return matches.sort((a, b) => a.localeCompare(b));
}
```

---

## 3. Pruebas Automatizadas: `src/modules/scoring/discovery.test.ts`

```typescript
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
```
