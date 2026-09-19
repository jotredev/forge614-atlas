# 05 (EN). SDD Process, Defect Catalog, and Deferred Decisions

> **Official Technical Reference Document — Forge614 Ecosystem**  
> **Project:** Forge614 Atlas (Deep Contextualization Orchestrator)  
> **Methodology:** Subagent-Driven Development (SDD) with Paired Reviewers  
> **Branch Audit:** 17 commits | 20 files (953 lines of code & tests) | 5 cross-task defects resolved | 2 deferred decisions  
> **Sister translation:** [05. Proceso SDD, Catálogo de Defectos y Decisiones Diferidas](../es/05-proceso-sdd-y-catalogo-defectos.md)

---

## 1. Subagent-Driven Development (SDD) Methodology

Implementation of Plan 1 followed the rigorous **Subagent-Driven Development (SDD)** protocol:
- Every individual task was executed by an AI subagent pair: an **implementer** (responsible for writing failing tests, minimal implementation code, and executing verification) and a **reviewer** (auditing code against global project constraints and edge cases prior to committing).
- 8 sequential tasks were completed:
  1. Bun/TypeScript project scaffold and test harness (`package.json`, `tsconfig.json`, `scaffold.test.ts`).
  2. Module discovery and directory filtering (`discovery.ts`).
  3. Cyclomatic complexity extraction via TypeScript AST (`cyclomatic.ts`).
  4. Relative dependency fan-in centrality (`fan-in.ts`).
  5. Historical commit volatility churn (`churn.ts`).
  6. Sibling unit test coverage gap analysis (`test-coverage-gap.ts`).
  7. Weighted composite scoring with Min-Max normalization (`composite-score.ts`).
  8. Percentile-based tier assignment and public barrel export (`tiers.ts`, `src/index.ts`).

---

## 2. Complete Git Commit History (17 commits ahead of `main`)

| Commit Hash | Commit Message | Type | Purpose |
|:---:|---|:---:|---|
| `d5a7d79` | `Expand .gitignore to match ecosystem conventions` | chore | Aligns project exclusions with `forge614-shell` and `forge614-engram`. |
| `ff2ad90` | `feat: add src/index.ts barrel export for public scoring library surface` | feat | Formal public export of all scoring interfaces, functions, and types. |
| `b679879` | `fix: disable git path-quoting so churn works for non-ASCII module names` | fix | UTF-8 support in `git log` using `-c core.quotepath=false`. |
| `1f3d862` | `fix: deterministic ordering for module discovery and tier assignment` | fix | Alphabetical sorting for files/modules and name tie-breaking in tiers. |
| `951dd07` | `fix: fan-in counts distinct modules and excludes test files from complexity/fan-in` | fix | Distinct client module counting and exclusion of tests in AST/fan-in. |
| `4981714` | `feat: assign percentile-based complexity tiers` | feat | Tier assignment for Deep (15%), Standard (35%), and Light (50%). |
| `63c27a9` | `feat: compute weighted composite complexity score per module` | feat | Min-Max normalization, $0.35/0.35/0.30$ weights, and test gap modifier. |
| `f11ebe8` | `feat: compute test coverage gap per module` | feat | Static detection of sibling test files (`.test.*` / `.spec.*`). |
| `d5ab888` | `fix: use path-boundary check for module attribution in computeChurn` | fix | Directory boundary validation for churn file attribution. |
| `cf92cff` | `feat: compute git churn per module` | feat | Modification frequency tracking across commit history. |
| `4a5fc77` | `fix: use path-boundary check for module attribution in fan-in` | fix | Prevention of false positives on directory prefix collisions in fan-in. |
| `108447f` | `feat: compute fan-in centrality per module` | feat | Static resolution of relative imports and exports. |
| `efb32fc` | `feat: compute cyclomatic complexity per module` | feat | TypeScript AST parser for McCabe logical branch counting. |
| `ebf7ca3` | `fix: exclude nested dot-directories from file scanning in discoverModules` | fix | Filtering of nested hidden directories during file scanning. |
| `e36b14f` | `feat: discover project modules for complexity scoring` | feat | Top-level folder discovery with source code matching. |
| `192c423` | `chore: scaffold Bun/TypeScript project` | chore | Bun setup, TypeScript 5.9 configuration, and test runner sanity check. |
| `942b063` | `Add .gitignore for build artifacts and SDD scratch workspace` | chore | Initial gitignore configuration for the repository. |

---

## 3. Branch Audit: 5 Cross-Task Defects Discovered and Resolved

Upon completing all 8 tasks, an exhaustive cross-module audit of the entire branch was conducted. While unit tests for each individual task had succeeded in isolation, a systemic evaluation identified 5 subtle defects:

### Defect 1: Fan-In Counted Individual Import Statements Instead of Distinct Modules
- **Problem:** If a file `user.ts` in module `admin` imported three separate utilities from module `auth`, `auth`'s fan-in counter was incremented by $+3$. This artificially inflated structural centrality when a single consumer made multiple imports.
- **Resolution:** In `src/modules/scoring/fan-in.ts`, a `targetModuleNames = new Set<string>()` set was introduced per source module. $FanIn$ now strictly measures **unique consuming modules**, correctly reflecting graph degree centrality (commit `951dd07`).

### Defect 2: Test Files Inflated Cyclomatic Complexity and Fan-In
- **Problem:** If a module contained an extensive test suite with dozens of assertions and mock helpers, those files contributed McCabe decision points and generated spurious import connections to other modules.
- **Resolution:** `isTestFile(filePath)` was applied in `cyclomatic.ts` and `fan-in.ts`, systematically filtering out any `*.test.*` or `*.spec.*` file from production metrics (commit `951dd07`).

### Defect 3: Non-Deterministic Ordering in Discovery and Tier Sorting
- **Problem:** Filesystem `readdirSync` returns entries in arbitrary operating-system-dependent order. Furthermore, when two modules had identical scores, `sort((a, b) => b.score - a.score)` produced non-deterministic orderings between runs.
- **Resolution:** Explicit alphabetical sorting was added in `discovery.ts` (`.sort((a, b) => a.localeCompare(b))`) and deterministic tie-breaking was implemented in `tiers.ts` via `b.score - a.score || a.name.localeCompare(b.name)` (commit `1f3d862`).

### Defect 4: Non-ASCII Paths (Spanish Names) Yielded Churn = 0 Due to Git Octal Quoting
- **Problem:** By default, Git (`core.quotepath = true`) escapes non-ASCII bytes (such as `ñ` or accented characters) into octal strings (e.g. `"dise\303\261o"`). When `churn.ts` checked this output against physical paths (`diseño`), string equality failed silently, assigning $Churn = 0$.
- **Resolution:** Git invocation in `churn.ts` was updated to pass:
  ```bash
  git -c core.quotepath=false log --format= --name-only
  ```
  This disables quoting and emits raw UTF-8, verified with dedicated unit tests against Spanish module names (`churn.test.ts`, commit `b679879`).

### Defect 5: `package.json` Pointed to a Non-Existent Barrel Export
- **Problem:** `package.json` declared `"exports": "./src/index.ts"`, but `src/index.ts` had not been authored, preventing external packages from consuming the library.
- **Resolution:** Created `src/index.ts` exporting the complete public surface of functions and interfaces (commit `ff2ad90`).

---

## 4. Architectural Decisions Explicitly Deferred to Plan 3

During the development of Plan 1, two operational behaviors were intentionally deferred to **Plan 3** to align with full orchestrator integration:

### Deferred Decision 1: Handling Non-Git Repositories or Zero-Commit Repositories
- **Current Behavior in Plan 1:** `computeChurn(repoRoot, modules)` explicitly throws an error if `repoRoot` is not a Git repository or if `git log` fails (e.g. on a freshly initialized repo with zero commits).
- **Plan 3 Requirement:** The Plan 3 orchestrator must determine whether to **degrade gracefully** (assigning $Churn = 0$ across all modules and rebalancing weights between cyclomatic complexity and fan-in) rather than aborting execution.
- **Code Reference:** Explicit comment in `src/modules/scoring/churn.ts#L8-L10`.

### Deferred Decision 2: Nested Module Discovery Adaptation
- **Current Behavior in Plan 1:** `discoverModules(root)` only inspects **top-level** directories. In a standard project layout like `src/{auth, billing, catalog, ui}`, all source code currently collapses into a single module named `"src"`.
- **Plan 3 Requirement:** Plan 3 must implement root analysis adaptation (*root analysis adaptation*): if the root directory contains only one dominant code container (e.g. `src/`, `packages/`, or `lib/`), Atlas must automatically descend one level to discover true domain modules.
- **Code Reference:** Architectural note in `src/modules/scoring/discovery.ts`.
