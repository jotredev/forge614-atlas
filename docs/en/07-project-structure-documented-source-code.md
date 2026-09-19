# 07 (EN). Project Structure and Documented Source Code

> **Official Technical Reference Document — Forge614 Ecosystem**  
> **Project:** Forge614 Atlas (Deep Contextualization Orchestrator)  
> **Component:** Plan 1/5 — Deterministic Complexity Scoring Engine  
> **Scope:** Master navigation index to the 9 modular subpages of line-by-line documented source code  
> **Sister Translation:** [07. Estructura del Proyecto y Código Fuente Documentado](../es/07-estructura-codigo-linea-por-linea.md)

---

## 1. Master Directory of Modular Subpages

To maximize readability, educational clarity, and architectural accessibility, the source code documentation is structured into **9 dedicated subpages**, each featuring complete code, line-by-line inline comments, algorithmic walkthroughs, and automated test suites:

| Subpage | Files Covered | Architectural Purpose | Key Algorithm / Standard |
| :--- | :--- | :--- | :--- |
| [**07.01 (EN) Environment Configuration and Entry Point**](07-structure/01-configuration-and-entry-point.md) | `package.json`, `tsconfig.json`, `.gitignore`, `src/index.ts` | Execution environment, strict compiler rules, and public barrel exports. | Bun >= 1.3.8, Native ESM, TS 5.9.3 Strict |
| [**07.02 (EN) Module Discovery (discovery.ts and test)**](07-structure/02-module-discovery.md) | `discovery.ts`, `discovery.test.ts` | Deterministic filesystem discovery of first-level folders and code files. | $O(1)$ `EXCLUDED_DIRS` filter, `localeCompare` sort |
| [**07.03 (EN) AST Cyclomatic Complexity (cyclomatic.ts and test)**](07-structure/03-cyclomatic-complexity.md) | `cyclomatic.ts`, `cyclomatic.test.ts` | Control flow branch measurement via TypeScript compiler AST. | McCabe's formula (1976), `default:` omission, `&&`, `\|\|`, `??` |
| [**07.04 (EN) Dependency Fan-In Centrality (fan-in.ts and test)**](07-structure/04-fan-in-centrality.md) | `fan-in.ts`, `fan-in.test.ts` | In-degree calculation across inter-module dependency graph. | `Set` deduplication (module-to-module edge), `modulePath + sep` boundary |
| [**07.05 (EN) Git Churn Volatility (churn.ts and test)**](07-structure/05-git-churn-volatility.md) | `churn.ts`, `churn.test.ts` | Historical commit modification frequency across Git logs. | `git -c core.quotepath=false` (pure UTF-8), strict boundary |
| [**07.06 (EN) Test Coverage Gap (test-coverage-gap.ts and test)**](07-structure/06-test-coverage-gap.md) | `test-coverage-gap.ts`, `test-coverage-gap.test.ts` | Detection of unhedged production files lacking co-located tests. | Formula $1 - (|withTests| / |sourceFiles|)$, $+20\%$ risk multiplier |
| [**07.07 (EN) Normalized Composite Score (composite-score.ts and test)**](07-structure/07-composite-scoring.md) | `composite-score.ts`, `composite-score.test.ts` | Balanced integration of quantitative signals and risk modifier. | Min-Max normalization, 35/35/30 weights, zero-variance guard |
| [**07.08 (EN) Budget Tier Allocation (tiers.ts and test)**](07-structure/08-tier-allocation.md) | `tiers.ts`, `tiers.test.ts` | Percentile assignment of modules into context depth tiers. | Top 15% Deep (`Math.max(1, ...)`), 35% Standard, 50% Light |
| [**07.09 (EN) Test Harness and Sanity (scaffold.test.ts)**](07-structure/09-test-harness-sanity.md) | `scaffold.test.ts` | Baseline validation of Bun test runner and execution harness. | Baseline `1 + 1 === 2` assertion, Bun runtime validation |

---

## 2. Complete File Tree

```text
forge614-atlas/
├── package.json                         # npm manifest and script definitions
├── tsconfig.json                        # TypeScript compiler options for Bun
├── .gitignore                           # Git ignore rules
├── src/
│   ├── index.ts                         # Public library barrel export
│   └── modules/
│       └── scoring/                     # Deterministic scoring engine
│           ├── discovery.ts             # Filesystem discovery and filtering
│           ├── discovery.test.ts        # Discovery test suite
│           ├── cyclomatic.ts            # McCabe cyclomatic AST complexity
│           ├── cyclomatic.test.ts       # Cyclomatic test suite
│           ├── fan-in.ts                # Inter-module dependency centrality
│           ├── fan-in.test.ts           # Fan-in test suite
│           ├── churn.ts                 # Git commit history volatility (UTF-8)
│           ├── churn.test.ts            # Churn test suite
│           ├── test-coverage-gap.ts     # Sibling test coverage gap calculation
│           ├── test-coverage-gap.test.ts# Test gap test suite
│           ├── composite-score.ts       # Min-Max normalization and scoring
│           ├── composite-score.test.ts  # Composite score test suite
│           ├── tiers.ts                 # Percentile tier classification
│           ├── tiers.test.ts            # Tier allocation test suite
│           └── scaffold.test.ts         # Test harness sanity suite
```

---

## 3. Quality Metrics and Coverage Matrix

| Module | Source Lines | Test Lines | Test Count | Branch Coverage | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `discovery.ts` | ~110 | ~80 | 5 tests | 100% | Passing (Verified with Bun) |
| `cyclomatic.ts` | ~120 | ~90 | 4 tests | 100% | Passing (Verified with Bun) |
| `fan-in.ts` | ~150 | ~150 | 5 tests | 100% | Passing (Verified with Bun) |
| `churn.ts` | ~85 | ~110 | 3 tests | 100% | Passing (Verified with Bun) |
| `test-coverage-gap.ts` | ~75 | ~60 | 3 tests | 100% | Passing (Verified with Bun) |
| `composite-score.ts` | ~85 | ~30 | 2 tests | 100% | Passing (Verified with Bun) |
| `tiers.ts` | ~75 | ~65 | 3 tests | 100% | Passing (Verified with Bun) |
| `scaffold.test.ts` | — | ~15 | 1 test | 100% | Passing (Verified with Bun) |
| **Total** | **~700** | **~600** | **26 tests (46 assertions)** | **100%** | **Full Suite Passing (0 failures)** |
