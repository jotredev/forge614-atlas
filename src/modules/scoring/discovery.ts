import { Glob } from "bun";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

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
 * Algoritmo de descubrimiento de módulos con profundidad adaptable.
 *
 * A diferencia de una exploración de un solo nivel, cada carpeta candidata se evalúa
 * de forma independiente y recursiva:
 * - Si solo contiene subcarpetas (sin archivos de código directamente adentro), NO se
 *   convierte en módulo — se sigue bajando y se evalúan sus subcarpetas por separado.
 *   Esto evita que layouts típicos como `src/{auth,billing}` colapsen en un solo módulo.
 * - Si contiene archivos de código directamente Y subcarpetas (carpeta mixta), los
 *   archivos sueltos forman su propio módulo, y cada subcarpeta se evalúa aparte.
 * - Si no tiene subcarpetas (o ya no quedan), es un módulo completo si contiene al
 *   menos un archivo de código, igual que el comportamiento original.
 *
 * El nombre de cada módulo es su ruta relativa a `root` (ej. `src/auth`), no solo el
 * nombre de la carpeta final — así dos carpetas con el mismo nombre en ramas distintas
 * (ej. `src/auth` y `tests/auth`) nunca chocan como si fueran el mismo módulo.
 *
 * @param root - Ruta absoluta del repositorio del proyecto
 * @returns Lista de módulos descubiertos ordenada alfabéticamente por nombre
 */
export function discoverModules(root: string): ModuleDescriptor[] {
  const topLevelDirs = readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith("."))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const modules: ModuleDescriptor[] = [];
  for (const dirName of topLevelDirs) {
    collectModules(root, join(root, dirName), modules);
  }

  return modules.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Evalúa recursivamente una carpeta candidata y registra en `modules` (por referencia)
 * cero, uno, o varios `ModuleDescriptor` según el caso (contenedor puro, mixta, u hoja).
 *
 * @param root - Raíz original pasada a `discoverModules`, usada para calcular nombres relativos
 * @param dirPath - Ruta absoluta de la carpeta candidata que se está evaluando
 * @param modules - Acumulador mutable de módulos descubiertos hasta el momento
 */
function collectModules(root: string, dirPath: string, modules: ModuleDescriptor[]): void {
  const entries = readdirSync(dirPath, { withFileTypes: true });

  const subdirNames = entries
    .filter(entry => entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith("."))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const directFiles = listDirectSourceFiles(dirPath);

  // Carpeta hoja (sin subcarpetas calificadas): módulo completo si tiene código.
  if (subdirNames.length === 0) {
    if (directFiles.length > 0) {
      modules.push({ name: relativeModuleName(root, dirPath), path: dirPath, files: directFiles });
    }
    return;
  }

  // Carpeta mixta: los archivos sueltos forman su propio módulo pequeño.
  if (directFiles.length > 0) {
    modules.push({ name: relativeModuleName(root, dirPath), path: dirPath, files: directFiles });
  }

  // Carpeta contenedora (pura o mixta): cada subcarpeta se evalúa por separado.
  for (const subdirName of subdirNames) {
    collectModules(root, join(dirPath, subdirName), modules);
  }
}

/**
 * Calcula el nombre de módulo como la ruta relativa a `root`, normalizada a separadores
 * `/` sin importar el sistema operativo, para que los nombres sean estables entre
 * macOS, Linux y Windows (se usan como claves de mapa y como parte de topic keys de Engram).
 */
function relativeModuleName(root: string, dirPath: string): string {
  return relative(root, dirPath).split(sep).join("/");
}

/**
 * Lista los archivos de código TypeScript/JavaScript ubicados directamente dentro de
 * `dir` (sin recursividad — las subcarpetas se manejan por separado en `collectModules`).
 *
 * @param dir - Ruta absoluta de la carpeta a inspeccionar
 * @returns Lista de rutas absolutas ordenadas alfabéticamente
 */
function listDirectSourceFiles(dir: string): string[] {
  const glob = new Glob("*.{ts,tsx,js,jsx}");
  const matches: string[] = [];

  for (const relativePath of glob.scanSync({ cwd: dir, onlyFiles: true })) {
    matches.push(join(dir, relativePath));
  }

  return matches.sort((a, b) => a.localeCompare(b));
}
