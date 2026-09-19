# 07.06 (EN) Test Coverage Gap (test-coverage-gap.ts and test)

> **Architecture and Code Reference — Forge614 Atlas Ecosystem**  
> **Scope:** `src/modules/scoring/test-coverage-gap.ts` and `test-coverage-gap.test.ts`  
> **Sister Translation:** [07.06 Brecha de Cobertura de Pruebas (Test Coverage Gap)](../../es/07-estructura/06-brecha-cobertura-pruebas.md)

---

## 1. Architectural Rationale

The Test Coverage Gap metric measures operational fragility by identifying the absence of co-located unit tests (*sibling tests*). For AI coding agents in Forge614 Atlas, modifying a complex module that lacks automated regression tests carries a severe risk of introducing silent regressions.

### Critical Algorithmic Guarantees
1. **Sibling Test Detection:** Standard industry convention: for each production file `auth.ts`, looks for co-located `auth.test.ts` or `auth.spec.ts` (preserving `.tsx`, `.js`, etc.).
2. **Normalized Formula in $[0.0, 1.0]$:**
   $$\text{TestGap} = 1.0 - \frac{|\text{Files with Sibling Test}|}{|\text{Total Production Source Files}|}$$
   - $\text{TestGap} = 0.0$: Complete automated test protection.
   - $\text{TestGap} = 1.0$: Zero automated test coverage (maximum fragility).
3. **Boundary Handling:** Modules containing no production files return $0.0$ to avoid penalizing configuration or asset directories.
4. **System Role:** Operates as a **fragility multiplier** ($+20\%$) in the composite score ($1 + 0.20 \cdot \text{TestGap}$) rather than an additive signal.

### Real-World Analogy
> It is like driving a heavy vehicle along a winding cliffside pass: the speed and vehicle weight represent complexity, but the presence of guardrails represents test coverage. If there are no guardrails ($\text{TestGap} = 1.0$), any unexpected swerve is disastrous.

---

## 2. Documented Source Code: `src/modules/scoring/test-coverage-gap.ts`

```typescript
import { existsSync } from "node:fs";
import { isTestFile, type ModuleDescriptor } from "./discovery";

/**
 * Checks whether a production source file has a co-located sibling test.
 * 
 * Industry Standard Convention (co-located tests):
 * - For a file like `/src/auth/jwt.ts`, looks for two direct variants:
 *   1. `/src/auth/jwt.test.ts` (or matching extension: .tsx, .js, .jsx)
 *   2. `/src/auth/jwt.spec.ts`
 * 
 * Step-by-step:
 * 1. Finds last index of dot (`.`) to extract extension (`ext`) and base path (`base`).
 * 2. Uses `existsSync` to check for `{base}.test{ext}` or `{base}.spec{ext}`.
 * 
 * @param filePath - Absolute path of production source file
 * @returns `true` if a sibling test exists on disk, `false` otherwise
 */
function hasSiblingTest(filePath: string): boolean {
  const dotIndex = filePath.lastIndexOf(".");
  const base = filePath.slice(0, dotIndex);
  const ext = filePath.slice(dotIndex);

  return existsSync(`${base}.test${ext}`) || existsSync(`${base}.spec${ext}`);
}

/**
 * Computes the Test Coverage Gap for each module.
 * 
 * Definition and Quality Rationale:
 * - Test Coverage Gap quantifies the proportion of production source files
 *   lacking an associated unit test suite.
 * - Normalized range: `[0.0, 1.0]`.
 *   - `0.0`: Complete test coverage (all files have sibling tests).
 *   - `1.0`: Total gap (no production files have automated tests).
 * 
 * Step-by-step Algorithm:
 * 1. For each module, filters production files excluding test files.
 * 2. Edge case: If module has 0 production files, gap is 0.0.
 * 3. Counts how many production files have sibling tests (`withTests`).
 * 4. Applies complement ratio: `gap = 1.0 - (withTests / sourceFiles.length)`.
 * 5. Stores result in module map.
 * 
 * Scoring Engine Role:
 * - Acts as a RISK MULTIPLIER in `composite-score.ts`:
 *   `score = base * (1 + 0.20 * testGap)`.
 *   A complex module without tests receives up to a +20% score penalty,
 *   allocating higher context budget for AI reasoning.
 * 
 * @param modules - Discovered module list
 * @returns Map associating each module name with its test gap in [0.0, 1.0]
 */
export function computeTestCoverageGap(modules: ModuleDescriptor[]): Map<string, number> {
  const result = new Map<string, number>();

  for (const module of modules) {
    // 1. Filter production source files only
    const sourceFiles = module.files.filter(file => !isTestFile(file));

    // 2. Edge case: module with no production code
    if (sourceFiles.length === 0) {
      result.set(module.name, 0);
      continue;
    }

    // 3. Filter files having sibling test files
    const withTests = sourceFiles.filter(hasSiblingTest);

    // 4. Compute unhedged ratio
    const gap = 1 - withTests.length / sourceFiles.length;

    // 5. Store computed gap
    result.set(module.name, gap);
  }

  return result;
}
```

---

## 3. Automated Tests: `src/modules/scoring/test-coverage-gap.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeTestCoverageGap } from "./test-coverage-gap";
import type { ModuleDescriptor } from "./discovery";

describe("computeTestCoverageGap", () => {
  test("returns 0 when every source file has a sibling .test file", () => {
    // Scenario: Perfect coverage.
    // Gap = 1 - (1 tested / 1 source) = 0.0.
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
    // Scenario: Zero coverage.
    // Gap = 1 - (0 tested / 1 source) = 1.0 (maximum risk).
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
    // Scenario: Partial coverage.
    // Gap = 1 - (1 tested / 2 sources) = 0.5 (50% gap).
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
