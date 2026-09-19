# 07.05 (EN) Git Churn Volatility (churn.ts and test)

> **Architecture and Code Reference — Forge614 Atlas Ecosystem**  
> **Scope:** `src/modules/scoring/churn.ts` and `churn.test.ts`  
> **Sister Translation:** [07.05 Volatilidad Histórica de Código (Churn Git UTF-8)](../../es/07-estructura/05-volatilidad-git-churn.md)

---

## 1. Architectural Rationale

Code Churn quantifies historical developer modification frequency across Git commits. Modules that change repeatedly indicate hotspots of active churn: frequent requirement revisions, bug fixes, or continuous refactorings.

### Critical Algorithmic Guarantees
1. **Strict UTF-8 Preservation (`-c core.quotepath=false`):** By default, Git escapes non-ASCII path characters in quoted octal notation (`"\303\261"`). Setting `core.quotepath=false` forces Git to output raw UTF-8, ensuring directories containing accents or non-English characters (such as `señales` or `administración`) match their descriptors.
2. **High-Performance Output Format (`--format= --name-only`):** Suppresses commit hashes, authors, and log messages, streaming only touched file paths for fast synchronous parsing.
3. **Explicit Error Handling:** If `git log` fails (e.g. non-git directory or repo with 0 commits), a descriptive error is thrown rather than silently swallowing the failure.
4. **Strict Path Boundary (`modulePath + sep`):** Avoids prefix collisions between similarly named directories (`auth` vs `auth-legacy`).

### Real-World Analogy
> It is like an aircraft maintenance log: an engine that required 40 repairs and part replacements over the past three months requires significantly deeper pre-flight inspection than an identical engine that has operated without intervention for a year.

---

## 2. Documented Source Code: `src/modules/scoring/churn.ts`

```typescript
import { spawnSync } from "node:child_process";
import { join, sep } from "node:path";
import type { ModuleDescriptor } from "./discovery";

/**
 * Computes per-module Code Churn from Git historical commit logs.
 * 
 * Software Engineering Foundation:
 * - Churn measures the historical frequency of file modifications across repository commits.
 * - Modules with high churn represent hotspots of ongoing change, technical debt, and risk.
 * 
 * Critical Technical Details:
 * 1. Flag `-c core.quotepath=false`:
 *    Forces Git to output non-ASCII paths in pure UTF-8 rather than octal escapes,
 *    preventing international directories from being dropped.
 * 2. Format `--format= --name-only`:
 *    Suppresses commit metadata and outputs only modified file paths line by line.
 * 3. Error Handling:
 *    Throws descriptive error if git log exits non-zero (non-git directory or empty repo).
 * 4. Boundary Protection (`modulePath + sep`):
 *    Ensures `auth-service/index.ts` does not increment churn for `auth`.
 * 
 * @param repoRoot - Absolute path to the Git repository root
 * @param modules - Discovered module descriptors
 * @returns Map associating each module name with total commit modifications
 * @throws Error if git log execution fails
 */
export function computeChurn(repoRoot: string, modules: ModuleDescriptor[]): Map<string, number> {
  // 1. Synchronously spawn git log
  const result = spawnSync("git", ["-c", "core.quotepath=false", "log", "--format=", "--name-only"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  // 2. Validate exit status
  if (result.status !== 0) {
    throw new Error(`git log failed in ${repoRoot}: ${result.stderr}`);
  }

  // 3. Initialize churn map
  const churn = new Map(modules.map(module => [module.name, 0]));

  // 4. Split stdout by newlines and filter empty strings
  const touchedFiles = result.stdout
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  // 5. Attribute touched files to modules
  for (const relativeFile of touchedFiles) {
    const absolutePath = join(repoRoot, relativeFile);

    const matchedModule = modules.find(module => {
      const modulePath = module.path;
      return absolutePath === modulePath || absolutePath.startsWith(modulePath + sep);
    });

    // 6. Increment churn for matched module
    if (matchedModule) {
      churn.set(matchedModule.name, (churn.get(matchedModule.name) ?? 0) + 1);
    }
  }

  return churn;
}
```

---

## 3. Automated Tests: `src/modules/scoring/churn.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeChurn } from "./churn";
import type { ModuleDescriptor } from "./discovery";

/**
 * Helper to run git commands synchronously in temporary test repositories.
 */
function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

describe("computeChurn", () => {
  test("counts changed-file entries per module across commit history", () => {
    // Scenario: Real Git repo fixture.
    // auth/login.ts modified in 2 commits.
    // billing/charge.ts modified in 1 commit.
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

    // Commit 1: Create login.ts
    writeFileSync(authFile, "export const login = () => true;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "add login"]);

    // Commit 2: Modify login.ts (second touch for auth)
    writeFileSync(authFile, "export const login = () => false;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "flip login"]);

    // Commit 3: Create charge.ts (first touch for billing)
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

  test("correctly attributes files to modules with prefix-overlapping names", () => {
    // Scenario: Prefix collision 'auth' vs 'auth-legacy'.
    const root = mkdtempSync(join(tmpdir(), "atlas-churn-prefix-"));
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "Test"]);

    const authPath = join(root, "auth");
    const authLegacyPath = join(root, "auth-legacy");
    mkdirSync(authPath, { recursive: true });
    mkdirSync(authLegacyPath, { recursive: true });
    const authFile = join(authPath, "login.ts");
    const authLegacyFile = join(authLegacyPath, "old-login.ts");

    writeFileSync(authFile, "export const login = () => true;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "add login"]);

    writeFileSync(authLegacyFile, "export const oldLogin = () => true;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "add old login"]);

    const modules: ModuleDescriptor[] = [
      { name: "auth", path: authPath, files: [authFile] },
      { name: "auth-legacy", path: authLegacyPath, files: [authLegacyFile] },
    ];

    const result = computeChurn(root, modules);

    expect(result.get("auth")).toBe(1);
    expect(result.get("auth-legacy")).toBe(1);

    rmSync(root, { recursive: true, force: true });
  });

  test("correctly attributes churn for modules with non-ASCII names", () => {
    // Scenario: Module named 'señales' with 'ñ'.
    // `core.quotepath=false` prevents octal escape from breaking attribute match.
    const root = mkdtempSync(join(tmpdir(), "atlas-churn-nonascii-"));
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "Test"]);

    const signalesPath = join(root, "señales");
    mkdirSync(signalesPath, { recursive: true });
    const signalesFile = join(signalesPath, "procesador.ts");

    writeFileSync(signalesFile, "export const procesar = () => true;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "add señales"]);

    const modules: ModuleDescriptor[] = [{ name: "señales", path: signalesPath, files: [signalesFile] }];

    const result = computeChurn(root, modules);

    expect(result.get("señales")).toBe(1);

    rmSync(root, { recursive: true, force: true });
  });
});
```
