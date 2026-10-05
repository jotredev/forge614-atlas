# 07. Project Structure: Documented Source Code

[Sister translation: 07 (ES). Estructura del Código: Línea por Línea](../es/07-estructura-codigo-linea-por-linea.md)

This chapter documents the original scoring engine (Plan 1) that evaluates complexity, risk, and prioritizes modules. Below are the individual components.

## Files and Modules

| Page | Files | What it is for |
|------|-------|----------------|
| [07.01 Configuration and Entry Point](07-structure/01-configuration-and-entry-point.md) | `tsconfig.json`, `.gitignore`, `src/index.ts` | Configures build and Git rules, and exports the library's API. |
| [07.02 Discovery](07-structure/02-module-discovery.md) | `src/modules/scoring/discovery.ts` | Identifies and groups project source files into analyzable modules. |
| [07.03 Cyclomatic Complexity](07-structure/03-cyclomatic-complexity.md) | `src/modules/scoring/cyclomatic.ts` | Measures complexity and execution paths (ifs, loops) inside code. |
| [07.04 Fan-In](07-structure/04-fan-in-centrality.md) | `src/modules/scoring/fan-in.ts` | Counts how many other modules depend on (import) each module. |
| [07.05 Git Churn](07-structure/05-git-churn-volatility.md) | `src/modules/scoring/churn.ts` | Measures a module's historical change frequency in Git. |
| [07.06 Test Gap](07-structure/06-test-coverage-gap.md) | `src/modules/scoring/test-coverage-gap.ts` | Determines the proportion of files missing their sibling test file. |
| [07.07 Composite Score](07-structure/07-composite-scoring.md) | `src/modules/scoring/composite-score.ts` | Normalizes and weights the above metrics into a single score. |
| [07.08 Tiers](07-structure/08-tier-allocation.md) | `src/modules/scoring/tiers.ts` | Distributes modules into three analysis tiers based on their criticality. |
| [07.09 Test Scaffold](07-structure/09-test-harness-sanity.md) | `src/modules/scoring/scaffold.test.ts` | Ensures the test environment and runner work correctly. |

## The rest of the code

The other areas of the project are documented in other chapters of this manual:

| Folder (`src/`) | Chapter where it is explained |
|-----------------|-------------------------------|
| `interfaces/cli` | [Chapter 06](../en/06-typescript-api-reference.md) |
| `modules/cli` | [Chapter 08](../en/08-cli-core-and-run-plan.md) |
| `modules/memory` | [Chapter 06](../en/06-typescript-api-reference.md) |
| `modules/engines-client` | [Chapter 06](../en/06-typescript-api-reference.md) |
| `modules/workers-client` | [Chapter 09](../en/09-actual-subagent-dispatch.md) |
| `modules/uninstall` | [Chapter 11](../en/11-troubleshooting.md) |
| `modules/updater` | [Chapter 11](../en/11-troubleshooting.md) |
| `modules/forge-home` | [Chapter 10](../en/10-installer-and-release.md) |
