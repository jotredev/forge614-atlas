# 07.02 (EN) Module Discovery (discovery.ts and test)

> **Architecture and Code Reference — Forge614 Atlas Ecosystem**  
> **Scope:** `src/modules/scoring/discovery.ts` and `discovery.test.ts`  
> **Sister Translation:** [07.02 Descubrimiento de Módulos (Discovery)](../../es/07-estructura/02-descubrimiento-discovery.md)

---

## 1. Architectural Rationale

The initial stage of Atlas is to map the project structure deterministically, discovering which first-level directories qualify as architectural modules and enumerating their source code files:
1. Skips standard tooling directories (`node_modules`, `.git`, `dist`, `build`, etc.) via an immutable $O(1)$ set.
2. Sorts folders and files using strict lexicographical `localeCompare`, guaranteeing identical outputs on macOS, Linux, or CI runners.
3. Distinguishes automated unit and spec tests (`.test.ts`, `.spec.ts`) via regular expressions to prevent test code from polluting production metrics.

### Real-World Analogy
> It is like a city postal survey: the inspector navigates only inhabited residential and commercial addresses, ignoring scrap yards (`node_modules`) and underground subway shafts (`.git`), registering precise street numbers to visit later.

---

## 2. Documented Source Code: `src/modules/scoring/discovery.ts`

```typescript
import { Glob } from "bun";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Immutable in-memory set (O(1) lookup) containing standard system folders
 * that must never be treated as business modules or recursively traversed,
 * preventing infinite loops, compiled artifacts, and ephemeral caches.
 */
const EXCLUDED_DIRS = new Set([
  "node_modules", // External dependencies installed by package managers
  ".git",         // Git version control internal database
  "dist",         // Bundled compilation outputs
  "build",        // Intermediate build artifacts
  "coverage",     // Automated test coverage reports
  ".next",        // Next.js framework build cache
  "out",          // Static frontend export directories
  ".forge614",    // Forge614 Engram persistent local state
]);

/**
 * Canonical descriptor of a discovered on-disk module.
 */
export interface ModuleDescriptor {
  /** First-level root directory name defining the module */
  name: string;
  /** Absolute filesystem path to the module directory */
  path: string;
  /** Exhaustive, alphabetically sorted list of source TypeScript/JavaScript files */
  files: string[];
}

/**
 * Deterministic predicate to detect whether a file is a unit or integration test.
 * 
 * Matching Rule:
 * - Allowed extensions: .test.ts, .test.tsx, .test.js, .test.jsx, .spec.ts, .spec.tsx, etc.
 * - Used by cyclomatic and fan-in engines to exclude test assertions and avoid
 *   artificially inflating production code complexity.
 * 
 * @param filePath - Relative or absolute path of the file to inspect
 * @returns `true` if the filename ends with `.(test|spec).[tj]sx?`
 */
export function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[tj]sx?$/.test(filePath);
}

/**
 * Top-level module discovery algorithm.
 * 
 * Step-by-step:
 * 1. Synchronously reads all directory entries at `root`.
 * 2. Filters exclusively directory entries, discarding blacklisted directories (`EXCLUDED_DIRS`)
 *    and hidden dot-directories.
 * 3. Sorts directory names alphabetically using `localeCompare` for strict determinism.
 * 4. For each candidate directory, recursively scans all source code files.
 * 5. If the directory contains at least 1 valid source file, registers it as a `ModuleDescriptor`.
 * 
 * @param root - Absolute path to the project repository root
 * @returns List of discovered modules sorted alphabetically by name
 */
export function discoverModules(root: string): ModuleDescriptor[] {
  // 1. Read first-level directory entries with file types (avoids redundant statSync calls)
  const topLevelDirs = readdirSync(root, { withFileTypes: true })
    // 2. Filter only directories not in blacklist and not starting with a dot
    .filter(entry => entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith("."))
    // 3. Extract directory name
    .map(entry => entry.name)
    // 4. Stable lexicographical sort to eliminate OS-dependent filesystem variations
    .sort((a, b) => a.localeCompare(b));

  const modules: ModuleDescriptor[] = [];

  // 5. Inspect each candidate folder to verify presence of actual code
  for (const dirName of topLevelDirs) {
    const modulePath = join(root, dirName);
    const files = listSourceFiles(modulePath);

    // Only qualify as a functional module if it contains at least one .ts, .tsx, .js, or .jsx file
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
 * Recursively scans a directory searching for TypeScript and JavaScript source files.
 * 
 * Step-by-step:
 * 1. Initializes a `Bun.Glob` scanner with pattern `**\/*.{ts,tsx,js,jsx}`.
 * 2. Performs synchronous scan filtering files only (skips folders).
 * 3. Splits each relative path into segments to verify whether it crosses any nested
 *    hidden or blacklisted folder (e.g., `my-module/.cache/file.ts`).
 * 4. Resolves normalized absolute paths.
 * 5. Returns the file list sorted lexicographically.
 * 
 * @param dir - Absolute path of the module directory
 * @returns Sorted list of absolute source file paths
 */
function listSourceFiles(dir: string): string[] {
  // 1. Instantiate glob pattern optimized for Bun
  const glob = new Glob("**/*.{ts,tsx,js,jsx}");
  const matches: string[] = [];

  // 2. Iterate over synchronous scan matches
  for (const relativePath of glob.scanSync({ cwd: dir, onlyFiles: true })) {
    const segments = relativePath.split("/");

    // 3. Guard against nested undesirable directories
    if (segments.some(segment => EXCLUDED_DIRS.has(segment) || segment.startsWith("."))) {
      continue;
    }

    // 4. Resolve absolute path
    matches.push(join(dir, relativePath));
  }

  // 5. Stable lexicographical sort
  return matches.sort((a, b) => a.localeCompare(b));
}
```

---

## 3. Automated Tests: `src/modules/scoring/discovery.test.ts`

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverModules } from "./discovery";

describe("discoverModules", () => {
  let root: string;

  /**
   * Before each test, constructs an isolated ephemeral filesystem in the OS temp directory.
   */
  beforeEach(() => {
    // 1. Create unique temporary directory
    root = mkdtempSync(join(tmpdir(), "atlas-discovery-"));

    // 2. Create valid 'src/auth' module with a TypeScript source file
    mkdirSync(join(root, "src", "auth"), { recursive: true });
    writeFileSync(join(root, "src", "auth", "login.ts"), "export const login = () => true;");

    // 3. Create 'src/styles' directory containing only CSS (must not qualify as code module)
    mkdirSync(join(root, "src", "styles"), { recursive: true });
    writeFileSync(join(root, "src", "styles", "index.css"), "body { margin: 0; }");

    // 4. Create 'node_modules' (must be ignored by blacklist)
    mkdirSync(join(root, "node_modules", "some-package"), { recursive: true });
    writeFileSync(join(root, "node_modules", "some-package", "index.js"), "module.exports = {};");
  });

  /**
   * Cleanup temporary files after execution.
   */
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("finds top-level folders that contain source files", () => {
    // Scanning inside 'src': finds 'auth' and lists 'login.ts'
    const modules = discoverModules(join(root, "src"));
    expect(modules).toHaveLength(1);
    expect(modules[0]?.name).toBe("auth");
    expect(modules[0]?.files).toEqual([join(root, "src", "auth", "login.ts")]);
  });

  test("excludes folders with no ts/tsx/js/jsx files", () => {
    // Scanning inside 'src': 'styles' contains only CSS, thus excluded
    const modules = discoverModules(join(root, "src"));
    const names = modules.map(module => module.name);
    expect(names).not.toContain("styles");
  });

  test("ignores node_modules even when scanning from the repo root", () => {
    // Scanning from repo root: 'node_modules' is blacklisted
    const modules = discoverModules(root);
    const names = modules.map(module => module.name);
    expect(names).not.toContain("node_modules");
  });

  test("excludes nested dot-directories from file scanning", () => {
    const srcPath = join(root, "src");
    // Create nested hidden directory '.cache' inside valid module
    mkdirSync(join(srcPath, "auth", ".cache"), { recursive: true });
    writeFileSync(join(srcPath, "auth", ".cache", "generated.ts"), "export const x = 1;");

    const modules = discoverModules(srcPath);
    expect(modules).toHaveLength(1);
    expect(modules[0]?.name).toBe("auth");
    // Nested dot-directory file must be excluded
    expect(modules[0]?.files).toHaveLength(1);
    expect(modules[0]?.files).toEqual([join(srcPath, "auth", "login.ts")]);
  });

  test("returns modules and files in stable, alphabetically sorted order regardless of creation order", () => {
    const stableRoot = mkdtempSync(join(tmpdir(), "atlas-discovery-stable-"));

    // Directories created intentionally in reverse-alphabetical order
    // to prove sorting is enforced deterministically by algorithm, not filesystem inodes.
    mkdirSync(join(stableRoot, "zebra"), { recursive: true });
    writeFileSync(join(stableRoot, "zebra", "z.ts"), "export const z = 1;");

    mkdirSync(join(stableRoot, "mango"), { recursive: true });
    writeFileSync(join(stableRoot, "mango", "m.ts"), "export const m = 1;");

    mkdirSync(join(stableRoot, "apple"), { recursive: true });
    writeFileSync(join(stableRoot, "apple", "z-file.ts"), "export const z = 1;");
    writeFileSync(join(stableRoot, "apple", "a-file.ts"), "export const a = 1;");
    writeFileSync(join(stableRoot, "apple", "m-file.ts"), "export const m = 1;");

    const modules = discoverModules(stableRoot);

    // Modules must be sorted: apple -> mango -> zebra
    expect(modules.map(module => module.name)).toEqual(["apple", "mango", "zebra"]);

    // Files inside 'apple' must be sorted: a-file -> m-file -> z-file
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
