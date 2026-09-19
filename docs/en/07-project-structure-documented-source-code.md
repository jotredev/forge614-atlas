# 07 (EN). Project Structure and Source Code Documented Line-by-Line

> **Official Technical Reference Document — Forge614 Ecosystem**  
> **Project:** Forge614 Atlas (Deep Contextualization Orchestrator)  
> **Component:** Plan 1/5 — Deterministic Complexity Scoring Engine  
> **Scope:** Complete audit of all 19 configuration, source, and test files  
> **Standard:** Exhaustive line-by-line documentation with architectural justifications  
> **Sister translation:** [07. Estructura del Proyecto y Código Fuente Documentado Línea por Línea](../es/07-estructura-codigo-linea-por-linea.md)

---

## 1. Complete File Tree and Architectural Responsibilities

```text
forge614-atlas/
├── package.json                         # npm manifest and script configurations
├── tsconfig.json                        # Strict TypeScript compiler options for Bun
├── .gitignore                           # Git exclusions
├── src/
│   ├── index.ts                         # Public library barrel exports
│   └── modules/
│       └── scoring/                     # Feature-based scoring monolith
│           ├── discovery.ts             # Filesystem module discovery and filtering
│           ├── discovery.test.ts        # Unit tests for discovery and stable sorting
│           ├── cyclomatic.ts            # McCabe cyclomatic complexity via TypeScript AST
│           ├── cyclomatic.test.ts       # AST branch detection tests and test exclusion
│           ├── fan-in.ts                # Inter-module relative dependency centrality
│           ├── fan-in.test.ts           # Relative import resolution and uniqueness tests
│           ├── churn.ts                 # Historical Git commit churn tracking (UTF-8)
│           ├── churn.test.ts            # Git log tests and Spanish filename support
│           ├── test-coverage-gap.ts     # Sibling unit test gap evaluation
│           ├── test-coverage-gap.test.ts# Sibling test detection unit tests
│           ├── composite-score.ts       # Min-Max normalization, weights & test penalty
│           ├── composite-score.test.ts  # Balance and non-distortion tests
│           ├── tiers.ts                 # Percentile-based tier classification
│           ├── tiers.test.ts            # Percentile proportions and tie-breaking tests
│           └── scaffold.test.ts         # Test runner harness sanity check
```

---

## 2. Project Configuration Files

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

#### Line-by-Line Analysis
- **Line 2 (`"name": "forge614-atlas"`):** Canonical package identifier across the Forge614 ecosystem.
- **Line 3 (`"version": "0.1.0"`):** Initial semantic version reflecting Plan 1 completion.
- **Line 4 (`"private": true`):** Prevents accidental publication to public npm registries.
- **Line 5 (`"type": "module"`):** Instructs runtime engines to treat all files as native ECMAScript Modules (ESM).
- **Line 6 (`"description": "..."`):** High-level package purpose.
- **Line 7 (`"exports": "./src/index.ts"`):** Defines the formal public entrypoint for downstream consumers, resolving Defect 5 from the branch audit.
- **Lines 8-11 (`"scripts"`):**
  - `"test": "bun test"`: Runs Bun's native test runner.
  - `"typecheck": "tsc --noEmit"`: Executes strict TypeScript compiler static analysis without generating disk artifacts.
- **Lines 12-14 (`"engines"`):** Enforces Bun >= 1.3.8 compatibility.
- **Lines 15-17 (`"devDependencies"`):** Supplies Bun's native runtime type definitions (`Bun.Glob`, etc.).
- **Lines 18-20 (`"dependencies"`):** Pins `typescript` at `5.9.3` to guarantee reproducible AST parsing across environments.

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

#### Line-by-Line Analysis
- **Line 3 (`"target": "ESNext"`):** Emits modern JavaScript targeting Bun's native runtime.
- **Line 4 (`"module": "ESNext"`):** Employs modern ESM module syntax.
- **Line 5 (`"moduleResolution": "bundler"`):** Modern resolution matching bundlers and Bun runtime.
- **Line 6 (`"strict": true`):** Enables strict type-checking, null checks, and disallowed implicit anys.
- **Line 7 (`"skipLibCheck": true`):** Skips type-checking `.d.ts` files in `node_modules`, accelerating compilation.
- **Line 8 (`"esModuleInterop": true`):** Smooths CJS/ESM interop.
- **Line 9 (`"types": ["bun-types"]`):** Globally injects Bun testing and utility types.

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

#### Line-by-Line Analysis
- **Lines 1-4:** Ignores dependencies and build outputs (`dist/`, `build/`, `coverage/`).
- **Line 5 (`*.tgz`):** Excludes release tarballs.
- **Line 6 (`.DS_Store`):** Excludes macOS desktop services metadata.
- **Lines 7-9:** Excludes environment files containing secrets, while preserving `!.env.example`.
- **Line 10 (`.forge614/`):** Shields local personal memory databases (`engram.db`).
- **Line 11 (`.superpowers/sdd/`):** Excludes transient Subagent-Driven Development workspaces (commit `942b063`).

---

## 3. Public Entrypoint (`src/index.ts`)

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

#### Line-by-Line Analysis
- **Lines 1-2:** Re-exports module discovery function, test detection helper, and `ModuleDescriptor` interface.
- **Line 4:** Re-exports single-file and multi-module cyclomatic complexity calculators.
- **Line 6:** Re-exports fan-in dependency centrality calculator.
- **Line 8:** Re-exports Git commit churn calculator.
- **Line 10:** Re-exports sibling unit test coverage gap calculator.
- **Lines 12-13:** Re-exports composite scoring function along with raw `ModuleSignals` and scored `ModuleScore` types.
- **Lines 15-16:** Re-exports percentile tiering routine, `Tier` union type (`"ligero" | "estandar" | "profundo"`), and `TieredModule` interface.

---

## 4. Module Discovery (`discovery.ts` and `discovery.test.ts`)

### 4.1 Production Code: `src/modules/scoring/discovery.ts`

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

#### Line-by-Line Analysis
- **Lines 1-3:** Imports high-performance `Bun.Glob`, `readdirSync`, and `node:path.join`.
- **Lines 5-7 (`EXCLUDED_DIRS`):** Fast $O(1)$ set of forbidden directory names (`node_modules`, `.git`, `.forge614`, etc.).
- **Lines 9-13 (`ModuleDescriptor`):** Data structure for a discovered module.
- **Lines 15-17 (`isTestFile`):** Matches paths against `/\.(test|spec)\.[tj]sx?$/`, ensuring downstream AST/fan-in passes filter tests out.
- **Line 20 (`readdirSync`):** Reads entries using `{ withFileTypes: true }` to query `isDirectory()` without redundant filesystem stats.
- **Line 21:** Filters only directories that are not excluded and do not start with a dot.
- **Line 23 (`.sort`):** Enforces alphabetical directory ordering for determinism.
- **Lines 25-34:** Iterates over directories, lists source files, and admits folders containing $\ge 1$ matching source file.
- **Lines 36-45 (`listSourceFiles`):** Scans with `Glob("**/*.{ts,tsx,js,jsx}")`. Discards any path whose segments match `EXCLUDED_DIRS` or start with a dot (resolving the nested dot-directory defect in commit `ebf7ca3`), and returns files in sorted order.

---

### 4.2 Test Suite: `src/modules/scoring/discovery.test.ts`

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

#### Test Verification Summary
- **Lines 10-22:** Setup and teardown for scratch filesystem sandboxes.
- **Lines 24-29:** Confirms valid source folder discovery.
- **Lines 31-35:** Confirms rejection of non-source folders (`styles`).
- **Lines 37-41:** Confirms exclusion of `node_modules`.
- **Lines 43-52:** Verifies exclusion of nested dot folders (`.cache/generated.ts`).
- **Lines 54-76:** Validates alphabetical sorting under reversed creation order.

---

## 5. Cyclomatic Complexity (`cyclomatic.ts` and `cyclomatic.test.ts`)

### 5.1 Production Code: `src/modules/scoring/cyclomatic.ts`

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

#### Line-by-Line Analysis
- **Line 1 (`import ts from "typescript"`):** Imports TypeScript AST compiler API.
- **Line 6 (`ts.createSourceFile`):** Parses in-memory AST without disk compilation overhead.
- **Line 7 (`complexity = 1`):** Establishes McCabe's single baseline execution path.
- **Lines 10-21:** Traverses AST nodes, incrementing complexity on decision branches: `if`, ternary `? :`, `while`, `do...while`, `for`, `for...in`, `for...of`, `catch`, and `case`.
- **Lines 25-34:** Increments on logical branching operators: `&&`, `||`, and `??`.
- **Line 35:** Recurses across AST children via `ts.forEachChild`.
- **Lines 42-54 (`computeCyclomaticComplexity`):** Sums complexity across all non-test files (`if (isTestFile(filePath)) continue;`) per module into a map.

---

### 5.2 Test Suite: `src/modules/scoring/cyclomatic.test.ts`

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
54:     expect(result.get("auth")).toBe(3);
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
87:     expect(result.get("auth")).toBe(1);
88:     rmSync(root, { recursive: true, force: true });
89:   });
90: });
```

#### Test Verification Summary
- **Lines 9-12:** Verifies baseline score of 1.
- **Lines 14-36:** Verifies precise counting of 8 decision points across constructs.
- **Lines 42-56:** Confirms multi-file aggregation ($1 + 2 = 3$).
- **Lines 58-90:** Confirms branchy test file exclusion from production score.

---

## 6. Fan-In Centrality (`fan-in.ts` and `fan-in.test.ts`)

### 6.1 Production Code: `src/modules/scoring/fan-in.ts`

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

#### Line-by-Line Analysis
- **Lines 6-32 (`extractRelativeImportSpecifiers`):** Extracts import literals from `import`, `export ... from`, and dynamic `require(...)`, filtering by `specifier.startsWith(".")` to ignore third-party packages.
- **Lines 34-47 (`resolveImportPath`):** Resolves candidate paths against `.ts`, `.tsx`, `.js`, `.jsx`, and `index.*` files via `existsSync`.
- **Line 50:** Initializes fan-in map to 0.
- **Line 53 (`targetModuleNames = new Set<string>()`):** Corrects Defect 1 by capturing **unique consumer modules**.
- **Line 55:** Filters out test files.
- **Lines 60-63:** Applies path boundary safety (`modulePath + sep`), preventing collisions between sibling folders sharing prefixes (e.g. `auth` and `auth-legacy`).
- **Line 64:** Excludes intra-module self-imports.
- **Lines 69-71:** Increments fan-in per distinct client module.

---

### 6.2 Test Suite: `src/modules/scoring/fan-in.test.ts`

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
33:     expect(result.get("shared")).toBe(2);
34:     expect(result.get("auth")).toBe(0);
35:     expect(result.get("billing")).toBe(0);
36:     rmSync(root, { recursive: true, force: true });
37:   });
38: 
39:   test("does not count a module importing from itself", () => {
40:     const root = mkdtempSync(join(tmpdir(), "atlas-fanin-self-"));
41:     const modulePath = join(root, "auth");
42:     mkdirSync(modulePath, { recursive: true });
43:     const fileA = join(modulePath, "a.ts");
44:     const fileB = join(modulePath, "b.ts");
45:     writeFileSync(fileA, "export const helper = () => true;");
46:     writeFileSync(fileB, `import { helper } from "./a";\nexport const login = () => helper();`);
47: 
48:     const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [fileA, fileB] }];
49:     const result = computeFanIn(modules);
50:     expect(result.get("auth")).toBe(0);
51:     rmSync(root, { recursive: true, force: true });
52:   });
53: 
54:   test("handles sibling modules with overlapping names correctly (path-prefix collision)", () => {
55:     const root = mkdtempSync(join(tmpdir(), "atlas-fanin-collision-"));
56:     const authPath = join(root, "auth");
57:     const authLegacyPath = join(root, "auth-legacy");
58:     mkdirSync(authPath, { recursive: true });
59:     mkdirSync(authLegacyPath, { recursive: true });
60: 
61:     const authFile = join(authPath, "index.ts");
62:     const authLegacyFile = join(authLegacyPath, "index.ts");
63:     writeFileSync(authFile, "export const newAuth = () => true;");
64:     writeFileSync(authLegacyFile, `import { newAuth } from "../auth";\nexport const legacyAuth = () => newAuth();`);
65: 
66:     const modules: ModuleDescriptor[] = [
67:       { name: "auth", path: authPath, files: [authFile] },
68:       { name: "auth-legacy", path: authLegacyPath, files: [authLegacyFile] },
69:     ];
70: 
71:     const result = computeFanIn(modules);
72:     expect(result.get("auth")).toBe(1);
73:     expect(result.get("auth-legacy")).toBe(0);
74:     rmSync(root, { recursive: true, force: true });
75:   });
76: 
77:   test("counts distinct importing modules, not import statements or files", () => {
78:     const root = mkdtempSync(join(tmpdir(), "atlas-fanin-distinct-"));
79:     const sharedPath = join(root, "shared");
80:     const authPath = join(root, "auth");
81:     mkdirSync(sharedPath, { recursive: true });
82:     mkdirSync(authPath, { recursive: true });
83: 
84:     const sharedFile = join(sharedPath, "logger.ts");
85:     const authFileA = join(authPath, "a.ts");
86:     const authFileB = join(authPath, "b.ts");
87:     const authFileC = join(authPath, "c.ts");
88: 
89:     writeFileSync(sharedFile, "export const log = (message: string) => console.log(message);");
90:     writeFileSync(
91:       authFileA,
92:       `import { log } from "../shared/logger";\nimport { log as log2 } from "../shared/logger";\nexport const a = () => { log("a"); log2("a2"); };`,
93:     );
94:     writeFileSync(authFileB, `import { log } from "../shared/logger";\nexport const b = () => log("b");`);
95:     writeFileSync(authFileC, `import { log } from "../shared/logger";\nexport const c = () => log("c");`);
96: 
97:     const modules: ModuleDescriptor[] = [
98:       { name: "shared", path: sharedPath, files: [sharedFile] },
99:       { name: "auth", path: authPath, files: [authFileA, authFileB, authFileC] },
100:    ];
101:
102:    const result = computeFanIn(modules);
103:    expect(result.get("shared")).toBe(1);
104:    rmSync(root, { recursive: true, force: true });
105:  });
106:
107:  test("does not count imports from a module's own test files", () => {
108:    const root = mkdtempSync(join(tmpdir(), "atlas-fanin-testfile-"));
109:    const sharedPath = join(root, "shared");
110:    const authPath = join(root, "auth");
111:    mkdirSync(sharedPath, { recursive: true });
112:    mkdirSync(authPath, { recursive: true });
113:
114:    const sharedFile = join(sharedPath, "logger.ts");
115:    const authSourceFile = join(authPath, "login.ts");
116:    const authTestFile = join(authPath, "login.test.ts");
117:
118:    writeFileSync(sharedFile, "export const log = (message: string) => console.log(message);");
119:    writeFileSync(authSourceFile, "export const login = () => true;");
120:    writeFileSync(authTestFile, `import { log } from "../shared/logger";\nlog("testing login");`);
121:
122:    const modules: ModuleDescriptor[] = [
123:      { name: "shared", path: sharedPath, files: [sharedFile] },
124:      { name: "auth", path: authPath, files: [authSourceFile, authTestFile] },
125:    ];
126:
127:    const result = computeFanIn(modules);
128:    expect(result.get("shared")).toBe(0);
129:    rmSync(root, { recursive: true, force: true });
130:  });
131:});
```

#### Test Verification Summary
- **Lines 9-37:** Verifies inter-module fan-in centrality.
- **Lines 39-52:** Verifies exclusion of self-imports.
- **Lines 54-75:** Verifies path boundary safety against prefix collisions.
- **Lines 77-105:** Validates distinct module counting over multiple import statements.
- **Lines 107-130:** Validates exclusion of test file imports.

---

## 7. Historical Commit Churn (`churn.ts` and `churn.test.ts`)

### 7.1 Production Code: `src/modules/scoring/churn.ts`

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

#### Line-by-Line Analysis
- **Lines 5-11:** Formal docstring noting that zero-commit or non-git repos throw; graceful fallback is explicitly deferred to Plan 3.
- **Lines 13-16:** Invokes `git -c core.quotepath=false log --format= --name-only`, ensuring non-ASCII filenames (e.g. Spanish characters) are not octal-escaped (commit `b679879`).
- **Lines 17-19:** Handles non-zero exits with descriptive errors.
- **Lines 24-33:** Converts paths to absolute and attributes churn using path boundary validation (`modulePath + sep`).

---

### 7.2 Test Suite: `src/modules/scoring/churn.test.ts`

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

#### Test Verification Summary
- **Lines 15-49:** Tests real git commit history tracking.
- **Lines 51-81:** Tests path boundary collision safety.
- **Lines 83-102:** Tests non-ASCII/Spanish UTF-8 paths (`señales`).

---

## 8. Test Coverage Gap (`test-coverage-gap.ts` and `.test.ts`)

### 8.1 Production Code: `src/modules/scoring/test-coverage-gap.ts`

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

#### Line-by-Line Analysis
- **Lines 4-9 (`hasSiblingTest`):** Extracts file stem and extension, checking for `${base}.test${ext}` or `${base}.spec${ext}`.
- **Line 14:** Filters out test files.
- **Lines 15-18:** Modules with zero production source files receive gap 0.0 safely.
- **Lines 19-20:** Returns $1 - (|withTests| / |sourceFiles|)$ in $[0.0, 1.0]$.

---

### 8.2 Test Suite: `src/modules/scoring/test-coverage-gap.test.ts`

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
20:     expect(result.get("auth")).toBe(0);
21:     rmSync(root, { recursive: true, force: true });
22:   });
23: 
24:   test("returns 1 when no source file has a sibling test", () => {
25:     const root = mkdtempSync(join(tmpdir(), "atlas-gap-uncovered-"));
26:     const modulePath = join(root, "billing");
27:     mkdirSync(modulePath, { recursive: true });
28:     const source = join(modulePath, "charge.ts");
29:     writeFileSync(source, "export const charge = () => true;");
30: 
31:     const modules: ModuleDescriptor[] = [{ name: "billing", path: modulePath, files: [source] }];
32:     const result = computeTestCoverageGap(modules);
33:     expect(result.get("billing")).toBe(1);
34:     rmSync(root, { recursive: true, force: true });
35:   });
36: 
37:   test("returns a fractional gap when only some files are covered", () => {
38:     const root = mkdtempSync(join(tmpdir(), "atlas-gap-partial-"));
39:     const modulePath = join(root, "mixed");
40:     mkdirSync(modulePath, { recursive: true });
41:     const covered = join(modulePath, "a.ts");
42:     const coveredTest = join(modulePath, "a.test.ts");
43:     const uncovered = join(modulePath, "b.ts");
44:     writeFileSync(covered, "export const a = 1;");
45:     writeFileSync(coveredTest, "// test");
46:     writeFileSync(uncovered, "export const b = 2;");
47: 
48:     const modules: ModuleDescriptor[] = [
49:       { name: "mixed", path: modulePath, files: [covered, coveredTest, uncovered] },
50:     ];
51:     const result = computeTestCoverageGap(modules);
52:     expect(result.get("mixed")).toBe(0.5);
53:     rmSync(root, { recursive: true, force: true });
54:   });
55: });
```

#### Test Verification Summary
- **Lines 9-22:** Tests 100% covered module (returns 0).
- **Lines 24-35:** Tests 0% covered module (returns 1).
- **Lines 37-54:** Tests 50% covered module (returns 0.5).

---

## 9. Composite Score (`composite-score.ts` and `.test.ts`)

### 9.1 Production Code: `src/modules/scoring/composite-score.ts`

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

#### Line-by-Line Analysis
- **Lines 1-7 (`ModuleSignals`):** Container for raw module measurements.
- **Lines 9-12 (`ModuleScore`):** Output structure with weighted continuous score.
- **Lines 15-17:** Min-Max normalization across cyclomatic, fan-in, and churn vectors.
- **Line 20:** Linear base score: $0.35 \cdot Cyclo + 0.35 \cdot FanIn + 0.30 \cdot Churn$.
- **Line 21:** Multiplicative test gap modifier: $base \cdot (1 + 0.20 \cdot testGap)$.
- **Lines 26-31 (`normalize`):** Maps values to $[0.0, 1.0]$, safely returning zeros when $\max = \min$.

---

### 9.2 Test Suite: `src/modules/scoring/composite-score.test.ts`

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
12:     expect(trivial?.score).toBe(0);
13:     expect(complex?.score).toBeGreaterThan(0);
14:     expect(complex?.score).toBeCloseTo(1.2, 5);
15:   });
16: 
17:   test("a module that is complex but well-tested still outranks a trivial one, without the test gap inflating it", () => {
18:     const signals = [
19:       { name: "complex-tested", cyclomatic: 10, fanIn: 8, churn: 5, testGap: 0 },
20:       { name: "trivial", cyclomatic: 0, fanIn: 0, churn: 0, testGap: 0 },
21:     ];
22: 
23:     const [complexTested, trivial] = computeCompositeScores(signals);
24:     expect(complexTested?.score).toBeCloseTo(1, 5);
25:     expect(trivial?.score).toBe(0);
26:   });
27: });
```

#### Test Verification Summary
- **Lines 5-15:** Verifies maximum scale penalty ($1.0 \cdot 1.20 = 1.20$).
- **Lines 17-27:** Verifies that well-tested complex code outranks trivial code without test gap distortion.

---

## 10. Tier Assignment (`tiers.ts` and `.test.ts`)

### 10.1 Production Code: `src/modules/scoring/tiers.ts`

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

#### Line-by-Line Analysis
- **Line 3 (`Tier`):** Literal union type: `"ligero" | "estandar" | "profundo"`.
- **Line 10 (`sorted`):** Sorts descending by score, breaking ties alphabetically via `|| a.name.localeCompare(b.name)` (commit `1f3d862`).
- **Line 12 (`deepCount`):** Captures ~15% top modules (at least 1 via `Math.max(1, ...)`).
- **Line 13 (`standardCount`):** Captures ~35% middle modules.
- **Lines 15-21:** Categorizes modules sequentially.

---

### 10.2 Test Suite: `src/modules/scoring/tiers.test.ts`

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
19:     expect(byTier.profundo).toHaveLength(3);  // 15% of 20 = 3
20:     expect(byTier.estandar).toHaveLength(7);  // 35% of 20 = 7
21:     expect(byTier.ligero).toHaveLength(10);   // 50% of 20 = 10
22:     expect(byTier.profundo).toEqual(["module-0", "module-1", "module-2"]);
23:   });
24: 
25:   test("a project with a single module still gets a tier, never crashes", () => {
26:     const scores: ModuleScore[] = [{ name: "only", score: 5 }];
27:     const tiered = assignTiers(scores);
28:     expect(tiered).toHaveLength(1);
29:     expect(tiered[0]?.tier).toBe("profundo");
30:   });
31: 
32:   test("ties on score break deterministically by name, regardless of input order", () => {
33:     const scoresInOneOrder: ModuleScore[] = [
34:       { name: "zebra", score: 5 },
35:       { name: "mango", score: 5 },
36:       { name: "apple", score: 5 },
37:       { name: "kiwi", score: 5 },
38:     ];
39:     const scoresInAnotherOrder: ModuleScore[] = [
40:       { name: "kiwi", score: 5 },
41:       { name: "apple", score: 5 },
42:       { name: "zebra", score: 5 },
43:       { name: "mango", score: 5 },
44:     ];
45: 
46:     const tieredA = assignTiers(scoresInOneOrder);
47:     const tieredB = assignTiers(scoresInAnotherOrder);
48: 
49:     expect(tieredA.map(m => m.name)).toEqual(["apple", "kiwi", "mango", "zebra"]);
50:     expect(tieredB.map(m => m.name)).toEqual(["apple", "kiwi", "mango", "zebra"]);
51:   });
52: });
```

#### Test Verification Summary
- **Lines 6-23:** Verifies 15/35/50% split across 20 modules.
- **Lines 25-30:** Verifies single-module resilience.
- **Lines 32-51:** Verifies deterministic tie-breaking across shuffled inputs.

---

## 11. Test Harness Sanity Check (`scaffold.test.ts`)

```typescript
1:  import { describe, expect, test } from "bun:test";
2:  
3:  describe("project scaffold", () => {
4:    test("the test runner is wired up", () => {
5:      expect(1 + 1).toBe(2);
6:    });
7:  });
```

#### Line-by-Line Analysis
- **Lines 1-7:** Minimal test harness verification confirming Bun test execution prior to feature development.
