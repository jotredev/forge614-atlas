# 07.04 (EN) Dependency Fan-In Centrality (fan-in.ts and test)

> **Architecture and Code Reference — Forge614 Atlas Ecosystem**  
> **Scope:** `src/modules/scoring/fan-in.ts` and `fan-in.test.ts`  
> **Sister Translation:** [07.04 Centralidad Fan-In de Dependencias](../../es/07-estructura/04-centralidad-fan-in.md)

---

## 1. Architectural Rationale

Fan-In centrality quantifies the in-degree of each module in the directed dependency graph of the project. The more external modules rely on a given module, the higher its systemic blast radius: a bug or backward-incompatible interface change in it triggers cascading failures across the system.

### Critical Algorithmic Guarantees
1. **Edge Uniqueness (Set Deduplication):** If consumer module `orders` has 10 files and every file imports utilities from `auth`, `auth`'s Fan-In increments by exactly **1**. We measure module-to-module architectural dependency, not raw import statements.
2. **Exclusion of Internal Cohesion:** If a file inside `auth` imports a sibling file inside `auth`, this is internal modularity and never counts as external Fan-In.
3. **Strict Directory Boundary (`modulePath + sep`):** When resolving relative import paths, exact match or path prefix followed by the OS path separator is enforced. This prevents prefix collisions between similarly named directories like `auth` and `auth-legacy`.
4. **TypeScript Extension Resolution:** Resolves candidate paths without extension, with `.ts`, `.tsx`, `.js`, `.jsx`, or index barrel files (`index.ts`, `index.tsx`).
5. **Test File Exclusion:** Test assertions importing helper utilities are ignored to preserve production architecture.

### Real-World Analogy
> It is like a city's primary water aqueduct versus a private residence's kitchen tap: if the aqueduct breaks, thousands of homes and hospitals shut down instantly (high Fan-In). If a kitchen faucet leaks, only that single household is impacted (low Fan-In).

---

## 2. Documented Source Code: `src/modules/scoring/fan-in.ts`

```typescript
import ts from "typescript";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { isTestFile, type ModuleDescriptor } from "./discovery";

/**
 * Extracts all relative import or export specifiers within a TypeScript/JavaScript
 * source file using its AST.
 * 
 * Supported syntactic forms:
 * 1. Static ESM imports: `import { x } from "./path"`
 * 2. ESM re-exports: `export { y } from "../other/module"`
 * 3. Dynamic CommonJS calls: `const z = require("./module")`
 * 
 * Filtering Rule:
 * - Returns only specifiers starting with a dot (`.` or `..`),
 *   identifying internal project dependencies.
 * - Ignores external packages (e.g., `"typescript"`, `"react"`, `"node:path"`),
 *   which do not belong to internal first-level modules.
 * 
 * @param sourceText - Source code text
 * @param fileName - Virtual filename for compiler context
 * @returns Array of relative import specifier strings
 */
export function extractRelativeImportSpecifiers(sourceText: string, fileName = "module.ts"): string[] {
  // 1. Build AST for the target file
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];

  // 2. Recursive AST traversal function
  function visit(node: ts.Node): void {
    // 3. Inspect ESM import and export declarations
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    // 4. Inspect CommonJS require() calls
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0] as ts.Expression)
    ) {
      specifiers.push((node.arguments[0] as ts.StringLiteral).text);
    }

    // 5. Continue traversal to children
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // 6. Filter exclusively internal relative specifiers (starting with '.')
  return specifiers.filter(specifier => specifier.startsWith("."));
}

/**
 * Resolves a relative import specifier to its actual on-disk physical file.
 * 
 * TypeScript Path Resolution:
 * - Developers write `import { x } from "../utils/helper"`, but on disk
 *   the file is named `helper.ts`, `helper.tsx`, or `helper/index.ts`.
 * 
 * Candidate Resolution Algorithm:
 * 1. Computes absolute base path resolving `specifier` relative to `fromFile` directory.
 * 2. Generates candidate paths in order of likelihood:
 *    - Exact base path (if extension is explicit).
 *    - Base with extensions: `.ts`, `.tsx`, `.js`, `.jsx`.
 *    - Directory index resolution: `/index.ts`, `/index.tsx`, `/index.js`.
 * 3. Tests existence on disk using `existsSync`.
 * 4. Returns the first matching path, or `null` if none exists.
 * 
 * @param fromFile - Absolute path of the importing file
 * @param specifier - Relative specifier string (e.g., `"./auth/jwt"`)
 * @returns Absolute resolved file path or `null`
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
 * Computes Fan-In Centrality for each module in the project.
 * 
 * Graph Theory Definition:
 * - Fan-In represents the in-degree of a module in the directed dependency graph.
 * - Measures how many OTHER distinct modules depend directly on services or types
 *   exposed by this module. High Fan-In indicates a structural core module.
 * 
 * Key Architectural Invariants:
 * 1. Edge Uniqueness (Set Deduplication):
 *    If module `orders` has 5 distinct files and each imports 3 functions from
 *    `users`, `users`'s Fan-In from `orders` must be exactly 1.
 *    Individual import statements are not counted, only the module-level dependency.
 * 2. Self-Import Exclusion:
 *    Internal cross-file imports inside a module are excluded (`toModule.name !== fromModule.name`).
 * 3. Strict Directory Boundary (`modulePath + sep`):
 *    Prevents false matches when directory names share prefixes (`auth` vs `auth-legacy`).
 * 4. Test File Exclusion:
 *    Test files are skipped to avoid inflating production dependency topology.
 * 
 * @param modules - Discovered module list
 * @returns Map associating each module name with its Fan-In centrality score
 */
export function computeFanIn(modules: ModuleDescriptor[]): Map<string, number> {
  // 1. Initialize fan-in map with 0 for all known modules
  const fanIn = new Map(modules.map(module => [module.name, 0]));

  // 2. Iterate over each importing module
  for (const fromModule of modules) {
    // Set tracking target modules imported by this consumer module
    const targetModuleNames = new Set<string>();

    // 3. Inspect all production files in the importing module
    for (const filePath of fromModule.files) {
      if (isTestFile(filePath)) {
        continue;
      }

      const sourceText = readFileSync(filePath, "utf8");

      // 4. Extract relative specifiers
      for (const specifier of extractRelativeImportSpecifiers(sourceText, filePath)) {
        const resolvedPath = resolveImportPath(filePath, specifier);
        if (!resolvedPath) {
          continue;
        }

        // 5. Determine destination module
        const toModule = modules.find(module => {
          const modulePath = module.path;
          return resolvedPath === modulePath || resolvedPath.startsWith(modulePath + sep);
        });

        // 6. Record external dependency edge
        if (toModule && toModule.name !== fromModule.name) {
          targetModuleNames.add(toModule.name);
        }
      }
    }

    // 7. Increment fan-in for each reached target module
    for (const name of targetModuleNames) {
      fanIn.set(name, (fanIn.get(name) ?? 0) + 1);
    }
  }

  return fanIn;
}
```

---

## 3. Automated Tests: `src/modules/scoring/fan-in.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeFanIn } from "./fan-in";
import type { ModuleDescriptor } from "./discovery";

describe("computeFanIn", () => {
  test("counts how many other modules import from this one", () => {
    // Scenario: 'shared' is imported by 'auth' and 'billing'.
    // Expected Fan-In for 'shared' is 2.
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

    // 'shared' has 2 consumer modules; 'auth' and 'billing' have 0
    expect(result.get("shared")).toBe(2);
    expect(result.get("auth")).toBe(0);
    expect(result.get("billing")).toBe(0);

    rmSync(root, { recursive: true, force: true });
  });

  test("does not count a module importing from itself", () => {
    // Scenario: Inside 'auth', fileB imports fileA.
    // Internal cohesion must never increment external Fan-In.
    const root = mkdtempSync(join(tmpdir(), "atlas-fanin-self-"));
    const modulePath = join(root, "auth");
    mkdirSync(modulePath, { recursive: true });
    const fileA = join(modulePath, "a.ts");
    const fileB = join(modulePath, "b.ts");
    writeFileSync(fileA, "export const helper = () => true;");
    writeFileSync(fileB, `import { helper } from "./a";\nexport const login = () => helper();`);

    const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [fileA, fileB] }];
    const result = computeFanIn(modules);

    expect(result.get("auth")).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  test("handles sibling modules with overlapping names correctly (path-prefix collision)", () => {
    // Scenario: Prefix collision between 'auth' and 'auth-legacy'.
    // If 'auth-legacy' imports 'auth', only 'auth' gets +1.
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
    // Scenario: Module 'auth' has 3 files and 4 import statements targeting 'shared'.
    // Edge count between 'auth' and 'shared' must be strictly 1, not 4 or 3.
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

    expect(result.get("shared")).toBe(1);

    rmSync(root, { recursive: true, force: true });
  });

  test("does not count imports from a module's own test files", () => {
    // Scenario: 'auth/login.test.ts' imports 'shared', but production 'login.ts' does not.
    // Fan-In for 'shared' must remain 0.
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
