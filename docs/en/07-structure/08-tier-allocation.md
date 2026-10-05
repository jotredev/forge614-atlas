# 07.08 Tier Allocation

[Sister translation: 07.08 (ES) Asignación de Niveles de Presupuesto (Tiers)](../../es/07-estructura/08-asignacion-niveles-tiers.md)

## What it is for

Divides all of the project's modules into three analysis tiers ("deep", "standard", or "light") based on their composite risk score, allocating more model power and time to the most difficult ones. In real life, it is like the triage of an emergency hospital, where all patients are evaluated and the most severe ones are sent to the operating room (deep), the regular ones to a bed (standard), and the rest to the waiting room (light).

## Files

- `src/modules/scoring/tiers.ts`: Sorts the modules by risk score and classifies them into fixed percentiles, determining what artificial intelligence budget will be spent on them ([Card in Chapter 06](../06-typescript-api-reference.md)).

## How it works

1. `assignTiers` receives the list of composite scores (`src/modules/scoring/tiers.ts:53`).
2. Sorts a copy of the list from highest to lowest score. If two modules have the same score, it breaks the tie alphabetically by name (`src/modules/scoring/tiers.ts:56-62`).
3. Calculates the number of modules that fit in the `profundo` tier by rounding 15% of the total. Uses `Math.max(1, ...)` to ensure that, if there is code, there is always at least one module in this tier (`src/modules/scoring/tiers.ts:68`).
4. Calculates how many modules go to the `estandar` tier by rounding 35% of the total (`src/modules/scoring/tiers.ts:69`).
5. Iterates over the already sorted list and assigns `"profundo"` to the first modules (up to the `deepCount`), then `"estandar"` (up to `deepCount + standardCount`), and `"ligero"` to the rest (`src/modules/scoring/tiers.ts:72-84`).

## Edge cases and decisions

- Small projects: If a project has only 2 or 3 modules, 15% would yield 0; the deep tier guarantee (`Math.max(1)`) ensures that at least the most complex module is always chosen to use the most advanced model (`src/modules/scoring/tiers.ts:46`).
- Deterministic stability: The alphabetical tie-breaker guarantees that if scores are identical, successive runs will always result in the same assignments, preventing flakiness in the pipeline (`src/modules/scoring/tiers.ts:42-43`).

## Tests

| Test | What it checks |
|------|----------------|
| `splits 20 modules into roughly 50/35/15 by descending score` | Verifies that a set of 20 modules is correctly divided into the three tiers according to the established percentages. |
| `a project with a single module still gets a tier, never crashes` | Ensures that the deep module guarantee assigns a tier to the single module and does not cause mathematical errors (e.g., zero divisions or algorithms). |
| `ties on score break deterministically by name, regardless of input order` | Checks that the alphabetical tie-breaker produces the same assignment order regardless of the order in which the modules were received. |

## Where it is used

- `assignTiers`: Called by `buildRunPlan` in `src/modules/cli/build-run-plan.ts:76` and re-exported in `src/index.ts:30`.
