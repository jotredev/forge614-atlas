# 07.08 Tier Allocation

[Sister translation: 07.08 (ES) Asignación de Niveles (Tiers)](../../es/07-estructura/08-asignacion-niveles-tiers.md)

## What it is for

Divides all of the project's modules into three analysis tiers ("deep", "standard", or "light") based on their composite risk score (roughly 15 %, 35 % and 50 %). The tier decides which model analyzes each module and the order in which they are dispatched (`profundo` first); it does not change the text of the analysis that is asked for (`src/modules/scoring/tiers.ts:12-15`). In real life, it is like the "triage" (sorting by severity) of an emergency hospital, where all patients are evaluated and the most severe ones are sent to the operating room (deep), the regular ones to a bed (standard), and the rest to the waiting room (light), which is also attended to, with a cheaper model and last.

## Files

- `src/modules/scoring/tiers.ts`: Sorts the modules by risk score and classifies them into three tiers according to their position in that list (roughly 15 %, 35 % and 50 %); it does not pick the model: `resolveTaskConfig` does that with its table (`src/modules/cli/task-config.ts:20-33`) ([Card in Chapter 06](../06-typescript-api-reference.md)).

## How it works

1. `assignTiers` receives the list of composite scores (`src/modules/scoring/tiers.ts:53`).
2. Sorts a copy of the list from highest to lowest score. If two modules have the same score, it breaks the tie alphabetically by name (`src/modules/scoring/tiers.ts:56-62`).
3. Calculates the number of modules that fit in the `profundo` tier by rounding 15% of the total. Uses `Math.max(1, ...)` to ensure that, if there is code, there is always at least one module in this tier (`src/modules/scoring/tiers.ts:68`).
4. Calculates how many modules go to the `estandar` tier by rounding 35% of the total (`src/modules/scoring/tiers.ts:69`).
5. Iterates over the already sorted list and assigns `"profundo"` to the first modules (up to the `deepCount`), then `"estandar"` (up to `deepCount + standardCount`), and `"ligero"` to the rest (`src/modules/scoring/tiers.ts:72-87`).

## Edge cases and decisions

- Small projects: With 1, 2 or 3 modules the rounded 15 % would be 0 (with 4 it already gives 1); the deep tier guarantee (`Math.max(1, ...)`) ensures there is always at least one `profundo` module, the highest-scoring one, which gets the most capable model in the table (`src/modules/scoring/tiers.ts:68`, `src/modules/cli/task-config.ts:29-32`).
- Deterministic stability: The alphabetical tie-breaker guarantees that, if scores are identical, successive runs always give the same assignments and the plan does not change between runs with the same data (`src/modules/scoring/tiers.ts:56-62`).

## Tests

| Test | What it checks |
|------|----------------|
| `splits 20 modules into roughly 50/35/15 by descending score` | Verifies that 20 modules with scores from 20 to 1 split into 3 `profundo`, 7 `estandar` and 10 `ligero`, and that the `profundo` ones are `module-0`, `module-1` and `module-2`; it does not check which ones are `estandar` or `ligero`. |
| `a project with a single module still gets a tier, never crashes` | Ensures that a project with a single module (`only`) gets the `profundo` tier (15 % of 1 rounds to 0 and `Math.max(1, …)` corrects it) rather than being left without a tier. |
| `ties on score break deterministically by name, regardless of input order` | Checks that the alphabetical tie-breaker produces the same assignment order regardless of the order in which the modules were received. |

## Where it is used

- `assignTiers`: Called by `buildRunPlan` in `src/modules/cli/build-run-plan.ts:76` and re-exported in `src/index.ts:30`.
