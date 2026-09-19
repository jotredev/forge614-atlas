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
