# 07.09 (EN) Test Harness and Sanity (scaffold.test.ts)

> **Architecture and Code Reference — Forge614 Atlas Ecosystem**  
> **Scope:** `src/modules/scoring/scaffold.test.ts`  
> **Sister Translation:** [07.09 Arnés de Pruebas y Sanidad (Scaffold Test)](../../es/07-estructura/09-arnes-pruebas-sanidad.md)

---

## 1. Architectural Rationale

Before implementing incremental phases of the SDD (Software Design Description) plan, a baseline sanity verification test was required. The `scaffold.test.ts` file validates that the Bun test runner (`bun test`) is operational within the monorepo, global types from `@types/bun` resolve cleanly, and the testing framework assertions succeed before complex logic runs.

### Real-World Analogy
> It is like turning the ignition key and checking the dashboard warning lights before starting an engine for a long journey: if the dashboard does not illuminate, there is no point in putting the car in gear.

---

## 2. Documented Source Code: `src/modules/scoring/scaffold.test.ts`

```typescript
import { describe, expect, test } from "bun:test";

/**
 * Initial test harness sanity suite (scaffold test).
 * 
 * Purpose:
 * - Guarantees that Bun's native test runner (`bun test`)
 *   is properly wired, configured, and functional before running
 *   unit and integration tests for Forge614 Atlas.
 */
describe("project scaffold", () => {
  test("the test runner is wired up", () => {
    // Minimal deterministic sanity assertion
    expect(1 + 1).toBe(2);
  });
});
```

---

## 3. Test Runner Execution Output

```bash
$ bun test
bun test v1.3.8 (b64edcb4)

src/modules/scoring/test-coverage-gap.test.ts:
✓ computeTestCoverageGap > returns 0 when every source file has a sibling .test file
✓ computeTestCoverageGap > returns 1 when no source file has a sibling test
✓ computeTestCoverageGap > returns a fractional gap when only some files are covered

src/modules/scoring/tiers.test.ts:
✓ assignTiers > splits 20 modules into roughly 50/35/15 by descending score
✓ assignTiers > a project with a single module still gets a tier, never crashes
✓ assignTiers > ties on score break deterministically by name, regardless of input order

src/modules/scoring/scaffold.test.ts:
✓ project scaffold > the test runner is wired up

src/modules/scoring/fan-in.test.ts:
✓ computeFanIn > counts how many other modules import from this one
✓ computeFanIn > does not count a module importing from itself
✓ computeFanIn > handles sibling modules with overlapping names correctly (path-prefix collision)
✓ computeFanIn > counts distinct importing modules, not import statements or files
✓ computeFanIn > does not count imports from a module's own test files

src/modules/scoring/cyclomatic.test.ts:
✓ fileCyclomaticComplexity > a function with no branching has the baseline complexity of 1
✓ fileCyclomaticComplexity > counts if/else-if, loops, switch cases, and logical operators (never default)
✓ computeCyclomaticComplexity > sums complexity across every file in a module
✓ computeCyclomaticComplexity > excludes *.test.ts files from the module's complexity total

src/modules/scoring/composite-score.test.ts:
✓ computeCompositeScores > weights cyclomatic and fan-in higher than churn, and never lets testGap fully decide
✓ computeCompositeScores > a module that is complex but well-tested still outranks a trivial one, without the test gap inflating it

src/modules/scoring/discovery.test.ts:
✓ discoverModules > finds top-level folders that contain source files
✓ discoverModules > excludes folders with no ts/tsx/js/jsx files
✓ discoverModules > ignores node_modules even when scanning from the repo root
✓ discoverModules > excludes nested dot-directories from file scanning
✓ discoverModules > returns modules and files in stable, alphabetically sorted order regardless of creation order

src/modules/scoring/churn.test.ts:
✓ computeChurn > counts changed-file entries per module across commit history
✓ computeChurn > correctly attributes files to modules with prefix-overlapping names
✓ computeChurn > correctly attributes churn for modules with non-ASCII names

 26 pass
 0 fail
 46 expect() calls
Ran 26 tests across 8 files. [287.00ms]
```
