# Motor de Puntuación de Complejidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic, AI-free module that scores every folder/module of a
target repository on complexity/importance and assigns it a tier (Ligero / Estándar /
Profundo), the signal Atlas will later use to pick which model and reasoning level a
subagent gets.

**Architecture:** A pure-logic scoring pipeline with five independent signal calculators
(module discovery, cyclomatic complexity, fan-in centrality, git churn, test coverage gap)
that each take the project's module list and return a `Map<string, number>` keyed by
module name. A composite-score step normalizes and weights those maps, and a tiering step
sorts the result into percentile-based tiers. Nothing in this plan touches Engram, AI CLIs,
or the installer — it is a self-contained library other plans will import.

**Tech Stack:** Bun >= 1.3.8, TypeScript, `bun:test`, the `typescript` package (compiler API,
used only for parsing — not for type-checking), Bun's native `Glob`, Node's `node:fs` /
`node:path` / `node:child_process`.

**Spec:** `docs/superpowers/specs/2026-09-18-atlas-orchestrator-design.md` (sections 6–8:
división del trabajo por módulo, señales de puntuación, niveles por percentil).

## Global Constraints

- Bun >= 1.3.8, 100% TypeScript (no plain `.js` source files) — matches the rest of the
  Forge614 ecosystem (`forge614-engram`, `forge614-shell`).
- Feature-oriented modular monolith layout, colocated tests (`file.ts` + `file.test.ts` in
  the same directory) — same convention already used by `forge614-engram`.
- This plan produces pure, deterministic logic only: no network calls, no AI calls, no
  reading of the user's subscription/API credentials. (The project-wide rule that AI
  reasoning effort must never exceed `medio` applies starting in Plan 4, not here — noted
  for context, not enforced by this plan's code.)
- v1 scope: complexity/fan-in signals only parse `.ts`, `.tsx`, `.js`, `.jsx` source files.
  Other file types still contribute to churn and test-coverage-gap, just not to
  cyclomatic/fan-in — this is an explicit, documented scope boundary, not an oversight.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/modules/scoring/scaffold.test.ts`

**Interfaces:**
- Produces: a working `bun test` and `bun run` toolchain for every later task in this plan.

- [ ] **Step 1: Write `package.json`**

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

- [ ] **Step 2: Write `tsconfig.json`**

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

- [ ] **Step 3: Install dependencies**

Run: `bun install`
Expected: lockfile created, no errors.

- [ ] **Step 4: Write the scaffold sanity test**

```typescript
import { describe, expect, test } from "bun:test";

describe("project scaffold", () => {
  test("the test runner is wired up", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the test suite**

Run: `bun test`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json src/modules/scoring/scaffold.test.ts bun.lock
git commit -m "chore: scaffold Bun/TypeScript project"
```

---

### Task 2: Module discovery

**Files:**
- Create: `src/modules/scoring/discovery.ts`
- Test: `src/modules/scoring/discovery.test.ts`

**Interfaces:**
- Produces: `ModuleDescriptor { name: string; path: string; files: string[] }` and
  `discoverModules(root: string): ModuleDescriptor[]` — every later task in this plan
  consumes `ModuleDescriptor[]`.

- [ ] **Step 1: Write the failing test**

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverModules } from "./discovery";

describe("discoverModules", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "atlas-discovery-"));
    mkdirSync(join(root, "src", "auth"), { recursive: true });
    writeFileSync(join(root, "src", "auth", "login.ts"), "export const login = () => true;");
    mkdirSync(join(root, "src", "styles"), { recursive: true });
    writeFileSync(join(root, "src", "styles", "index.css"), "body { margin: 0; }");
    mkdirSync(join(root, "node_modules", "some-package"), { recursive: true });
    writeFileSync(join(root, "node_modules", "some-package", "index.js"), "module.exports = {};");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("finds top-level folders that contain source files", () => {
    const modules = discoverModules(join(root, "src"));
    expect(modules).toHaveLength(1);
    expect(modules[0]?.name).toBe("auth");
    expect(modules[0]?.files).toEqual([join(root, "src", "auth", "login.ts")]);
  });

  test("excludes folders with no ts/tsx/js/jsx files", () => {
    const modules = discoverModules(join(root, "src"));
    const names = modules.map(module => module.name);
    expect(names).not.toContain("styles");
  });

  test("ignores node_modules even when scanning from the repo root", () => {
    const modules = discoverModules(root);
    const names = modules.map(module => module.name);
    expect(names).not.toContain("node_modules");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/modules/scoring/discovery.test.ts`
Expected: FAIL with "Cannot find module './discovery'" (or similar).

- [ ] **Step 3: Write the implementation**

```typescript
import { Glob } from "bun";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "coverage", ".next", "out", ".forge614",
]);

export interface ModuleDescriptor {
  name: string;
  path: string;
  files: string[];
}

export function discoverModules(root: string): ModuleDescriptor[] {
  const topLevelDirs = readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith("."))
    .map(entry => entry.name);

  const modules: ModuleDescriptor[] = [];
  for (const dirName of topLevelDirs) {
    const modulePath = join(root, dirName);
    const files = listSourceFiles(modulePath);
    if (files.length > 0) {
      modules.push({ name: dirName, path: modulePath, files });
    }
  }
  return modules;
}

function listSourceFiles(dir: string): string[] {
  const glob = new Glob("**/*.{ts,tsx,js,jsx}");
  const matches: string[] = [];
  for (const relativePath of glob.scanSync({ cwd: dir, onlyFiles: true })) {
    const segments = relativePath.split("/");
    if (segments.some(segment => EXCLUDED_DIRS.has(segment))) continue;
    matches.push(join(dir, relativePath));
  }
  return matches;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/modules/scoring/discovery.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/scoring/discovery.ts src/modules/scoring/discovery.test.ts
git commit -m "feat: discover project modules for complexity scoring"
```

---

### Task 3: Cyclomatic complexity

**Files:**
- Create: `src/modules/scoring/cyclomatic.ts`
- Test: `src/modules/scoring/cyclomatic.test.ts`

**Interfaces:**
- Consumes: `ModuleDescriptor` from `./discovery`.
- Produces: `fileCyclomaticComplexity(sourceText: string, fileName?: string): number` and
  `computeCyclomaticComplexity(modules: ModuleDescriptor[]): Map<string, number>` — consumed
  by Task 7 (composite score).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileCyclomaticComplexity, computeCyclomaticComplexity } from "./cyclomatic";
import type { ModuleDescriptor } from "./discovery";

describe("fileCyclomaticComplexity", () => {
  test("a function with no branching has the baseline complexity of 1", () => {
    const source = "export function identity(value: number) { return value; }";
    expect(fileCyclomaticComplexity(source)).toBe(1);
  });

  test("counts if/else-if, loops, switch cases, and logical operators (never default)", () => {
    const source = `
      export function classify(value: number, items: number[]): string {
        if (value > 10) {
          return "big";
        } else if (value > 0) {
          return "small";
        }
        for (const item of items) {
          if (item < 0 && value > 0) continue;
        }
        switch (value) {
          case 1:
            return "one";
          case 2:
            return "two";
          default:
            return "other";
        }
      }
    `;
    expect(fileCyclomaticComplexity(source)).toBe(8);
  });
});

describe("computeCyclomaticComplexity", () => {
  let root: string;

  test("sums complexity across every file in a module", () => {
    root = mkdtempSync(join(tmpdir(), "atlas-cyclomatic-"));
    const modulePath = join(root, "auth");
    mkdirSync(modulePath, { recursive: true });
    const fileA = join(modulePath, "a.ts");
    const fileB = join(modulePath, "b.ts");
    writeFileSync(fileA, "export function identity(value: number) { return value; }");
    writeFileSync(fileB, "export function flag(value: boolean) { if (value) return 1; return 0; }");

    const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [fileA, fileB] }];
    const result = computeCyclomaticComplexity(modules);

    expect(result.get("auth")).toBe(3); // 1 (identity) + 2 (flag: baseline 1 + 1 if)
    rmSync(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/modules/scoring/cyclomatic.test.ts`
Expected: FAIL with "Cannot find module './cyclomatic'".

- [ ] **Step 3: Write the implementation**

```typescript
import ts from "typescript";
import { readFileSync } from "node:fs";
import type { ModuleDescriptor } from "./discovery";

export function fileCyclomaticComplexity(sourceText: string, fileName = "module.ts"): number {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  let complexity = 1;

  function visit(node: ts.Node): void {
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.CaseClause:
        complexity++;
        break;
      default:
        break;
    }
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      ) {
        complexity++;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return complexity;
}

export function computeCyclomaticComplexity(modules: ModuleDescriptor[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const module of modules) {
    let total = 0;
    for (const filePath of module.files) {
      const sourceText = readFileSync(filePath, "utf8");
      total += fileCyclomaticComplexity(sourceText, filePath);
    }
    result.set(module.name, total);
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/modules/scoring/cyclomatic.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/scoring/cyclomatic.ts src/modules/scoring/cyclomatic.test.ts
git commit -m "feat: compute cyclomatic complexity per module"
```

---

### Task 4: Fan-in centrality

**Files:**
- Create: `src/modules/scoring/fan-in.ts`
- Test: `src/modules/scoring/fan-in.test.ts`

**Interfaces:**
- Consumes: `ModuleDescriptor` from `./discovery`.
- Produces: `computeFanIn(modules: ModuleDescriptor[]): Map<string, number>` — consumed by
  Task 7 (composite score).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeFanIn } from "./fan-in";
import type { ModuleDescriptor } from "./discovery";

describe("computeFanIn", () => {
  test("counts how many other modules import from this one", () => {
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

    expect(result.get("shared")).toBe(2);
    expect(result.get("auth")).toBe(0);
    expect(result.get("billing")).toBe(0);

    rmSync(root, { recursive: true, force: true });
  });

  test("does not count a module importing from itself", () => {
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/modules/scoring/fan-in.test.ts`
Expected: FAIL with "Cannot find module './fan-in'".

- [ ] **Step 3: Write the implementation**

```typescript
import ts from "typescript";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ModuleDescriptor } from "./discovery";

export function extractRelativeImportSpecifiers(sourceText: string, fileName = "module.ts"): string[] {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0] as ts.Expression)
    ) {
      specifiers.push((node.arguments[0] as ts.StringLiteral).text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  return specifiers.filter(specifier => specifier.startsWith("."));
}

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

export function computeFanIn(modules: ModuleDescriptor[]): Map<string, number> {
  const fanIn = new Map(modules.map(module => [module.name, 0]));

  for (const fromModule of modules) {
    for (const filePath of fromModule.files) {
      const sourceText = readFileSync(filePath, "utf8");
      for (const specifier of extractRelativeImportSpecifiers(sourceText, filePath)) {
        const resolvedPath = resolveImportPath(filePath, specifier);
        if (!resolvedPath) continue;
        const toModule = modules.find(module => resolvedPath.startsWith(module.path));
        if (toModule && toModule.name !== fromModule.name) {
          fanIn.set(toModule.name, (fanIn.get(toModule.name) ?? 0) + 1);
        }
      }
    }
  }
  return fanIn;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/modules/scoring/fan-in.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/scoring/fan-in.ts src/modules/scoring/fan-in.test.ts
git commit -m "feat: compute fan-in centrality per module"
```

---

### Task 5: Git churn

**Files:**
- Create: `src/modules/scoring/churn.ts`
- Test: `src/modules/scoring/churn.test.ts`

**Interfaces:**
- Consumes: `ModuleDescriptor` from `./discovery`.
- Produces: `computeChurn(repoRoot: string, modules: ModuleDescriptor[]): Map<string, number>`
  — consumed by Task 7 (composite score).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeChurn } from "./churn";
import type { ModuleDescriptor } from "./discovery";

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

describe("computeChurn", () => {
  test("counts commits that touched files inside each module", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-churn-"));
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "Test"]);

    const authPath = join(root, "auth");
    const billingPath = join(root, "billing");
    mkdirSync(authPath, { recursive: true });
    mkdirSync(billingPath, { recursive: true });
    const authFile = join(authPath, "login.ts");
    const billingFile = join(billingPath, "charge.ts");

    writeFileSync(authFile, "export const login = () => true;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "add login"]);

    writeFileSync(authFile, "export const login = () => false;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "flip login"]);

    writeFileSync(billingFile, "export const charge = () => true;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "add charge"]);

    const modules: ModuleDescriptor[] = [
      { name: "auth", path: authPath, files: [authFile] },
      { name: "billing", path: billingPath, files: [billingFile] },
    ];

    const result = computeChurn(root, modules);

    expect(result.get("auth")).toBe(2);
    expect(result.get("billing")).toBe(1);

    rmSync(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/modules/scoring/churn.test.ts`
Expected: FAIL with "Cannot find module './churn'".

- [ ] **Step 3: Write the implementation**

```typescript
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { ModuleDescriptor } from "./discovery";

export function computeChurn(repoRoot: string, modules: ModuleDescriptor[]): Map<string, number> {
  const result = spawnSync("git", ["log", "--format=", "--name-only"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git log failed in ${repoRoot}: ${result.stderr}`);
  }

  const churn = new Map(modules.map(module => [module.name, 0]));
  const touchedFiles = result.stdout.split("\n").map(line => line.trim()).filter(Boolean);

  for (const relativeFile of touchedFiles) {
    const absolutePath = join(repoRoot, relativeFile);
    const matchedModule = modules.find(module => absolutePath.startsWith(module.path));
    if (matchedModule) {
      churn.set(matchedModule.name, (churn.get(matchedModule.name) ?? 0) + 1);
    }
  }
  return churn;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/modules/scoring/churn.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/modules/scoring/churn.ts src/modules/scoring/churn.test.ts
git commit -m "feat: compute git churn per module"
```

---

### Task 6: Test coverage gap

**Files:**
- Create: `src/modules/scoring/test-coverage-gap.ts`
- Test: `src/modules/scoring/test-coverage-gap.test.ts`

**Interfaces:**
- Consumes: `ModuleDescriptor` from `./discovery`.
- Produces: `computeTestCoverageGap(modules: ModuleDescriptor[]): Map<string, number>`
  (0 = every source file has a sibling test, 1 = none do) — consumed by Task 7.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeTestCoverageGap } from "./test-coverage-gap";
import type { ModuleDescriptor } from "./discovery";

describe("computeTestCoverageGap", () => {
  test("returns 0 when every source file has a sibling .test file", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-gap-covered-"));
    const modulePath = join(root, "auth");
    mkdirSync(modulePath, { recursive: true });
    const source = join(modulePath, "login.ts");
    const testFile = join(modulePath, "login.test.ts");
    writeFileSync(source, "export const login = () => true;");
    writeFileSync(testFile, "// test");

    const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [source, testFile] }];
    const result = computeTestCoverageGap(modules);

    expect(result.get("auth")).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  test("returns 1 when no source file has a sibling test", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-gap-uncovered-"));
    const modulePath = join(root, "billing");
    mkdirSync(modulePath, { recursive: true });
    const source = join(modulePath, "charge.ts");
    writeFileSync(source, "export const charge = () => true;");

    const modules: ModuleDescriptor[] = [{ name: "billing", path: modulePath, files: [source] }];
    const result = computeTestCoverageGap(modules);

    expect(result.get("billing")).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  test("returns a fractional gap when only some files are covered", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-gap-partial-"));
    const modulePath = join(root, "mixed");
    mkdirSync(modulePath, { recursive: true });
    const covered = join(modulePath, "a.ts");
    const coveredTest = join(modulePath, "a.test.ts");
    const uncovered = join(modulePath, "b.ts");
    writeFileSync(covered, "export const a = 1;");
    writeFileSync(coveredTest, "// test");
    writeFileSync(uncovered, "export const b = 2;");

    const modules: ModuleDescriptor[] = [
      { name: "mixed", path: modulePath, files: [covered, coveredTest, uncovered] },
    ];
    const result = computeTestCoverageGap(modules);

    expect(result.get("mixed")).toBe(0.5);
    rmSync(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/modules/scoring/test-coverage-gap.test.ts`
Expected: FAIL with "Cannot find module './test-coverage-gap'".

- [ ] **Step 3: Write the implementation**

```typescript
import { existsSync } from "node:fs";
import type { ModuleDescriptor } from "./discovery";

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[tj]sx?$/.test(filePath);
}

function hasSiblingTest(filePath: string): boolean {
  const dotIndex = filePath.lastIndexOf(".");
  const base = filePath.slice(0, dotIndex);
  const ext = filePath.slice(dotIndex);
  return existsSync(`${base}.test${ext}`) || existsSync(`${base}.spec${ext}`);
}

export function computeTestCoverageGap(modules: ModuleDescriptor[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const module of modules) {
    const sourceFiles = module.files.filter(file => !isTestFile(file));
    if (sourceFiles.length === 0) {
      result.set(module.name, 0);
      continue;
    }
    const withTests = sourceFiles.filter(hasSiblingTest);
    result.set(module.name, 1 - withTests.length / sourceFiles.length);
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/modules/scoring/test-coverage-gap.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/scoring/test-coverage-gap.ts src/modules/scoring/test-coverage-gap.test.ts
git commit -m "feat: compute test coverage gap per module"
```

---

### Task 7: Composite score

**Files:**
- Create: `src/modules/scoring/composite-score.ts`
- Test: `src/modules/scoring/composite-score.test.ts`

**Interfaces:**
- Consumes: `ModuleSignals { name: string; cyclomatic: number; fanIn: number; churn: number;
  testGap: number }[]` — one merged entry per module. Merging the four `Map<string, number>`
  results from Tasks 3–6 into this shape is the caller's job (done in Plan 3, when the CLI
  wires the whole pipeline together against a real repo) — this task only consumes the
  already-merged array.
- Produces: `ModuleScore { name: string; score: number }` and
  `computeCompositeScores(signals: ModuleSignals[]): ModuleScore[]` — consumed by Task 8.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "bun:test";
import { computeCompositeScores } from "./composite-score";

describe("computeCompositeScores", () => {
  test("weights cyclomatic and fan-in higher than churn, and never lets testGap fully decide", () => {
    const signals = [
      { name: "trivial", cyclomatic: 0, fanIn: 0, churn: 0, testGap: 0 },
      { name: "complex-untested", cyclomatic: 10, fanIn: 8, churn: 5, testGap: 1 },
    ];

    const [trivial, complex] = computeCompositeScores(signals);

    expect(trivial?.score).toBe(0);
    expect(complex?.score).toBeGreaterThan(0);
    // base = 0.35*1 + 0.35*1 + 0.3*1 = 1; score = 1 * (1 + 0.2*1) = 1.2
    expect(complex?.score).toBeCloseTo(1.2, 5);
  });

  test("a module that is complex but well-tested still outranks a trivial one, without the test gap inflating it", () => {
    const signals = [
      { name: "complex-tested", cyclomatic: 10, fanIn: 8, churn: 5, testGap: 0 },
      { name: "trivial", cyclomatic: 0, fanIn: 0, churn: 0, testGap: 0 },
    ];

    const [complexTested, trivial] = computeCompositeScores(signals);

    expect(complexTested?.score).toBeCloseTo(1, 5);
    expect(trivial?.score).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/modules/scoring/composite-score.test.ts`
Expected: FAIL with "Cannot find module './composite-score'".

- [ ] **Step 3: Write the implementation**

```typescript
export interface ModuleSignals {
  name: string;
  cyclomatic: number;
  fanIn: number;
  churn: number;
  testGap: number;
}

export interface ModuleScore {
  name: string;
  score: number;
}

export function computeCompositeScores(signals: ModuleSignals[]): ModuleScore[] {
  const cyclomaticNorm = normalize(signals.map(s => s.cyclomatic));
  const fanInNorm = normalize(signals.map(s => s.fanIn));
  const churnNorm = normalize(signals.map(s => s.churn));

  return signals.map((signal, index) => {
    const base = 0.35 * (cyclomaticNorm[index] ?? 0) + 0.35 * (fanInNorm[index] ?? 0) + 0.3 * (churnNorm[index] ?? 0);
    const score = base * (1 + 0.2 * signal.testGap);
    return { name: signal.name, score };
  });
}

function normalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0);
  return values.map(value => (value - min) / (max - min));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/modules/scoring/composite-score.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/scoring/composite-score.ts src/modules/scoring/composite-score.test.ts
git commit -m "feat: compute weighted composite complexity score per module"
```

---

### Task 8: Percentile tiering

**Files:**
- Create: `src/modules/scoring/tiers.ts`
- Test: `src/modules/scoring/tiers.test.ts`

**Interfaces:**
- Consumes: `ModuleScore[]` from `./composite-score`.
- Produces: `Tier = "ligero" | "estandar" | "profundo"` and
  `TieredModule { name: string; score: number; tier: Tier }` and
  `assignTiers(scores: ModuleScore[]): TieredModule[]` — this is what Plan 3 (Núcleo del
  CLI) will call to decide which model/reasoning level each module's subagent gets.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "bun:test";
import { assignTiers } from "./tiers";
import type { ModuleScore } from "./composite-score";

describe("assignTiers", () => {
  test("splits 20 modules into roughly 50/35/15 by descending score", () => {
    const scores: ModuleScore[] = Array.from({ length: 20 }, (_, index) => ({
      name: `module-${index}`,
      score: 20 - index, // module-0 has the highest score, module-19 the lowest
    }));

    const tiered = assignTiers(scores);
    const byTier = {
      profundo: tiered.filter(m => m.tier === "profundo").map(m => m.name),
      estandar: tiered.filter(m => m.tier === "estandar").map(m => m.name),
      ligero: tiered.filter(m => m.tier === "ligero").map(m => m.name),
    };

    expect(byTier.profundo).toHaveLength(3); // round(20 * 0.15)
    expect(byTier.estandar).toHaveLength(7); // round(20 * 0.35)
    expect(byTier.ligero).toHaveLength(10);
    expect(byTier.profundo).toEqual(["module-0", "module-1", "module-2"]);
  });

  test("a project with a single module still gets a tier, never crashes", () => {
    const scores: ModuleScore[] = [{ name: "only", score: 5 }];
    const tiered = assignTiers(scores);

    expect(tiered).toHaveLength(1);
    expect(tiered[0]?.tier).toBe("profundo");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/modules/scoring/tiers.test.ts`
Expected: FAIL with "Cannot find module './tiers'".

- [ ] **Step 3: Write the implementation**

```typescript
import type { ModuleScore } from "./composite-score";

export type Tier = "ligero" | "estandar" | "profundo";

export interface TieredModule extends ModuleScore {
  tier: Tier;
}

export function assignTiers(scores: ModuleScore[]): TieredModule[] {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const total = sorted.length;
  const deepCount = Math.max(1, Math.round(total * 0.15));
  const standardCount = Math.round(total * 0.35);

  return sorted.map((module, index) => {
    let tier: Tier;
    if (index < deepCount) tier = "profundo";
    else if (index < deepCount + standardCount) tier = "estandar";
    else tier = "ligero";
    return { ...module, tier };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/modules/scoring/tiers.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite for this plan**

Run: `bun test src/modules/scoring/`
Expected: PASS (all tests from Tasks 1–8, 17 tests total).

- [ ] **Step 6: Commit**

```bash
git add src/modules/scoring/tiers.ts src/modules/scoring/tiers.test.ts
git commit -m "feat: assign percentile-based complexity tiers"
```
