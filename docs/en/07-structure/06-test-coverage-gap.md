# 07.06 Test Coverage Gap

[Sister translation: 07.06 (ES) Brecha de Cobertura de Pruebas (Test Gap)](../../es/07-estructura/06-brecha-cobertura-pruebas.md)

## What it is for

Measures what proportion of a module's files do not have an associated test file, returning a value from 0 (all covered) to 1 (none covered). It only looks at whether the test file exists on disk; it does not measure how much code those tests run. This signal is used to penalize complex modules that are also untested. In real life, it is like counting what percentage of employees in a chemical factory do not wear protective gear; the higher the percentage, the higher the risk of accidents.

## Files

- `src/modules/scoring/test-coverage-gap.ts`: Examines the file system looking for "sibling" tests for each source file and calculates the uncovered proportion ([Card in Chapter 06](../06-typescript-api-reference.md)).

## How it works

1. `computeTestCoverageGap` receives the discovered modules (`src/modules/scoring/test-coverage-gap.ts:67`).
2. For each module, it filters out test files using the `isTestFile` function, keeping only productive files (`src/modules/scoring/test-coverage-gap.ts:71-72`).
3. If a module lacks productive files, it immediately assigns it a gap of 0 to avoid penalizing it (`src/modules/scoring/test-coverage-gap.ts:75-78`).
4. Uses the `hasSiblingTest` function on each productive file to count how many have a test (`src/modules/scoring/test-coverage-gap.ts:81`).
5. In `hasSiblingTest`, it separates the base path from the extension, and checks with `existsSync` if a file with `.test` or `.spec` and the same original extension exists in that same folder (`src/modules/scoring/test-coverage-gap.ts:31-36`).
6. The gap is calculated by subtracting from `1` the division between the files that do have tests and the total productive files (`src/modules/scoring/test-coverage-gap.ts:84`).
7. The result is stored in the map returned by the function (`src/modules/scoring/test-coverage-gap.ts:87`).

## Edge cases and decisions

- Sibling tests convention: Atlas strictly assumes that tests live next to the code, in the same folder (e.g. `src/auth/jwt.test.ts` for `src/auth/jwt.ts`). An architecture with tests in a separate `tests/` folder will yield a test gap of 1.0 (total gap) (`src/modules/scoring/test-coverage-gap.ts:35-36`).
- Penalizer, not a direct sum: The `[0, 1]` result is not added to the complexity score, but used later in `composite-score.ts` as a risk multiplier of up to +20% if there are no tests (`src/modules/scoring/test-coverage-gap.ts:60-61`).
- Empty or tests-only modules: A module with no productive files receives a gap of 0 (no risk of missing tests), avoiding division by zero (`src/modules/scoring/test-coverage-gap.ts:75-76`).

## Tests

| Test | What it checks |
|------|----------------|
| `returns 0 when every source file has a sibling .test file` | Confirms that if all files have their test alongside, the reported gap is 0. |
| `returns 1 when no source file has a sibling test` | Ensures that a completely untested module gets a maximum gap score of 1. |
| `returns a fractional gap when only some files are covered` | Verifies that the proportional calculation is correct (e.g., 1 protected out of 2 yields a 0.5 gap). |

## Where it is used

- `computeTestCoverageGap`: Called by `buildRunPlan` in `src/modules/cli/build-run-plan.ts:64` and re-exported in `src/index.ts:23`.
