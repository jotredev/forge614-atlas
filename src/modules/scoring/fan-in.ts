import ts from "typescript";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { isTestFile, type ModuleDescriptor } from "./discovery";

/**
 * Extrae todas las rutas relativas especificadas en cláusulas de importación o exportación
 * dentro de un archivo de código TypeScript/JavaScript usando su AST.
 * 
 * Alcance sintáctico soportado:
 * 1. Declaraciones ESM estáticas: `import { x } from "./ruta"`
 * 2. Declaraciones ESM de re-exportación: `export { y } from "../otro/modulo"`
 * 3. Llamadas dinámicas de CommonJS: `const z = require("./modulo")`
 * 
 * Regla de filtrado:
 * - Solo se retornan especificadores que comiencen con punto (`.` o `..`),
 *   lo que identifica dependencias internas del proyecto.
 * - Se omiten dependencias externas (ej. `"typescript"`, `"react"`, `"node:path"`),
 *   ya que estas no forman parte de los módulos de primer nivel del repositorio.
 * 
 * @param sourceText - Código fuente del archivo en texto
 * @param fileName - Nombre del archivo para contexto del compilador
 * @returns Lista de cadenas con los especificadores relativos encontrados
 */
export function extractRelativeImportSpecifiers(sourceText: string, fileName = "module.ts"): string[] {
  // 1. Construcción del AST del archivo analizado
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];

  // 2. Función recursiva de recorrido sintáctico
  function visit(node: ts.Node): void {
    // 3. Inspeccionar declaraciones de importación o exportación ESM
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    // 4. Inspeccionar llamadas require() comunes en librerías híbridas o utilidades
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0] as ts.Expression)
    ) {
      specifiers.push((node.arguments[0] as ts.StringLiteral).text);
    }

    // 5. Continuar recorrido sobre nodos hijos
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // 6. Filtrar exclusivamente las dependencias relativas internas (inician con '.')
  return specifiers.filter(specifier => specifier.startsWith("."));
}

/**
 * Resuelve una ruta de importación relativa al archivo físico real en disco.
 * 
 * Desafío en TypeScript:
 * - Los desarrolladores escriben `import { x } from "../utils/helper"`, pero en disco
 *   el archivo físico se llama `helper.ts`, `helper.tsx`, o bien `helper/index.ts`.
 * 
 * Algoritmo de resolución de candidatos:
 * 1. Calcula la ruta base absoluta resolviendo `specifier` relativo a la carpeta de `fromFile`.
 * 2. Genera un arreglo de candidatos posibles ordenados por probabilidad:
 *    - Ruta base exacta (por si ya incluye la extensión o es un directorio directo).
 *    - Ruta base con extensiones: `.ts`, `.tsx`, `.js`, `.jsx`.
 *    - Resolución de módulo contenedor de índice: `/index.ts`, `/index.tsx`, `/index.js`.
 * 3. Comprueba la existencia en disco de cada candidato con `existsSync`.
 * 4. Retorna la primera ruta física coincidente, o `null` si ninguna coincide.
 * 
 * @param fromFile - Ruta absoluta del archivo que contiene la declaración de importación
 * @param specifier - Cadena relativa del especificador (ej. `"./auth/jwt"`)
 * @returns Ruta absoluta del archivo resuelto o `null` si no existe
 */
function resolveImportPath(fromFile: string, specifier: string): string | null {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    join(base, "index.js"),
  ];

  return candidates.find(candidate => existsSync(candidate)) ?? null;
}

/**
 * Calcula la Centralidad Fan-In de cada módulo del proyecto.
 * 
 * Definición Teórica de Grafos:
 * - Fan-In representa el "grado de entrada" (in-degree) de un nodo en el grafo dirigido
 *   de dependencias entre módulos.
 * - Mide cuántos OTROS módulos distintos dependen directamente de los servicios o tipos
 *   expuestos por este módulo. Un Fan-In alto indica que el módulo es un componente central
 *   o núcleo estructural del sistema.
 * 
 * Reglas arquitectónicas indispensables:
 * 1. Unicidad de Arista (Deduplicación por Set):
 *    Si el módulo `ordenes` tiene 5 archivos distintos y cada uno importa 3 funciones de
 *    `usuarios`, el Fan-In de `usuarios` desde `ordenes` debe ser exactamente 1.
 *    No se cuentan las sentencias de importación individuales sino la dependencia a nivel módulo.
 * 2. Exclusión de Auto-Dependencias:
 *    Si un archivo dentro de `auth` importa otro archivo dentro de `auth`, esto es cohesión interna,
 *    NO es una dependencia externa. Se excluye estrictamente (`toModule.name !== fromModule.name`).
 * 3. Frontera Estricta de Directorio (`modulePath + sep`):
 *    Al asociar una ruta resuelta a un módulo, se valida que coincida exactamente o que empiece
 *    con la ruta del módulo seguida por el separador del sistema (`/` en POSIX o `\` en Windows).
 *    Esto previene falsos positivos catastróficos si existen carpetas como `auth` y `auth-legacy`.
 * 4. Exclusión de Archivos de Prueba:
 *    Los archivos de test (`.test.ts`) se omiten del análisis para evitar que los imports
 *    de prueba distorsionen la topología arquitectónica de producción.
 * 
 * @param modules - Lista de módulos registrados en el proyecto
 * @returns Mapa `Map<string, number>` con el valor de Fan-In por cada módulo
 */
export function computeFanIn(modules: ModuleDescriptor[]): Map<string, number> {
  // 1. Inicializar el mapa de resultados con 0 para todos los módulos conocidos
  const fanIn = new Map(modules.map(module => [module.name, 0]));

  // 2. Iterar sobre cada módulo emisor (consumidor potencial)
  for (const fromModule of modules) {
    // Conjunto para rastrear qué módulos destino son referenciados por este módulo emisor
    const targetModuleNames = new Set<string>();

    // 3. Inspeccionar todos los archivos productivos del módulo emisor
    for (const filePath of fromModule.files) {
      if (isTestFile(filePath)) {
        continue;
      }

      const sourceText = readFileSync(filePath, "utf8");

      // 4. Extraer todos los especificadores relativos
      for (const specifier of extractRelativeImportSpecifiers(sourceText, filePath)) {
        const resolvedPath = resolveImportPath(filePath, specifier);
        if (!resolvedPath) {
          continue;
        }

        // 5. Determinar a qué módulo pertenece el archivo importado
        const toModule = modules.find(module => {
          const modulePath = module.path;
          return resolvedPath === modulePath || resolvedPath.startsWith(modulePath + sep);
        });

        // 6. Si el destino pertenece a otro módulo diferente, registrar la dependencia dirigida
        if (toModule && toModule.name !== fromModule.name) {
          targetModuleNames.add(toModule.name);
        }
      }
    }

    // 7. Incrementar en 1 el contador Fan-In de cada módulo destino alcanzado
    for (const name of targetModuleNames) {
      fanIn.set(name, (fanIn.get(name) ?? 0) + 1);
    }
  }

  return fanIn;
}
