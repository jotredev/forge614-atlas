# 07.02 Module Discovery

[Sister translation: 07.02 (ES) Descubrimiento e Inspección del Sistema de Archivos](../../es/07-estructura/02-descubrimiento-discovery.md)

## What it is for

Identifies the folders that make up a project's code to analyze them as "modules". In real life, it is like a city census, where census takers visit all the streets and buildings (folders) to register which houses (code files) belong to each neighborhood (module).

## Files

- `src/modules/scoring/discovery.ts`: Recursive exploration algorithm that finds modules and test files ([Card in Chapter 06](../06-typescript-api-reference.md)).

## How it works

1. `discoverModules` starts the discovery process from the repository root, reading folders (ignoring loose files at the root) (`src/modules/scoring/discovery.ts:74`).
2. Delegates to `collectModules` to recursively analyze each folder (`src/modules/scoring/discovery.ts:80`).
3. In `collectModules`, if a folder has no subfolders but does have code files, it considers it a module and registers it (`src/modules/scoring/discovery.ts:103`).
4. If the folder is mixed (it has its own code files and also subfolders), the loose files form a module named after the folder, and it continues down to the subfolders (`src/modules/scoring/discovery.ts:109-111`).
5. If the folder only has subfolders (it is a pure container), it simply traverses it and inspects each subfolder (`src/modules/scoring/discovery.ts:114-116`).
6. `relativeModuleName` is used to generate a uniform name based on the relative path, with forward slashes `/` for stability across operating systems (`src/modules/scoring/discovery.ts:126-128`).
7. `listDirectSourceFiles` is used with a `Glob` to list only direct `.ts, .tsx, .js, .jsx` files in the folder, alphabetically sorted (`src/modules/scoring/discovery.ts:138-144`).

## Edge cases and decisions

- Excluded folders: Explicitly skips `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `out`, `.forge614`, and any folder starting with a dot, to avoid processing dependencies or build outputs (`src/modules/scoring/discovery.ts:19`).
- Name collision: Because the module name is its relative path (`src/auth` instead of just `auth`), two folders with the same name in different branches do not collide (`src/modules/scoring/discovery.ts:65`).
- Loose root files: Files located directly at the root do not belong to any module; the `discoverModules` function only traverses direct folders from the root (`src/modules/scoring/discovery.ts:68-75`).

## Tests

| Test | What it checks |
|------|----------------|
| `finds top-level folders that contain source files` | Finds top-level folders that have loose code files. |
| `excludes folders with no ts/tsx/js/jsx files` | Skips folders that do not contain files with supported code extensions. |
| `ignores node_modules even when scanning from the repo root` | Verifies that the `node_modules` directory is excluded from the search. |
| `excludes nested dot-directories from file scanning` | Ensures that subdirectories starting with a dot (e.g., `.hidden`) are not scanned. |
| `descends into a purely-nested container folder instead of collapsing it into one module` | Ensures a container of pure folders is traversed internally to create a module per subfolder, rather than unifying them. |
| `splits a mixed folder (loose files + subfolders) into a loose-files module plus one module per subfolder` | Checks that mixed folders register their files as a separate module and split their subfolders. |
| `keeps flat top-level modules working exactly as before (no regression)` | Guarantees that flat top-level folders continue to be evaluated and treated identically as before. |
| `returns modules and files in stable, alphabetically sorted order regardless of creation order` | Returns the modules and their files in alphabetical order to ensure deterministic behavior. |

## Where it is used

- `discoverModules`: Called by `resolveModuleFiles` in `src/modules/cli/module-files.ts:16` and `buildRunPlan` in `src/modules/cli/build-run-plan.ts:54`.
- `isTestFile`: Called by `test-coverage-gap.ts:72`, `fan-in.ts:156`, and `cyclomatic.ts:120`.
