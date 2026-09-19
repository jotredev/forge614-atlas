# 07. Estructura del Proyecto y Código Fuente Documentado Línea por Línea

> **Documento Oficial de Referencia Técnica — Ecosistema Forge614**  
> **Proyecto:** Forge614 Atlas (Orquestador de Contextualización Profunda)  
> **Componente:** Plan 1/5 — Motor Determinista de Puntuación de Complejidad  
> **Alcance:** Auditoría completa de los 19 archivos de código fuente, pruebas y configuración  
> **Garantía:** Explicación técnica exhaustiva línea por línea con justificación arquitectónica  
> **Traducción hermana:** [07 (EN). Project Structure and Source Code Documented Line-by-Line](../en/07-project-structure-documented-source-code.md)

---

## 1. Árbol Integral de Archivos y Responsabilidades

```text
forge614-atlas/
├── package.json                         # Manifiesto npm y configuración de scripts
├── tsconfig.json                        # Configuración del compilador TypeScript para Bun
├── .gitignore                           # Exclusiones de Git
├── src/
│   ├── index.ts                         # Barril de exportación pública de la librería
│   └── modules/
│       └── scoring/                     # Monolito modular de puntuación
│           ├── discovery.ts             # Descubrimiento y filtrado de módulos en disco
│           ├── discovery.test.ts        # Batería de pruebas de descubrimiento y orden
│           ├── cyclomatic.ts            # Complejidad ciclomática mediante AST de TypeScript
│           ├── cyclomatic.test.ts       # Batería de pruebas de AST y exclusión de tests
│           ├── fan-in.ts                # Centralidad de dependencias entre módulos distintos
│           ├── fan-in.test.ts           # Batería de pruebas de imports relativos y unicidad
│           ├── churn.ts                 # Volatilidad histórica de cambios en Git (UTF-8)
│           ├── churn.test.ts            # Batería de pruebas de Git log y nombres en español
│           ├── test-coverage-gap.ts     # Cálculo de brecha de pruebas unitarias hermanas
│           ├── test-coverage-gap.test.ts# Batería de pruebas de detección de archivos .test
│           ├── composite-score.ts       # Normalización Min-Max, pesos y modificador
│           ├── composite-score.test.ts  # Batería de pruebas de balance y no distorsión
│           ├── tiers.ts                 # Clasificación en niveles por percentiles
│           ├── tiers.test.ts            # Batería de pruebas de percentiles y desempate
│           └── scaffold.test.ts         # Prueba de sanidad del arnés de pruebas Bun
```

---

## 2. Archivos de Configuración del Entorno

### 2.1 `package.json`

```json
{
  "name": "forge614-atlas",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Orquestador de contextualizacion profunda para el ecosistema Forge614",
  "exports": "./src/index.ts",
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "bun": ">=1.3.8"
  },
  "devDependencies": {
    "@types/bun": "latest"
  },
  "dependencies": {
    "typescript": "5.9.3"
  }
}
```

#### Desglose Línea por Línea
- **Línea 2 (`"name": "forge614-atlas"`):** Identificador formal del paquete dentro del monorepositorio y ecosistema Forge614.
- **Línea 3 (`"version": "0.1.0"`):** Versión semántica inicial correspondiente al Plan 1 completado.
- **Línea 4 (`"private": true`):** Previene la publicación accidental del paquete a registros públicos de npm, protegiendo el código privativo.
- **Línea 5 (`"type": "module"`):** Configura Node y Bun para tratar todos los archivos JavaScript/TypeScript bajo el estándar nativo ECMAScript Modules (ESM) con soporte de `import`/`export`.
- **Línea 6 (`"description": "..."`):** Resumen formal del propósito del paquete.
- **Línea 7 (`"exports": "./src/index.ts"`):** Define la superficie de importación pública del paquete para consumidores externos. Corrige el defecto detectado en la auditoría de rama donde `package.json` apuntaba a un archivo aún no creado.
- **Líneas 8-11 (`"scripts"`):**
  - `"test": "bun test"`: Invoca el ejecutor de pruebas nativo y ultrarrápido de Bun.
  - `"typecheck": "tsc --noEmit"`: Ejecuta el compilador oficial de TypeScript en modo estricto de solo validación sin generar archivos en disco.
- **Líneas 12-14 (`"engines"`):** Restringe el entorno a Bun versión 1.3.8 o superior, asegurando consistencia con `forge614-engram` y `forge614-shell`.
- **Líneas 15-17 (`"devDependencies"`):** Provee las definiciones de tipos para las APIs nativas de Bun (`Bun.Glob`, etc.).
- **Líneas 18-20 (`"dependencies"`):** Fija `typescript` en versión `5.9.3` para garantizar que la API del compilador (`ts.createSourceFile`) mantenga una gramática sintáctica idéntica en cualquier máquina.

---

### 2.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "types": ["bun-types"]
  }
}
```

#### Desglose Línea por Línea
- **Línea 3 (`"target": "ESNext"`):** Emite código moderno compatible con las características más recientes de JavaScript soportadas por Bun.
- **Línea 4 (`"module": "ESNext"`):** Utiliza sintaxis de módulos ESM moderna (`import` dinámico y estático).
- **Línea 5 (`"moduleResolution": "bundler"`):** Estrategia moderna de resolución de módulos compatible con empaquetadores y con Bun, permitiendo importar rutas relativas con o sin extensiones.
- **Línea 6 (`"strict": true`):** Activa el modo más riguroso de TypeScript (comprobación estricta de nulos, tipos `any` implícitos prohibidos y verificación de firmas).
- **Línea 7 (`"skipLibCheck": true`):** Omite la comprobación de tipos dentro de dependencias externas en `node_modules/`, reduciendo drásticamente el tiempo de verificación de tipos.
- **Línea 8 (`"esModuleInterop": true`):** Facilita la interoperabilidad entre módulos CommonJS (como el paquete `typescript`) y ESM.
- **Línea 9 (`"types": ["bun-types"]`):** Inyecta globalmente los tipos del motor de pruebas y utilidades de Bun.

---

### 2.3 `.gitignore`

```text
node_modules/
dist/
build/
coverage/
*.tgz
.DS_Store
.env
.env.*
!.env.example
.forge614/
.superpowers/sdd/
```

#### Desglose Línea por Línea
- **Líneas 1-4:** Ignora dependencias instaladas y carpetas de salida de compilación (`dist/`, `build/`, `coverage/`).
- **Línea 5 (`*.tgz`):** Ignora empaquetados comprimidos generados por `npm pack` o scripts de despliegue.
- **Línea 6 (`.DS_Store`):** Ignora metadatos propios de macOS Finder.
- **Líneas 7-9:** Ignora credenciales y variables de entorno secretas (`.env`, `.env.local`), permitiendo únicamente subir plantillas seguras (`!.env.example`).
- **Línea 10 (`.forge614/`):** Protege la carpeta interna del ecosistema Forge614 donde residen bases de datos locales (`engram.db`).
- **Línea 11 (`.superpowers/sdd/`):** Ignora el espacio de trabajo temporal de notas y registros del desarrollo dirigido por subagentes (commit `942b063`).

---

## 3. Punto de Entrada Principal (`src/index.ts`)

```typescript
export { discoverModules, isTestFile } from "./modules/scoring/discovery";
export type { ModuleDescriptor } from "./modules/scoring/discovery";

export { fileCyclomaticComplexity, computeCyclomaticComplexity } from "./modules/scoring/cyclomatic";

export { computeFanIn } from "./modules/scoring/fan-in";

export { computeChurn } from "./modules/scoring/churn";

export { computeTestCoverageGap } from "./modules/scoring/test-coverage-gap";

export { computeCompositeScores } from "./modules/scoring/composite-score";
export type { ModuleSignals, ModuleScore } from "./modules/scoring/composite-score";

export { assignTiers } from "./modules/scoring/tiers";
export type { Tier, TieredModule } from "./modules/scoring/tiers";
```

#### Desglose Línea por Línea
- **Líneas 1-2:** Re-exporta la función `discoverModules` para identificar módulos en el disco, la función auxiliar `isTestFile` para filtrado de pruebas y la interfaz `ModuleDescriptor`.
- **Línea 4:** Re-exporta el calculador de complejidad ciclomática a nivel de archivo individual (`fileCyclomaticComplexity`) y a nivel de lista de módulos (`computeCyclomaticComplexity`).
- **Línea 6:** Re-exporta `computeFanIn` para calcular la centralidad estructural en el grafo de dependencias.
- **Línea 8:** Re-exporta `computeChurn` para medir la frecuencia de cambios en Git.
- **Línea 10:** Re-exporta `computeTestCoverageGap` para cuantificar la falta de pruebas unitarias.
- **Líneas 12-13:** Re-exporta `computeCompositeScores` y sus tipos asociados (`ModuleSignals` para entradas sin normalizar y `ModuleScore` para salidas ponderadas).
- **Líneas 15-16:** Re-exporta `assignTiers`, el tipo unión literal `Tier` (`"ligero" | "estandar" | "profundo"`) y la estructura final `TieredModule`.

---

## 4. Descubrimiento de Módulos (`discovery.ts` y `discovery.test.ts`)

### 4.1 Código de Producción: `src/modules/scoring/discovery.ts`

```typescript
1:  import { Glob } from "bun";
2:  import { readdirSync } from "node:fs";
3:  import { join } from "node:path";
4:  
5:  const EXCLUDED_DIRS = new Set([
6:    "node_modules", ".git", "dist", "build", "coverage", ".next", "out", ".forge614",
7:  ]);
8:  
9:  export interface ModuleDescriptor {
10:   name: string;
11:   path: string;
12:   files: string[];
13: }
14: 
15: export function isTestFile(filePath: string): boolean {
16:   return /\.(test|spec)\.[tj]sx?$/.test(filePath);
17: }
18: 
19: export function discoverModules(root: string): ModuleDescriptor[] {
20:   const topLevelDirs = readdirSync(root, { withFileTypes: true })
21:     .filter(entry => entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith("."))
22:     .map(entry => entry.name)
23:     .sort((a, b) => a.localeCompare(b));
24: 
25:   const modules: ModuleDescriptor[] = [];
26:   for (const dirName of topLevelDirs) {
27:     const modulePath = join(root, dirName);
28:     const files = listSourceFiles(modulePath);
29:     if (files.length > 0) {
30:       modules.push({ name: dirName, path: modulePath, files });
31:     }
32:   }
33:   return modules;
34: }
35: 
36: function listSourceFiles(dir: string): string[] {
37:   const glob = new Glob("**/*.{ts,tsx,js,jsx}");
38:   const matches: string[] = [];
39:   for (const relativePath of glob.scanSync({ cwd: dir, onlyFiles: true })) {
40:     const segments = relativePath.split("/");
41:     if (segments.some(segment => EXCLUDED_DIRS.has(segment) || segment.startsWith("."))) continue;
42:     matches.push(join(dir, relativePath));
43:   }
44:   return matches.sort((a, b) => a.localeCompare(b));
45: }
```

#### Desglose Línea por Línea
- **Líneas 1-3:** Importa `Glob` nativo de Bun (altamente optimizado en C++), `readdirSync` para listar directorios y `join` para construir rutas independientes del sistema operativo.
- **Líneas 5-7 (`EXCLUDED_DIRS`):** Define un conjunto `Set` de búsqueda $O(1)$ con carpetas reservadas que jamás deben tratarse como módulos de código de negocio (`node_modules`, `.git`, `.forge614`, etc.).
- **Líneas 9-13 (`ModuleDescriptor`):** Contrato de datos que define un módulo descubierto: su nombre corto, su ruta absoluta y la lista de archivos de código que contiene.
- **Líneas 15-17 (`isTestFile`):** Evalúa si una ruta corresponde a una prueba unitaria mediante la expresión regular `/\.(test|spec)\.[tj]sx?$/`. Detecta `.test.ts`, `.test.tsx`, `.spec.js`, etc. Esencial para que downstream no se distorsione la complejidad ciclomática ni el fan-in.
- **Línea 20 (`readdirSync(root, { withFileTypes: true })`):** Lee las entradas del directorio raíz recuperando objetos `Dirent` que permiten consultar `isDirectory()` sin llamadas adicionales a `statSync`.
- **Línea 21:** Filtra únicamente directorios que no estén en `EXCLUDED_DIRS` y que no comiencen con punto (`.`).
- **Línea 22:** Extrae el nombre del directorio.
- **Línea 23 (`.sort((a, b) => a.localeCompare(b))`):** Ordena alfabéticamente los nombres de carpetas para garantizar reproducibilidad absoluta independiente del orden del sistema de archivos.
- **Líneas 25-34:** Itera cada carpeta descubierta, calcula su ruta absoluta con `join(root, dirName)` y recupera sus archivos fuente con `listSourceFiles`. Si la carpeta contiene al menos un archivo de código válido (`files.length > 0`), se agrega como descriptor de módulo.
- **Líneas 36-45 (`listSourceFiles`):** Instancia un escáner `Glob("**/*.{ts,tsx,js,jsx}")` sobre la carpeta del módulo. Divide cada ruta relativa en segmentos; si algún segmento pertenece a `EXCLUDED_DIRS` o comienza con punto (como `.cache/` o `.turbo/`), lo descarta (solucionando el defecto de carpetas ocultas anidadas del commit `ebf7ca3`). Finalmente, ordena todos los archivos resultantes alfabéticamente.

---

### 4.2 Pruebas Automatizadas: `src/modules/scoring/discovery.test.ts`

```typescript
1:  import { afterEach, beforeEach, describe, expect, test } from "bun:test";
2:  import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
3:  import { tmpdir } from "node:os";
4:  import { join } from "node:path";
5:  import { discoverModules } from "./discovery";
6:  
7:  describe("discoverModules", () => {
8:    let root: string;
9:  
10:   beforeEach(() => {
11:     root = mkdtempSync(join(tmpdir(), "atlas-discovery-"));
12:     mkdirSync(join(root, "src", "auth"), { recursive: true });
13:     writeFileSync(join(root, "src", "auth", "login.ts"), "export const login = () => true;");
14:     mkdirSync(join(root, "src", "styles"), { recursive: true });
15:     writeFileSync(join(root, "src", "styles", "index.css"), "body { margin: 0; }");
16:     mkdirSync(join(root, "node_modules", "some-package"), { recursive: true });
17:     writeFileSync(join(root, "node_modules", "some-package", "index.js"), "module.exports = {};");
18:   });
19: 
20:   afterEach(() => {
21:     rmSync(root, { recursive: true, force: true });
22:   });
23: 
24:   test("finds top-level folders that contain source files", () => {
25:     const modules = discoverModules(join(root, "src"));
26:     expect(modules).toHaveLength(1);
27:     expect(modules[0]?.name).toBe("auth");
28:     expect(modules[0]?.files).toEqual([join(root, "src", "auth", "login.ts")]);
29:   });
30: 
31:   test("excludes folders with no ts/tsx/js/jsx files", () => {
32:     const modules = discoverModules(join(root, "src"));
33:     const names = modules.map(module => module.name);
34:     expect(names).not.toContain("styles");
35:   });
36: 
37:   test("ignores node_modules even when scanning from the repo root", () => {
38:     const modules = discoverModules(root);
39:     const names = modules.map(module => module.name);
40:     expect(names).not.toContain("node_modules");
41:   });
42: 
43:   test("excludes nested dot-directories from file scanning", () => {
44:     const srcPath = join(root, "src");
45:     mkdirSync(join(srcPath, "auth", ".cache"), { recursive: true });
46:     writeFileSync(join(srcPath, "auth", ".cache", "generated.ts"), "export const x = 1;");
47:     const modules = discoverModules(srcPath);
48:     expect(modules).toHaveLength(1);
49:     expect(modules[0]?.name).toBe("auth");
50:     expect(modules[0]?.files).toHaveLength(1);
51:     expect(modules[0]?.files).toEqual([join(srcPath, "auth", "login.ts")]);
52:   });
53: 
54:   test("returns modules and files in stable, alphabetically sorted order regardless of creation order", () => {
55:     const stableRoot = mkdtempSync(join(tmpdir(), "atlas-discovery-stable-"));
56:     mkdirSync(join(stableRoot, "zebra"), { recursive: true });
57:     writeFileSync(join(stableRoot, "zebra", "z.ts"), "export const z = 1;");
58:     mkdirSync(join(stableRoot, "mango"), { recursive: true });
59:     writeFileSync(join(stableRoot, "mango", "m.ts"), "export const m = 1;");
60:     mkdirSync(join(stableRoot, "apple"), { recursive: true });
61:     writeFileSync(join(stableRoot, "apple", "z-file.ts"), "export const z = 1;");
62:     writeFileSync(join(stableRoot, "apple", "a-file.ts"), "export const a = 1;");
63:     writeFileSync(join(stableRoot, "apple", "m-file.ts"), "export const m = 1;");
64: 
65:     const modules = discoverModules(stableRoot);
66: 
67:     expect(modules.map(module => module.name)).toEqual(["apple", "mango", "zebra"]);
68:     const apple = modules.find(module => module.name === "apple");
69:     expect(apple?.files).toEqual([
70:       join(stableRoot, "apple", "a-file.ts"),
71:       join(stableRoot, "apple", "m-file.ts"),
72:       join(stableRoot, "apple", "z-file.ts"),
73:     ]);
74: 
75:     rmSync(stableRoot, { recursive: true, force: true });
76:   });
77: });
```

#### Desglose de Casos de Prueba
- **Líneas 10-22 (`beforeEach` / `afterEach`):** Crea un directorio temporal aislado (`mkdtempSync`) con carpetas de prueba (`auth`, `styles`, `node_modules`) y lo destruye de forma segura al finalizar.
- **Líneas 24-29 (Test 1):** Valida que solo carpetas con código fuente TypeScript sean reconocidas como módulos (`auth`).
- **Líneas 31-35 (Test 2):** Comprueba que carpetas con solo archivos CSS (`styles/index.css`) sean ignoradas y no aparezcan en la lista de módulos.
- **Líneas 37-41 (Test 3):** Verifica que carpetas de dependencias externas (`node_modules`) jamás se consideren módulos del repositorio.
- **Líneas 43-52 (Test 4):** Valida que carpetas ocultas anidadas como `.cache/generated.ts` no se incluyan dentro de los archivos de un módulo.
- **Líneas 54-77 (Test 5):** Crea carpetas en orden inverso (`zebra`, `mango`, `apple`) y archivos desordenados (`z-file`, `a-file`, `m-file`), certificando que el resultado retornado esté invariablemente ordenado de forma alfabética.

---

## 5. Complejidad Ciclomática (`cyclomatic.ts` y `cyclomatic.test.ts`)

### 5.1 Código de Producción: `src/modules/scoring/cyclomatic.ts`

```typescript
1:  import ts from "typescript";
2:  import { readFileSync } from "node:fs";
3:  import { isTestFile, type ModuleDescriptor } from "./discovery";
4:  
5:  export function fileCyclomaticComplexity(sourceText: string, fileName = "module.ts"): number {
6:    const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
7:    let complexity = 1;
8:  
9:    function visit(node: ts.Node): void {
10:     switch (node.kind) {
11:       case ts.SyntaxKind.IfStatement:
12:       case ts.SyntaxKind.ConditionalExpression:
13:       case ts.SyntaxKind.WhileStatement:
14:       case ts.SyntaxKind.DoStatement:
15:       case ts.SyntaxKind.ForStatement:
16:       case ts.SyntaxKind.ForInStatement:
17:       case ts.SyntaxKind.ForOfStatement:
18:       case ts.SyntaxKind.CatchClause:
19:       case ts.SyntaxKind.CaseClause:
20:         complexity++;
21:         break;
22:       default:
23:         break;
24:     }
25:     if (ts.isBinaryExpression(node)) {
26:       const op = node.operatorToken.kind;
27:       if (
28:         op === ts.SyntaxKind.AmpersandAmpersandToken ||
29:         op === ts.SyntaxKind.BarBarToken ||
30:         op === ts.SyntaxKind.QuestionQuestionToken
31:       ) {
32:         complexity++;
33:       }
34:     }
35:     ts.forEachChild(node, visit);
36:   }
37: 
38:   visit(sourceFile);
39:   return complexity;
40: }
41: 
42: export function computeCyclomaticComplexity(modules: ModuleDescriptor[]): Map<string, number> {
43:   const result = new Map<string, number>();
44:   for (const module of modules) {
45:     let total = 0;
46:     for (const filePath of module.files) {
47:       if (isTestFile(filePath)) continue;
48:       const sourceText = readFileSync(filePath, "utf8");
49:       total += fileCyclomaticComplexity(sourceText, filePath);
50:     }
51:     result.set(module.name, total);
52:   }
53:   return result;
54: }
```

#### Desglose Línea por Línea
- **Línea 1 (`import ts from "typescript"`):** Importa la API del compilador de TypeScript para parsing de AST en memoria.
- **Línea 5 (`fileCyclomaticComplexity`):** Función pura que toma el código fuente como texto y un nombre de archivo virtual.
- **Línea 6 (`ts.createSourceFile`):** Parsea el código TypeScript en un árbol AST de solo lectura. El parámetro `ts.ScriptTarget.Latest` habilita sintaxis moderna (operadores ternarios, coalescencia nula) y `true` activa el escaneo léxico completo.
- **Línea 7 (`let complexity = 1`):** Inicia la métrica en 1, reflejando el axioma de McCabe: todo bloque de código posee al menos una ruta de ejecución lineal.
- **Líneas 9-36 (`visit`):** Función recursiva de recorrido del AST.
  - **Líneas 10-21:** Evalúa `node.kind`. Suma 1 punto por cada estructura de control bifurcante: `if`, ternarios (`? :`), bucles (`while`, `do...while`, `for`, `for...in`, `for...of`), excepciones (`catch`) y cláusulas de selección (`case`). Notar que `default` no suma puntos porque no constituye una decisión nueva sino la ruta de escape.
  - **Líneas 25-34:** Detecta operadores lógicos de cortocircuito en expresiones binarias: `&&` (AND), `||` (OR) y `??` (Nullish Coalescing), ya que cada operador lógico introduce una bifurcación booleana implícita en tiempo de ejecución.
  - **Línea 35 (`ts.forEachChild(node, visit)`):** Desciende a todos los nodos hijos del AST en profundidad.
- **Líneas 42-54 (`computeCyclomaticComplexity`):** Itera sobre cada descriptor de módulo. En la línea 47, aplica la regla de oro: `if (isTestFile(filePath)) continue;`, asegurando que las aserciones de pruebas no inflen artificialmente la puntuación del código productivo. Suma el total de todos los archivos válidos y lo almacena en un `Map<string, number>`.

---

### 5.2 Pruebas Automatizadas: `src/modules/scoring/cyclomatic.test.ts`

```typescript
1:  import { describe, expect, test } from "bun:test";
2:  import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
3:  import { tmpdir } from "node:os";
4:  import { join } from "node:path";
5:  import { fileCyclomaticComplexity, computeCyclomaticComplexity } from "./cyclomatic";
6:  import type { ModuleDescriptor } from "./discovery";
7:  
8:  describe("fileCyclomaticComplexity", () => {
9:    test("a function with no branching has the baseline complexity of 1", () => {
10:     const source = "export function identity(value: number) { return value; }";
11:     expect(fileCyclomaticComplexity(source)).toBe(1);
12:   });
13: 
14:   test("counts if/else-if, loops, switch cases, and logical operators (never default)", () => {
15:     const source = `
16:       export function classify(value: number, items: number[]): string {
17:         if (value > 10) {
18:           return "big";
19:         } else if (value > 0) {
20:           return "small";
21:         }
22:         for (const item of items) {
23:           if (item < 0 && value > 0) continue;
24:         }
25:         switch (value) {
26:           case 1:
27:             return "one";
28:           case 2:
29:             return "two";
30:           default:
31:             return "other";
32:         }
33:       }
34:     `;
35:     expect(fileCyclomaticComplexity(source)).toBe(8);
36:   });
37: });
38: 
39: describe("computeCyclomaticComplexity", () => {
40:   let root: string;
41: 
42:   test("sums complexity across every file in a module", () => {
43:     root = mkdtempSync(join(tmpdir(), "atlas-cyclomatic-"));
44:     const modulePath = join(root, "auth");
45:     mkdirSync(modulePath, { recursive: true });
46:     const fileA = join(modulePath, "a.ts");
47:     const fileB = join(modulePath, "b.ts");
48:     writeFileSync(fileA, "export function identity(value: number) { return value; }");
49:     writeFileSync(fileB, "export function flag(value: boolean) { if (value) return 1; return 0; }");
50: 
51:     const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [fileA, fileB] }];
52:     const result = computeCyclomaticComplexity(modules);
53: 
54:     expect(result.get("auth")).toBe(3); // 1 (identity) + 2 (flag: baseline 1 + 1 if)
55:     rmSync(root, { recursive: true, force: true });
56:   });
57: 
58:   test("excludes *.test.ts files from the module's complexity total", () => {
59:     root = mkdtempSync(join(tmpdir(), "atlas-cyclomatic-testfile-"));
60:     const modulePath = join(root, "auth");
61:     mkdirSync(modulePath, { recursive: true });
62:     const sourceFile = join(modulePath, "a.ts");
63:     const testFile = join(modulePath, "a.test.ts");
64:     writeFileSync(sourceFile, "export function identity(value: number) { return value; }");
65:     writeFileSync(
66:       testFile,
67:       `
68:         import { describe, test, expect } from "bun:test";
69:         describe("identity", () => {
70:           test("branches a lot", () => {
71:             const value = 1;
72:             if (value > 0) {
73:               expect(true).toBe(true);
74:             } else if (value < 0) {
75:               expect(false).toBe(true);
76:             } else {
77:               expect(value).toBe(0);
78:             }
79:           });
80:         });
81:       `,
82:     );
83: 
84:     const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [sourceFile, testFile] }];
85:     const result = computeCyclomaticComplexity(modules);
86: 
87:     // Solo el archivo fuente (complejidad 1) debe contar; el test branchy debe descartarse.
88:     expect(result.get("auth")).toBe(1);
89:     rmSync(root, { recursive: true, force: true });
90:   });
91: });
```

#### Desglose de Casos de Prueba
- **Líneas 9-12 (Test 1):** Valida que una función lineal pura sin `if` registre complejidad exacta de 1.
- **Líneas 14-36 (Test 2):** Valida el cómputo exacto de 8 puntos: base 1 + `if` (+1) + `else if` (+1) + `for` (+1) + `if` (+1) + `&&` (+1) + `case 1` (+1) + `case 2` (+1) = 8.
- **Líneas 42-56 (Test 3):** Comprueba que la complejidad se sume aditivamente a lo largo de múltiples archivos dentro de un mismo módulo.
- **Líneas 58-90 (Test 4):** Valida la exclusión estricta de archivos `*.test.ts`, confirmando que un archivo de prueba con múltiples ramas no altere el puntaje de producción del módulo.

---

## 6. Centralidad Fan-In (`fan-in.ts` y `fan-in.test.ts`)

### 6.1 Código de Producción: `src/modules/scoring/fan-in.ts`

```typescript
1:  import ts from "typescript";
2:  import { readFileSync, existsSync } from "node:fs";
3:  import { dirname, join, resolve, sep } from "node:path";
4:  import { isTestFile, type ModuleDescriptor } from "./discovery";
5:  
6:  export function extractRelativeImportSpecifiers(sourceText: string, fileName = "module.ts"): string[] {
7:    const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
8:    const specifiers: string[] = [];
9:  
10:   function visit(node: ts.Node): void {
11:     if (
12:       (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
13:       node.moduleSpecifier &&
14:       ts.isStringLiteral(node.moduleSpecifier)
15:     ) {
16:       specifiers.push(node.moduleSpecifier.text);
17:     }
18:     if (
19:       ts.isCallExpression(node) &&
20:       ts.isIdentifier(node.expression) &&
21:       node.expression.text === "require" &&
22:       node.arguments[0] &&
23:       ts.isStringLiteral(node.arguments[0] as ts.Expression)
24:     ) {
25:       specifiers.push((node.arguments[0] as ts.StringLiteral).text);
26:     }
27:     ts.forEachChild(node, visit);
28:   }
29:   visit(sourceFile);
30: 
31:   return specifiers.filter(specifier => specifier.startsWith("."));
32: }
33: 
34: function resolveImportPath(fromFile: string, specifier: string): string | null {
35:   const base = resolve(dirname(fromFile), specifier);
36:   const candidates = [
37:     base,
38:     `${base}.ts`,
39:     `${base}.tsx`,
40:     `${base}.js`,
41:     `${base}.jsx`,
42:     join(base, "index.ts"),
43:     join(base, "index.tsx"),
44:     join(base, "index.js"),
45:   ];
46:   return candidates.find(candidate => existsSync(candidate)) ?? null;
47: }
48: 
49: export function computeFanIn(modules: ModuleDescriptor[]): Map<string, number> {
50:   const fanIn = new Map(modules.map(module => [module.name, 0]));
51: 
52:   for (const fromModule of modules) {
53:     const targetModuleNames = new Set<string>();
54:     for (const filePath of fromModule.files) {
55:       if (isTestFile(filePath)) continue;
56:       const sourceText = readFileSync(filePath, "utf8");
57:       for (const specifier of extractRelativeImportSpecifiers(sourceText, filePath)) {
58:         const resolvedPath = resolveImportPath(filePath, specifier);
59:         if (!resolvedPath) continue;
60:         const toModule = modules.find(module => {
61:           const modulePath = module.path;
62:           return resolvedPath === modulePath || resolvedPath.startsWith(modulePath + sep);
63:         });
64:         if (toModule && toModule.name !== fromModule.name) {
65:           targetModuleNames.add(toModule.name);
66:         }
67:       }
68:     }
69:     for (const name of targetModuleNames) {
70:       fanIn.set(name, (fanIn.get(name) ?? 0) + 1);
71:     }
72:   }
73:   return fanIn;
74: }
```

#### Desglose Línea por Línea
- **Líneas 6-32 (`extractRelativeImportSpecifiers`):** Extrae los especificadores de módulo relativos. Inspecciona declaraciones `import` y `export ... from` (líneas 11-17) y llamadas `require(...)` (líneas 18-26). Filtra con `specifier.startsWith(".")` para conservar exclusivamente dependencias internas del proyecto y omitir paquetes de terceros como `lodash` o `react`.
- **Líneas 34-47 (`resolveImportPath`):** Resuelve la ruta relativa contra el sistema de archivos físico utilizando `node:path.resolve(dirname(fromFile), specifier)`. Construye un arreglo de candidatos con extensiones `.ts`, `.tsx`, `.js`, `.jsx` o barriles `index.*`, retornando el primer candidato que exista en disco con `existsSync`.
- **Línea 50 (`computeFanIn`):** Inicializa el mapa de fan-in con valor `0` para cada módulo conocido.
- **Línea 53 (`const targetModuleNames = new Set<string>()`):** Clave de la corrección arquitectónica (commit `951dd07`). Crea un conjunto único por módulo cliente. Si el módulo cliente importa 10 veces al mismo módulo servidor a lo largo de múltiples archivos, el conjunto almacena el nombre una sola vez.
- **Línea 55:** Omite archivos de prueba para que los imports de pruebas no inflen el fan-in de producción.
- **Líneas 60-63 (Verificación de frontera de directorio):** Comprueba `resolvedPath === modulePath || resolvedPath.startsWith(modulePath + sep)`. Utilizar el separador del sistema (`sep`) evita colisiones entre carpetas que comparten prefijo (ej. `auth` y `auth-legacy`).
- **Línea 64 (`if (toModule && toModule.name !== fromModule.name)`):** Excluye las auto-importaciones internas dentro del mismo módulo.
- **Líneas 69-71:** Incrementa el contador de fan-in para cada módulo destino registrado en el conjunto.

---

### 6.2 Pruebas Automatizadas: `src/modules/scoring/fan-in.test.ts`

```typescript
1:  import { describe, expect, test } from "bun:test";
2:  import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
3:  import { tmpdir } from "node:os";
4:  import { join } from "node:path";
5:  import { computeFanIn } from "./fan-in";
6:  import type { ModuleDescriptor } from "./discovery";
7:  
8:  describe("computeFanIn", () => {
9:    test("counts how many other modules import from this one", () => {
10:     const root = mkdtempSync(join(tmpdir(), "atlas-fanin-"));
11:     const sharedPath = join(root, "shared");
12:     const authPath = join(root, "auth");
13:     const billingPath = join(root, "billing");
14:     mkdirSync(sharedPath, { recursive: true });
15:     mkdirSync(authPath, { recursive: true });
16:     mkdirSync(billingPath, { recursive: true });
17: 
18:     const sharedFile = join(sharedPath, "logger.ts");
19:     const authFile = join(authPath, "login.ts");
20:     const billingFile = join(billingPath, "charge.ts");
21: 
22:     writeFileSync(sharedFile, "export const log = (message: string) => console.log(message);");
23:     writeFileSync(authFile, `import { log } from "../shared/logger";\nexport const login = () => log("login");`);
24:     writeFileSync(billingFile, `import { log } from "../shared/logger";\nexport const charge = () => log("charge");`);
25: 
26:     const modules: ModuleDescriptor[] = [
27:       { name: "shared", path: sharedPath, files: [sharedFile] },
28:       { name: "auth", path: authPath, files: [authFile] },
29:       { name: "billing", path: billingPath, files: [billingFile] },
30:     ];
31: 
32:     const result = computeFanIn(modules);
33: 
34:     expect(result.get("shared")).toBe(2);
35:     expect(result.get("auth")).toBe(0);
36:     expect(result.get("billing")).toBe(0);
37: 
38:     rmSync(root, { recursive: true, force: true });
39:   });
40: 
41:   test("does not count a module importing from itself", () => {
42:     const root = mkdtempSync(join(tmpdir(), "atlas-fanin-self-"));
43:     const modulePath = join(root, "auth");
44:     mkdirSync(modulePath, { recursive: true });
45:     const fileA = join(modulePath, "a.ts");
46:     const fileB = join(modulePath, "b.ts");
47:     writeFileSync(fileA, "export const helper = () => true;");
48:     writeFileSync(fileB, `import { helper } from "./a";\nexport const login = () => helper();`);
49: 
50:     const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [fileA, fileB] }];
51:     const result = computeFanIn(modules);
52: 
53:     expect(result.get("auth")).toBe(0);
54:     rmSync(root, { recursive: true, force: true });
55:   });
56: 
57:   test("handles sibling modules with overlapping names correctly (path-prefix collision)", () => {
58:     const root = mkdtempSync(join(tmpdir(), "atlas-fanin-collision-"));
59:     const authPath = join(root, "auth");
60:     const authLegacyPath = join(root, "auth-legacy");
61:     mkdirSync(authPath, { recursive: true });
62:     mkdirSync(authLegacyPath, { recursive: true });
63: 
64:     const authFile = join(authPath, "index.ts");
65:     const authLegacyFile = join(authLegacyPath, "index.ts");
66: 
67:     writeFileSync(authFile, "export const newAuth = () => true;");
68:     writeFileSync(authLegacyFile, `import { newAuth } from "../auth";\nexport const legacyAuth = () => newAuth();`);
69: 
70:     const modules: ModuleDescriptor[] = [
71:       { name: "auth", path: authPath, files: [authFile] },
72:       { name: "auth-legacy", path: authLegacyPath, files: [authLegacyFile] },
73:     ];
74: 
75:     const result = computeFanIn(modules);
76: 
77:     expect(result.get("auth")).toBe(1);
78:     expect(result.get("auth-legacy")).toBe(0);
79: 
80:     rmSync(root, { recursive: true, force: true });
81:   });
82: 
83:   test("counts distinct importing modules, not import statements or files", () => {
84:     const root = mkdtempSync(join(tmpdir(), "atlas-fanin-distinct-"));
85:     const sharedPath = join(root, "shared");
86:     const authPath = join(root, "auth");
87:     mkdirSync(sharedPath, { recursive: true });
88:     mkdirSync(authPath, { recursive: true });
89: 
90:     const sharedFile = join(sharedPath, "logger.ts");
91:     const authFileA = join(authPath, "a.ts");
92:     const authFileB = join(authPath, "b.ts");
93:     const authFileC = join(authPath, "c.ts");
94: 
95:     writeFileSync(sharedFile, "export const log = (message: string) => console.log(message);");
96:     writeFileSync(
97:       authFileA,
98:       `import { log } from "../shared/logger";\nimport { log as log2 } from "../shared/logger";\nexport const a = () => { log("a"); log2("a2"); };`,
99:     );
100:    writeFileSync(authFileB, `import { log } from "../shared/logger";\nexport const b = () => log("b");`);
101:    writeFileSync(authFileC, `import { log } from "../shared/logger";\nexport const c = () => log("c");`);
102:
103:    const modules: ModuleDescriptor[] = [
104:      { name: "shared", path: sharedPath, files: [sharedFile] },
105:      { name: "auth", path: authPath, files: [authFileA, authFileB, authFileC] },
106:    ];
107:
108:    const result = computeFanIn(modules);
109:    expect(result.get("shared")).toBe(1); // Exactamente 1 módulo cliente distinto
110:    rmSync(root, { recursive: true, force: true });
111:  });
112:
113:  test("does not count imports from a module's own test files", () => {
114:    const root = mkdtempSync(join(tmpdir(), "atlas-fanin-testfile-"));
115:    const sharedPath = join(root, "shared");
116:    const authPath = join(root, "auth");
117:    mkdirSync(sharedPath, { recursive: true });
118:    mkdirSync(authPath, { recursive: true });
119:
120:    const sharedFile = join(sharedPath, "logger.ts");
121:    const authSourceFile = join(authPath, "login.ts");
122:    const authTestFile = join(authPath, "login.test.ts");
123:
124:    writeFileSync(sharedFile, "export const log = (message: string) => console.log(message);");
125:    writeFileSync(authSourceFile, "export const login = () => true;");
126:    writeFileSync(authTestFile, `import { log } from "../shared/logger";\nlog("testing login");`);
127:
128:    const modules: ModuleDescriptor[] = [
129:      { name: "shared", path: sharedPath, files: [sharedFile] },
130:      { name: "auth", path: authPath, files: [authSourceFile, authTestFile] },
131:    ];
132:
133:    const result = computeFanIn(modules);
134:    expect(result.get("shared")).toBe(0); // El archivo de prueba no debe contar
135:    rmSync(root, { recursive: true, force: true });
136:  });
137:});
```

#### Desglose de Casos de Prueba
- **Líneas 9-39 (Test 1):** Valida que si `auth` y `billing` importan de `shared`, `shared` obtiene fan-in = 2 y los otros 0.
- **Líneas 41-55 (Test 2):** Verifica que si un archivo de `auth` importa a otro archivo de `auth`, el fan-in no se incremente.
- **Líneas 57-81 (Test 3):** Verifica que no haya falsos positivos entre `auth` y `auth-legacy`.
- **Líneas 83-111 (Test 4):** Valida la corrección del Defecto 1: 4 sentencias de importación en 3 archivos distintos dentro del mismo módulo `auth` cuentan como **1 solo consumidor**.
- **Líneas 113-136 (Test 5):** Valida la corrección del Defecto 2: si solo un archivo `.test.ts` de `auth` importa de `shared`, el fan-in de `shared` permanece en 0.

---

## 7. Volatilidad Histórica Churn (`churn.ts` y `churn.test.ts`)

### 7.1 Código de Producción: `src/modules/scoring/churn.ts`

```typescript
1:  import { spawnSync } from "node:child_process";
2:  import { join, sep } from "node:path";
3:  import type { ModuleDescriptor } from "./discovery";
4:  
5:  /**
6:   * Computes per-module churn (changed-file entries across commit history).
7:   *
8:   * Throws if `repoRoot` is not a git repository, or if the underlying `git log`
9:   * invocation otherwise fails for any reason — including on a git repo with
10:  * zero commits, where `git log` exits non-zero. Callers must handle this.
11:  */
12: export function computeChurn(repoRoot: string, modules: ModuleDescriptor[]): Map<string, number> {
13:   const result = spawnSync("git", ["-c", "core.quotepath=false", "log", "--format=", "--name-only"], {
14:     cwd: repoRoot,
15:     encoding: "utf8",
16:   });
17:   if (result.status !== 0) {
18:     throw new Error(`git log failed in ${repoRoot}: ${result.stderr}`);
19:   }
20: 
21:   const churn = new Map(modules.map(module => [module.name, 0]));
22:   const touchedFiles = result.stdout.split("\n").map(line => line.trim()).filter(Boolean);
23: 
24:   for (const relativeFile of touchedFiles) {
25:     const absolutePath = join(repoRoot, relativeFile);
26:     const matchedModule = modules.find(module => {
27:       const modulePath = module.path;
28:       return absolutePath === modulePath || absolutePath.startsWith(modulePath + sep);
29:     });
30:     if (matchedModule) {
31:       churn.set(matchedModule.name, (churn.get(matchedModule.name) ?? 0) + 1);
32:     }
33:   }
34:   return churn;
35: }
```

#### Desglose Línea por Línea
- **Líneas 1-3:** Importa `spawnSync` para invocar comandos de sistema síncronamente, `join` y `sep` para manipulación de rutas y el tipo `ModuleDescriptor`.
- **Líneas 5-11 (Docstring y Decisión Diferida 1):** Documenta formalmente que la función lanza un error si `repoRoot` no es un repositorio de Git o si no existen commits. Se difiere al Plan 3 la decisión de degradar suavemente (retornando $Churn = 0$) en lugar de fallar.
- **Líneas 13-16:** Invoca el comando Git:
  - `"-c", "core.quotepath=false"`: Desactiva el entrecomillado octal de Git, permitiendo rutas UTF-8 limpias con acentos y eñes (corrige el Defecto 4 del commit `b679879`).
  - `"log", "--format=", "--name-only"`: Omite autores, fechas y mensajes de commit (`--format=`), emitiendo únicamente la lista de archivos afectados.
  - `cwd: repoRoot`: Ejecuta el comando en el directorio del proyecto.
- **Líneas 17-19:** Comprueba el código de salida del proceso; si es distinto de cero, lanza un error descriptivo con la salida de `stderr`.
- **Líneas 21-22:** Inicializa el mapa en 0 y divide la salida estándar por saltos de línea, descartando líneas vacías.
- **Líneas 24-33:** Convierte cada ruta relativa devuelta por Git a ruta absoluta con `join(repoRoot, relativeFile)` y busca el módulo correspondiente usando la validación de frontera de directorio (`absolutePath === modulePath || absolutePath.startsWith(modulePath + sep)`). Si coincide, incrementa el contador de churn del módulo.

---

### 7.2 Pruebas Automatizadas: `src/modules/scoring/churn.test.ts`

```typescript
1:  import { describe, expect, test } from "bun:test";
2:  import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
3:  import { spawnSync } from "node:child_process";
4:  import { tmpdir } from "node:os";
5:  import { join } from "node:path";
6:  import { computeChurn } from "./churn";
7:  import type { ModuleDescriptor } from "./discovery";
8:  
9:  function git(cwd: string, args: string[]): void {
10:   const result = spawnSync("git", args, { cwd, encoding: "utf8" });
11:   if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
12: }
13: 
14: describe("computeChurn", () => {
15:   test("counts changed-file entries per module across commit history", () => {
16:     const root = mkdtempSync(join(tmpdir(), "atlas-churn-"));
17:     git(root, ["init", "-q"]);
18:     git(root, ["config", "user.email", "test@example.com"]);
19:     git(root, ["config", "user.name", "Test"]);
20: 
21:     const authPath = join(root, "auth");
22:     const billingPath = join(root, "billing");
23:     mkdirSync(authPath, { recursive: true });
24:     mkdirSync(billingPath, { recursive: true });
25:     const authFile = join(authPath, "login.ts");
26:     const billingFile = join(billingPath, "charge.ts");
27: 
28:     writeFileSync(authFile, "export const login = () => true;");
29:     git(root, ["add", "."]);
30:     git(root, ["commit", "-q", "-m", "add login"]);
31: 
32:     writeFileSync(authFile, "export const login = () => false;");
33:     git(root, ["add", "."]);
34:     git(root, ["commit", "-q", "-m", "flip login"]);
35: 
36:     writeFileSync(billingFile, "export const charge = () => true;");
37:     git(root, ["add", "."]);
38:     git(root, ["commit", "-q", "-m", "add charge"]);
39: 
40:     const modules: ModuleDescriptor[] = [
41:       { name: "auth", path: authPath, files: [authFile] },
42:       { name: "billing", path: billingPath, files: [billingFile] },
43:     ];
44: 
45:     const result = computeChurn(root, modules);
46:     expect(result.get("auth")).toBe(2);
47:     expect(result.get("billing")).toBe(1);
48:     rmSync(root, { recursive: true, force: true });
49:   });
50: 
51:   test("correctly attributes files to modules with prefix-overlapping names", () => {
52:     const root = mkdtempSync(join(tmpdir(), "atlas-churn-prefix-"));
53:     git(root, ["init", "-q"]);
54:     git(root, ["config", "user.email", "test@example.com"]);
55:     git(root, ["config", "user.name", "Test"]);
56: 
57:     const authPath = join(root, "auth");
58:     const authLegacyPath = join(root, "auth-legacy");
59:     mkdirSync(authPath, { recursive: true });
60:     mkdirSync(authLegacyPath, { recursive: true });
61:     const authFile = join(authPath, "login.ts");
62:     const authLegacyFile = join(authLegacyPath, "old-login.ts");
63: 
64:     writeFileSync(authFile, "export const login = () => true;");
65:     git(root, ["add", "."]);
66:     git(root, ["commit", "-q", "-m", "add login"]);
67: 
68:     writeFileSync(authLegacyFile, "export const oldLogin = () => true;");
69:     git(root, ["add", "."]);
70:     git(root, ["commit", "-q", "-m", "add old login"]);
71: 
72:     const modules: ModuleDescriptor[] = [
73:       { name: "auth", path: authPath, files: [authFile] },
74:       { name: "auth-legacy", path: authLegacyPath, files: [authLegacyFile] },
75:     ];
76: 
77:     const result = computeChurn(root, modules);
78:     expect(result.get("auth")).toBe(1);
79:     expect(result.get("auth-legacy")).toBe(1);
80:     rmSync(root, { recursive: true, force: true });
81:   });
82: 
83:   test("correctly attributes churn for modules with non-ASCII names", () => {
84:     const root = mkdtempSync(join(tmpdir(), "atlas-churn-nonascii-"));
85:     git(root, ["init", "-q"]);
86:     git(root, ["config", "user.email", "test@example.com"]);
87:     git(root, ["config", "user.name", "Test"]);
88: 
89:     const signalesPath = join(root, "señales");
90:     mkdirSync(signalesPath, { recursive: true });
91:     const signalesFile = join(signalesPath, "procesador.ts");
92: 
93:     writeFileSync(signalesFile, "export const procesar = () => true;");
94:     git(root, ["add", "."]);
95:     git(root, ["commit", "-q", "-m", "add señales"]);
96: 
97:     const modules: ModuleDescriptor[] = [{ name: "señales", path: signalesPath, files: [signalesFile] }];
98: 
99:     const result = computeChurn(root, modules);
100:    expect(result.get("señales")).toBe(1);
101:    rmSync(root, { recursive: true, force: true });
102:  });
103:});
```

#### Desglose de Casos de Prueba
- **Líneas 15-49 (Test 1):** Inicializa un repositorio temporal de Git y genera 3 commits. Comprueba que `auth` registre 2 cambios y `billing` 1 cambio.
- **Líneas 51-81 (Test 2):** Valida la verificación de frontera de directorio, asegurando que commits sobre `auth-legacy` no se atribuyan erróneamente a `auth`.
- **Líneas 83-102 (Test 3):** Valida la corrección del Defecto 4: crea una carpeta llamada `señales` con la letra `ñ`, hace un commit y verifica que registre churn = 1, demostrando que `core.quotepath=false` funciona en entornos reales.

---

## 8. Brecha de Cobertura de Pruebas (`test-coverage-gap.ts` y `.test.ts`)

### 8.1 Código de Producción: `src/modules/scoring/test-coverage-gap.ts`

```typescript
1:  import { existsSync } from "node:fs";
2:  import { isTestFile, type ModuleDescriptor } from "./discovery";
3:  
4:  function hasSiblingTest(filePath: string): boolean {
5:    const dotIndex = filePath.lastIndexOf(".");
6:    const base = filePath.slice(0, dotIndex);
7:    const ext = filePath.slice(dotIndex);
8:    return existsSync(`${base}.test${ext}`) || existsSync(`${base}.spec${ext}`);
9:  }
10: 
11: export function computeTestCoverageGap(modules: ModuleDescriptor[]): Map<string, number> {
12:   const result = new Map<string, number>();
13:   for (const module of modules) {
14:     const sourceFiles = module.files.filter(file => !isTestFile(file));
15:     if (sourceFiles.length === 0) {
16:       result.set(module.name, 0);
17:       continue;
18:     }
19:     const withTests = sourceFiles.filter(hasSiblingTest);
20:     result.set(module.name, 1 - withTests.length / sourceFiles.length);
21:   }
22:   return result;
23: }
```

#### Desglose Línea por Línea
- **Líneas 4-9 (`hasSiblingTest`):** Para un archivo dado (ej. `modulo/servicio.ts`), extrae el nombre base (`modulo/servicio`) y la extensión (`.ts`). Comprueba mediante `existsSync` si existe `modulo/servicio.test.ts` o `modulo/servicio.spec.ts`.
- **Línea 14:** Filtra los archivos del módulo ignorando cualquier archivo que ya sea una prueba (`!isTestFile(file)`).
- **Líneas 15-18:** Si un módulo no tiene archivos fuente productivos (por ejemplo, si contiene solo archivos de configuración auxiliares), asigna brecha $0.0$ para no penalizarlo artificialmente.
- **Líneas 19-20:** Filtra los archivos que sí cuentan con prueba hermana y calcula la brecha:
  $$TestGap = 1 - \frac{|withTests|}{|sourceFiles|}$$
  Devolviendo un valor en el intervalo continuo $[0.0, 1.0]$.

---

### 8.2 Pruebas Automatizadas: `src/modules/scoring/test-coverage-gap.test.ts`

```typescript
1:  import { describe, expect, test } from "bun:test";
2:  import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
3:  import { tmpdir } from "node:os";
4:  import { join } from "node:path";
5:  import { computeTestCoverageGap } from "./test-coverage-gap";
6:  import type { ModuleDescriptor } from "./discovery";
7:  
8:  describe("computeTestCoverageGap", () => {
9:    test("returns 0 when every source file has a sibling .test file", () => {
10:     const root = mkdtempSync(join(tmpdir(), "atlas-gap-covered-"));
11:     const modulePath = join(root, "auth");
12:     mkdirSync(modulePath, { recursive: true });
13:     const source = join(modulePath, "login.ts");
14:     const testFile = join(modulePath, "login.test.ts");
15:     writeFileSync(source, "export const login = () => true;");
16:     writeFileSync(testFile, "// test");
17: 
18:     const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [source, testFile] }];
19:     const result = computeTestCoverageGap(modules);
20: 
21:     expect(result.get("auth")).toBe(0);
22:     rmSync(root, { recursive: true, force: true });
23:   });
24: 
25:   test("returns 1 when no source file has a sibling test", () => {
26:     const root = mkdtempSync(join(tmpdir(), "atlas-gap-uncovered-"));
27:     const modulePath = join(root, "billing");
28:     mkdirSync(modulePath, { recursive: true });
29:     const source = join(modulePath, "charge.ts");
30:     writeFileSync(source, "export const charge = () => true;");
31: 
32:     const modules: ModuleDescriptor[] = [{ name: "billing", path: modulePath, files: [source] }];
33:     const result = computeTestCoverageGap(modules);
34: 
35:     expect(result.get("billing")).toBe(1);
36:     rmSync(root, { recursive: true, force: true });
37:   });
38: 
39:   test("returns a fractional gap when only some files are covered", () => {
40:     const root = mkdtempSync(join(tmpdir(), "atlas-gap-partial-"));
41:     const modulePath = join(root, "mixed");
42:     mkdirSync(modulePath, { recursive: true });
43:     const covered = join(modulePath, "a.ts");
44:     const coveredTest = join(modulePath, "a.test.ts");
45:     const uncovered = join(modulePath, "b.ts");
46:     writeFileSync(covered, "export const a = 1;");
47:     writeFileSync(coveredTest, "// test");
48:     writeFileSync(uncovered, "export const b = 2;");
49: 
50:     const modules: ModuleDescriptor[] = [
51:       { name: "mixed", path: modulePath, files: [covered, coveredTest, uncovered] },
52:     ];
53:     const result = computeTestCoverageGap(modules);
54: 
55:     expect(result.get("mixed")).toBe(0.5);
56:     rmSync(root, { recursive: true, force: true });
57:   });
58: });
```

#### Desglose de Casos de Prueba
- **Líneas 9-23 (Test 1):** Valida que si todos los archivos tienen prueba hermana, el gap retorne exactamente `0`.
- **Líneas 25-37 (Test 2):** Valida que si ningún archivo tiene prueba, el gap retorne exactamente `1`.
- **Líneas 39-57 (Test 3):** Valida que si 1 de 2 archivos tiene prueba (`a.ts` tiene `a.test.ts`, pero `b.ts` no), el resultado sea exactamente $1 - (1/2) = 0.5$.

---

## 9. Puntuación Compuesta (`composite-score.ts` y `.test.ts`)

### 9.1 Código de Producción: `src/modules/scoring/composite-score.ts`

```typescript
1:  export interface ModuleSignals {
2:    name: string;
3:    cyclomatic: number;
4:    fanIn: number;
5:    churn: number;
6:    testGap: number;
7:  }
8:  
9:  export interface ModuleScore {
10:   name: string;
11:   score: number;
12: }
13: 
14: export function computeCompositeScores(signals: ModuleSignals[]): ModuleScore[] {
15:   const cyclomaticNorm = normalize(signals.map(s => s.cyclomatic));
16:   const fanInNorm = normalize(signals.map(s => s.fanIn));
17:   const churnNorm = normalize(signals.map(s => s.churn));
18: 
19:   return signals.map((signal, index) => {
20:     const base = 0.35 * (cyclomaticNorm[index] ?? 0) + 0.35 * (fanInNorm[index] ?? 0) + 0.3 * (churnNorm[index] ?? 0);
21:     const score = base * (1 + 0.2 * signal.testGap);
22:     return { name: signal.name, score };
23:   });
24: }
25: 
26: function normalize(values: number[]): number[] {
27:   const min = Math.min(...values);
28:   const max = Math.max(...values);
29:   if (max === min) return values.map(() => 0);
30:   return values.map(value => (value - min) / (max - min));
31: }
```

#### Desglose Línea por Línea
- **Líneas 1-7 (`ModuleSignals`):** Estructura que reúne las 4 señales directas calculadas para un módulo.
- **Líneas 9-12 (`ModuleScore`):** Resultado final que asocia el nombre del módulo con su puntaje compuesto.
- **Líneas 15-17:** Normaliza de forma independiente cada una de las 3 señales aditivas mediante la función `normalize`.
- **Línea 20:** Calcula el puntaje base ponderado asignando pesos normalizados:
  $$\text{base} = 0.35 \cdot \text{cyclomaticNorm} + 0.35 \cdot \text{fanInNorm} + 0.30 \cdot \text{churnNorm}$$
- **Línea 21:** Aplica el modificador multiplicativo de fragilidad:
  $$\text{score} = \text{base} \cdot (1 + 0.20 \cdot \text{signal.testGap})$$
- **Líneas 26-31 (`normalize`):** Implementación clásica de normalización Min-Max:
  $$\frac{v - \min}{\max - \min}$$
  En la línea 29, protege contra división por cero cuando todos los valores son iguales ($\max = \min$), devolviendo `0` de forma segura.

---

### 9.2 Pruebas Automatizadas: `src/modules/scoring/composite-score.test.ts`

```typescript
1:  import { describe, expect, test } from "bun:test";
2:  import { computeCompositeScores } from "./composite-score";
3:  
4:  describe("computeCompositeScores", () => {
5:    test("weights cyclomatic and fan-in higher than churn, and never lets testGap fully decide", () => {
6:      const signals = [
7:        { name: "trivial", cyclomatic: 0, fanIn: 0, churn: 0, testGap: 0 },
8:        { name: "complex-untested", cyclomatic: 10, fanIn: 8, churn: 5, testGap: 1 },
9:      ];
10: 
11:     const [trivial, complex] = computeCompositeScores(signals);
12: 
13:     expect(trivial?.score).toBe(0);
14:     expect(complex?.score).toBeGreaterThan(0);
15:     // base = 0.35*1 + 0.35*1 + 0.3*1 = 1; score = 1 * (1 + 0.2*1) = 1.2
16:     expect(complex?.score).toBeCloseTo(1.2, 5);
17:   });
18: 
19:   test("a module that is complex but well-tested still outranks a trivial one, without the test gap inflating it", () => {
20:     const signals = [
21:       { name: "complex-tested", cyclomatic: 10, fanIn: 8, churn: 5, testGap: 0 },
22:       { name: "trivial", cyclomatic: 0, fanIn: 0, churn: 0, testGap: 0 },
23:     ];
24: 
25:     const [complexTested, trivial] = computeCompositeScores(signals);
26: 
27:     expect(complexTested?.score).toBeCloseTo(1, 5);
28:     expect(trivial?.score).toBe(0);
29:   });
30: });
```

#### Desglose de Casos de Prueba
- **Líneas 5-17 (Test 1):** Valida la combinación de señales normalizadas al máximo ($1.0$), donde la base resulta en $1.0$ y el multiplicador de test gap ($1.0$) eleva la puntuación a exactamente $1.20$.
- **Líneas 19-29 (Test 2):** Verifica que un módulo intrínsecamente complejo pero con pruebas completas ($testGap = 0$) obtenga puntaje base puro ($1.0$) sin penalizaciones, superando sólidamente a módulos triviales ($0.0$).

---

## 10. Asignación de Niveles Tiers (`tiers.ts` y `.test.ts`)

### 10.1 Código de Producción: `src/modules/scoring/tiers.ts`

```typescript
1:  import type { ModuleScore } from "./composite-score";
2:  
3:  export type Tier = "ligero" | "estandar" | "profundo";
4:  
5:  export interface TieredModule extends ModuleScore {
6:    tier: Tier;
7:  }
8:  
9:  export function assignTiers(scores: ModuleScore[]): TieredModule[] {
10:   const sorted = [...scores].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
11:   const total = sorted.length;
12:   const deepCount = Math.max(1, Math.round(total * 0.15));
13:   const standardCount = Math.round(total * 0.35);
14: 
15:   return sorted.map((module, index) => {
16:     let tier: Tier;
17:     if (index < deepCount) tier = "profundo";
18:     else if (index < deepCount + standardCount) tier = "estandar";
19:     else tier = "ligero";
20:     return { ...module, tier };
21:   });
22: }
```

#### Desglose Línea por Línea
- **Línea 3 (`Tier`):** Tipo literal que define los tres niveles del sistema: `"ligero"`, `"estandar"` y `"profundo"`.
- **Línea 10 (`sorted`):** Clave del determinismo (commit `1f3d862`). Ordena los módulos de forma descendente por puntaje (`b.score - a.score`). Si los puntajes son idénticos, ejecuta el desempate determinista `|| a.name.localeCompare(b.name)`.
- **Línea 12 (`deepCount`):** Calcula el ~15% superior (`Math.round(total * 0.15)`). Con `Math.max(1, ...)`, garantiza que incluso en repositorios con un solo módulo, ese módulo sea catalogado como `profundo`.
- **Línea 13 (`standardCount`):** Calcula el ~35% intermedio (`Math.round(total * 0.35)`).
- **Líneas 15-21:** Mapea el arreglo ordenado:
  - Los primeros `deepCount` módulos reciben nivel `"profundo"`.
  - Los siguientes `standardCount` módulos reciben nivel `"estandar"`.
  - El restante ~50% recibe nivel `"ligero"`.

---

### 10.2 Pruebas Automatizadas: `src/modules/scoring/tiers.test.ts`

```typescript
1:  import { describe, expect, test } from "bun:test";
2:  import { assignTiers } from "./tiers";
3:  import type { ModuleScore } from "./composite-score";
4:  
5:  describe("assignTiers", () => {
6:    test("splits 20 modules into roughly 50/35/15 by descending score", () => {
7:      const scores: ModuleScore[] = Array.from({ length: 20 }, (_, index) => ({
8:        name: `module-${index}`,
9:        score: 20 - index,
10:     }));
11: 
12:     const tiered = assignTiers(scores);
13:     const byTier = {
14:       profundo: tiered.filter(m => m.tier === "profundo").map(m => m.name),
15:       estandar: tiered.filter(m => m.tier === "estandar").map(m => m.name),
16:       ligero: tiered.filter(m => m.tier === "ligero").map(m => m.name),
17:     };
18: 
19:     expect(byTier.profundo).toHaveLength(3);  // 15% de 20 = 3
20:     expect(byTier.estandar).toHaveLength(7);  // 35% de 20 = 7
21:     expect(byTier.ligero).toHaveLength(10);   // 50% de 20 = 10
22:     expect(byTier.profundo).toEqual(["module-0", "module-1", "module-2"]);
23:   });
24: 
25:   test("a project with a single module still gets a tier, never crashes", () => {
26:     const scores: ModuleScore[] = [{ name: "only", score: 5 }];
27:     const tiered = assignTiers(scores);
28: 
29:     expect(tiered).toHaveLength(1);
30:     expect(tiered[0]?.tier).toBe("profundo");
31:   });
32: 
33:   test("ties on score break deterministically by name, regardless of input order", () => {
34:     const scoresInOneOrder: ModuleScore[] = [
35:       { name: "zebra", score: 5 },
36:       { name: "mango", score: 5 },
37:       { name: "apple", score: 5 },
38:       { name: "kiwi", score: 5 },
39:     ];
40:     const scoresInAnotherOrder: ModuleScore[] = [
41:       { name: "kiwi", score: 5 },
42:       { name: "apple", score: 5 },
43:       { name: "zebra", score: 5 },
44:       { name: "mango", score: 5 },
45:     ];
46: 
47:     const tieredA = assignTiers(scoresInOneOrder);
48:     const tieredB = assignTiers(scoresInAnotherOrder);
49: 
50:     const namesA = tieredA.map(m => m.name);
51:     const namesB = tieredB.map(m => m.name);
52: 
53:     expect(namesA).toEqual(["apple", "kiwi", "mango", "zebra"]);
54:     expect(namesB).toEqual(["apple", "kiwi", "mango", "zebra"]);
55: 
56:     const tierByNameA = Object.fromEntries(tieredA.map(m => [m.name, m.tier]));
57:     const tierByNameB = Object.fromEntries(tieredB.map(m => [m.name, m.tier]));
58:     expect(tierByNameA).toEqual(tierByNameB);
59:   });
60: });
```

#### Desglose de Casos de Prueba
- **Líneas 6-23 (Test 1):** Valida la proporción percentil exacta en un conjunto de 20 módulos: 3 profundos (15%), 7 estándar (35%) y 10 ligeros (50%).
- **Líneas 25-31 (Test 2):** Comprueba el caso base de 1 módulo, asegurando que se clasifique como `profundo` sin arrojar errores.
- **Líneas 33-59 (Test 3):** Valida la prueba de desempate alfabético: envía módulos empatados en score en dos órdenes de entrada radicalmente distintos, comprobando que la salida sea 100% idéntica en ambos casos (`apple`, `kiwi`, `mango`, `zebra`).

---

## 11. Arnés de Pruebas de Sanidad (`scaffold.test.ts`)

```typescript
1:  import { describe, expect, test } from "bun:test";
2:  
3:  describe("project scaffold", () => {
4:    test("the test runner is wired up", () => {
5:      expect(1 + 1).toBe(2);
6:    });
7:  });
```

#### Desglose Línea por Línea
- **Línea 1:** Importa las funciones del arnés de pruebas de Bun (`describe`, `expect`, `test`).
- **Líneas 3-7:** Prueba de sanidad mínima creada en la Tarea 1 para validar la conexión del ejecutor de pruebas de Bun antes de implementar cualquier lógica del motor.
