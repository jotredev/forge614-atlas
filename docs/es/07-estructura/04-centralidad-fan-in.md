# 07.04 Centralidad Fan-In de Dependencias

> **Documento de Arquitectura y Código — Ecosistema Forge614 Atlas**  
> **Alcance:** `src/modules/scoring/fan-in.ts` y `fan-in.test.ts`  
> **Traducción hermana:** [07.04 (EN) Dependency Fan-In Centrality (fan-in.ts and test)](../../en/07-structure/04-fan-in-centrality.md)

---

## 1. Justificación Arquitectónica

La centralidad Fan-In mide el grado de entrada (in-degree) de cada módulo en el grafo dirigido de dependencias del proyecto. Cuantos más módulos externos dependan de un módulo dado, mayor es su impacto transversal: una rotura o cambio imprevisto en él provocará un efecto dominó que afectará a múltiples subsistemas.

### Reglas Críticas del Algoritmo
1. **Unicidad de Arista (Set Deduplication):** Si el módulo consumidor `ordenes` contiene 10 archivos y todos importan utilidades de `auth`, el Fan-In de `auth` incrementa exactamente en **1**. Se contabiliza la dependencia estructural entre subsistemas, no la cantidad bruta de cláusulas de importación.
2. **Exclusión de Cohesión Interna:** Si un archivo dentro de `auth` importa a su hermano en `auth`, esto es modularidad interna y jamás incrementa el Fan-In de dependencias externas.
3. **Frontera Estricta de Directorio (`modulePath + sep`):** Al resolver rutas relativas en disco, se exige coincidencia exacta o prefijo seguido del separador del sistema operativo. Esto evita falsos positivos catastróficos entre carpetas con nombres similares como `auth` y `auth-service`.
4. **Resolución de Extensiones TypeScript:** Resuelve candidatos sin extensión, con `.ts`, `.tsx`, `.js`, `.jsx`, o contenedores `index.ts/index.tsx`.
5. **Exclusión de Archivos de Prueba:** Las aserciones de prueba que consumen librerías auxiliares se descartan para proteger la topología arquitectónica de producción.

### Analogía del Mundo Real
> Es como el acueducto central de una metrópoli frente a la llave de agua de una casa particular: si el acueducto central se rompe, miles de hogares e industrias quedan paralizados de inmediato (alto Fan-In). Si la llave de una cocina gotea, solo afecta a esa vivienda (bajo Fan-In).

---

## 2. Código Fuente Documentado: `src/modules/scoring/fan-in.ts`

```typescript
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
 *    Esto previene falsos positivos catastróficos si existen carpetas como `auth` y `auth-service`.
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
```

---

## 3. Pruebas Automatizadas: `src/modules/scoring/fan-in.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeFanIn } from "./fan-in";
import type { ModuleDescriptor } from "./discovery";

describe("computeFanIn", () => {
  test("counts how many other modules import from this one", () => {
    // Escenario: El módulo 'shared' es consumido por 'auth' y 'billing'.
    // Su Fan-In debe ser exactamente 2.
    const root = mkdtempSync(join(tmpdir(), "atlas-fanin-"));
    const sharedPath = join(root, "shared");
    const authPath = join(root, "auth");
    const billingPath = join(root, "billing");
    mkdirSync(sharedPath, { recursive: true });
    mkdirSync(authPath, { recursive: true });
    mkdirSync(billingPath, { recursive: true });

    const sharedFile = join(sharedPath, "logger.ts");
    const authFile = join(authPath, "login.ts");
    const billingFile = join(billingPath, "charge.ts");

    writeFileSync(sharedFile, "export const log = (message: string) => console.log(message);");
    writeFileSync(authFile, `import { log } from "../shared/logger";\nexport const login = () => log("login");`);
    writeFileSync(billingFile, `import { log } from "../shared/logger";\nexport const charge = () => log("charge");`);

    const modules: ModuleDescriptor[] = [
      { name: "shared", path: sharedPath, files: [sharedFile] },
      { name: "auth", path: authPath, files: [authFile] },
      { name: "billing", path: billingPath, files: [billingFile] },
    ];

    const result = computeFanIn(modules);

    // 'shared' tiene 2 módulos consumidores; 'auth' y 'billing' tienen 0
    expect(result.get("shared")).toBe(2);
    expect(result.get("auth")).toBe(0);
    expect(result.get("billing")).toBe(0);

    rmSync(root, { recursive: true, force: true });
  });

  test("does not count a module importing from itself", () => {
    // Escenario: Dentro de 'auth', fileB importa fileA.
    // Esto es cohesión interna, jamás debe contarse como Fan-In de dependencias externas.
    const root = mkdtempSync(join(tmpdir(), "atlas-fanin-self-"));
    const modulePath = join(root, "auth");
    mkdirSync(modulePath, { recursive: true });
    const fileA = join(modulePath, "a.ts");
    const fileB = join(modulePath, "b.ts");
    writeFileSync(fileA, "export const helper = () => true;");
    writeFileSync(fileB, `import { helper } from "./a";\nexport const login = () => helper();`);

    const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [fileA, fileB] }];
    const result = computeFanIn(modules);

    // Debe ser 0 porque no hay módulos externos importándolo
    expect(result.get("auth")).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  test("handles sibling modules with overlapping names correctly (path-prefix collision)", () => {
    // Escenario de colisión de prefijo: 'auth' vs 'auth-legacy'.
    // Si 'auth-legacy' importa de 'auth', solo 'auth' debe recibir +1 en Fan-In,
    // y 'auth-legacy' no debe ser confundido por coincidencia parcial de texto.
    const root = mkdtempSync(join(tmpdir(), "atlas-fanin-collision-"));
    const authPath = join(root, "auth");
    const authLegacyPath = join(root, "auth-legacy");
    mkdirSync(authPath, { recursive: true });
    mkdirSync(authLegacyPath, { recursive: true });

    const authFile = join(authPath, "index.ts");
    const authLegacyFile = join(authLegacyPath, "index.ts");

    writeFileSync(authFile, "export const newAuth = () => true;");
    writeFileSync(authLegacyFile, `import { newAuth } from "../auth";\nexport const legacyAuth = () => newAuth();`);

    const modules: ModuleDescriptor[] = [
      { name: "auth", path: authPath, files: [authFile] },
      { name: "auth-legacy", path: authLegacyPath, files: [authLegacyFile] },
    ];

    const result = computeFanIn(modules);

    expect(result.get("auth")).toBe(1);
    expect(result.get("auth-legacy")).toBe(0);

    rmSync(root, { recursive: true, force: true });
  });

  test("counts distinct importing modules, not import statements or files", () => {
    // Escenario de deduplicación de aristas:
    // El módulo 'auth' tiene 3 archivos y 4 sentencias de import dirigidas a 'shared'.
    // Sin embargo, como ambas pertenecen al mismo módulo consumidor ('auth'),
    // el Fan-In de 'shared' debe ser estrictamente 1 (módulo a módulo), NO 4 ni 3.
    const root = mkdtempSync(join(tmpdir(), "atlas-fanin-distinct-"));
    const sharedPath = join(root, "shared");
    const authPath = join(root, "auth");
    mkdirSync(sharedPath, { recursive: true });
    mkdirSync(authPath, { recursive: true });

    const sharedFile = join(sharedPath, "logger.ts");
    const authFileA = join(authPath, "a.ts");
    const authFileB = join(authPath, "b.ts");
    const authFileC = join(authPath, "c.ts");

    writeFileSync(sharedFile, "export const log = (message: string) => console.log(message);");
    writeFileSync(
      authFileA,
      `import { log } from "../shared/logger";\nimport { log as log2 } from "../shared/logger";\nexport const a = () => { log("a"); log2("a2"); };`,
    );
    writeFileSync(authFileB, `import { log } from "../shared/logger";\nexport const b = () => log("b");`);
    writeFileSync(authFileC, `import { log } from "../shared/logger";\nexport const c = () => log("c");`);

    const modules: ModuleDescriptor[] = [
      { name: "shared", path: sharedPath, files: [sharedFile] },
      { name: "auth", path: authPath, files: [authFileA, authFileB, authFileC] },
    ];

    const result = computeFanIn(modules);

    // Verificación de unicidad en grafo: 1 arista entre 'auth' y 'shared'
    expect(result.get("shared")).toBe(1);

    rmSync(root, { recursive: true, force: true });
  });

  test("does not count imports from a module's own test files", () => {
    // Escenario: El archivo 'auth/login.test.ts' importa de 'shared', pero 'auth/login.ts' NO.
    // Como los archivos de prueba se excluyen del cómputo productivo, el Fan-In de 'shared' debe ser 0.
    const root = mkdtempSync(join(tmpdir(), "atlas-fanin-testfile-"));
    const sharedPath = join(root, "shared");
    const authPath = join(root, "auth");
    mkdirSync(sharedPath, { recursive: true });
    mkdirSync(authPath, { recursive: true });

    const sharedFile = join(sharedPath, "logger.ts");
    const authSourceFile = join(authPath, "login.ts");
    const authTestFile = join(authPath, "login.test.ts");

    writeFileSync(sharedFile, "export const log = (message: string) => console.log(message);");
    writeFileSync(authSourceFile, "export const login = () => true;");
    writeFileSync(
      authTestFile,
      `import { log } from "../shared/logger";\nlog("testing login");`,
    );

    const modules: ModuleDescriptor[] = [
      { name: "shared", path: sharedPath, files: [sharedFile] },
      { name: "auth", path: authPath, files: [authSourceFile, authTestFile] },
    ];

    const result = computeFanIn(modules);

    expect(result.get("shared")).toBe(0);

    rmSync(root, { recursive: true, force: true });
  });
});
```
