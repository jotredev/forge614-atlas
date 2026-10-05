# 07.04 Fan-In Centrality

[Sister translation: 07.04 (ES) Centralidad de Dependencias (Fan-In)](../../es/07-estructura/04-centralidad-fan-in.md)

## What it is for

Measures how many other modules depend on a module (import it). A module with high "fan-in" is a central component or core, so it receives a larger token budget in the analysis. In real life, it is like counting how many streets lead into a roundabout: if many streets lead there, the roundabout is a central and critical traffic point.

## Files

- `src/modules/scoring/fan-in.ts`: Inspects each file's relative imports and calculates the in-degree between modules ([Card in Chapter 06](../06-typescript-api-reference.md)).

## How it works

1. `computeFanIn` initializes the counter of all received modules to `0` (`src/modules/scoring/fan-in.ts:146`).
2. Iterates over each file in the emitting module, discarding test files (`src/modules/scoring/fan-in.ts:156`).
3. Reads the code of the valid files and uses `extractRelativeImportSpecifiers` to find all relative import paths (`src/modules/scoring/fan-in.ts:161-162`).
4. Delegates to `resolveImportPath` to resolve each relative path to an absolute file, testing extensions like `.ts`, `.tsx`, `/index.ts`, etc. If it does not exist, it is ignored (`src/modules/scoring/fan-in.ts:163-167`).
5. Determines which module the resolved path belongs to: the path must be equal to the module's path or start with its path plus a directory separator (`src/modules/scoring/fan-in.ts:170-174`).
6. If multiple modules match (e.g., a mixed folder gives a parent and subfolders), the most specific one is chosen: the one with the longest path (`src/modules/scoring/fan-in.ts:178-182`).
7. If the target module is different from the emitting module, it adds it to a dependency `Set` for that emitter (`src/modules/scoring/fan-in.ts:185-187`).
8. Finally, it increments by `1` the Fan-In counter for each target module registered in the set (`src/modules/scoring/fan-in.ts:191-193`).

## Edge cases and decisions

- Self-dependency exclusion: Imports between files within the same module are considered internal cohesion and do not add to the fan-in (`src/modules/scoring/fan-in.ts:185`).
- Edge uniqueness: If a module imports another 5 times in 5 different files, the Fan-In only adds 1 thanks to the use of a `Set` per emitting module (`src/modules/scoring/fan-in.ts:150`).
- Prefix collision and specificity: The use of the `sep` separator prevents `auth` from erroneously matching `auth-legacy` (`src/modules/scoring/fan-in.ts:173`). Choosing the longest path ensures that files in subfolders of a mixed folder belong to the subfolder, not the parent (`src/modules/scoring/fan-in.ts:178-182`).

## Tests

| Test | What it checks |
|------|----------------|
| `counts how many other modules import from this one` | Verifies that the counter reflects the number of distinct modules that import from this one. |
| `does not count a module importing from itself` | Ensures that internal cohesion (files importing within the same module) adds zero to the fan-in. |
| `handles sibling modules with overlapping names correctly (path-prefix collision)` | Checks that overlapping names (e.g., `auth` and `auth-legacy`) do not cause false dependency matches. |
| `counts distinct importing modules, not import statements or files` | Guarantees that multiple imports from various files of the same module towards another module count as only one dependency. |
| `does not count imports from a module's own test files` | Reviews that imports made from test files are not counted towards production fan-in. |
| `attributes an import to the most specific module in a mixed folder` | Verifies that imports to files in a mixed folder are attributed to the most specific module (the subfolder instead of the parent container). |

## Where it is used

- `computeFanIn`: Called by `buildRunPlan` in `src/modules/cli/build-run-plan.ts:62` and re-exported in `src/index.ts:17`.
