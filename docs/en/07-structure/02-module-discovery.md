# 07.02 Module Discovery

[Sister translation: 07.02 (ES) Descubrimiento de Módulos](../../es/07-estructura/02-descubrimiento-discovery.md)

## What it is for

Identifies the folders that make up a project's code to analyze them as "modules". In real life, it is like a city census: the census taker visits every block (folder) and writes down only the ones that have houses (code files); each block written down is a module and is identified by its full address (`src/auth`), not just by its name.

## Files

- `src/modules/scoring/discovery.ts`: Walks the folders recursively to find the modules (`discoverModules`) and offers `isTestFile`, which tells by its name whether a file is a test ([Card in Chapter 06](../06-typescript-api-reference.md)).

## How it works

1. `discoverModules` starts the discovery process from the repository root, reading folders (ignoring loose files at the root) (`src/modules/scoring/discovery.ts:79-83`).
2. Delegates to `collectModules` to recursively analyze each folder (`src/modules/scoring/discovery.ts:86-88`).
3. In `collectModules`, if a folder has no subfolders that count (excluded ones and those starting with a dot do not count) but does have code files, it considers it a module and registers it (`src/modules/scoring/discovery.ts:112-117`).
4. If the folder is mixed (it has its own code files and also subfolders), the loose files form a module named after the folder, and it continues down to the subfolders (`src/modules/scoring/discovery.ts:119-122`).
5. If the folder only has subfolders (it is a pure container), it simply traverses it and inspects each subfolder (`src/modules/scoring/discovery.ts:124-127`).
6. `relativeModuleName` is used to generate a uniform name based on the relative path, with forward slashes `/` for stability across operating systems (`src/modules/scoring/discovery.ts:139-141`).
7. `listDirectSourceFiles` is used with a `Glob` to list only direct `.ts, .tsx, .js, .jsx` files in the folder, alphabetically sorted (`src/modules/scoring/discovery.ts:150-159`).

## Edge cases and decisions

- Excluded folders: Explicitly skips `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `out`, `.forge614`, and any folder starting with a dot, to avoid processing dependencies or build outputs (`src/modules/scoring/discovery.ts:19-28`; the filters at `:81` and `:105` also discard every folder that starts with a dot).
- Name collision: Because the module name is its relative path (`src/auth` instead of just `auth`), two folders with the same name in different branches do not collide (`src/modules/scoring/discovery.ts:69-71` and `:139-141`).
- Loose root files: Files located directly at the root do not belong to any module; the `discoverModules` function only traverses direct folders from the root (`src/modules/scoring/discovery.ts:73` and `:80-83`).
- Test files: `files` also includes the `.test.*` and `.spec.*` files; whatever counts (complexity, fan-in, test gap) separates them with `isTestFile`.
- Folder that does not exist: if `root` does not exist or cannot be read, `discoverModules` throws the file-system error (for example `ENOENT`) and does not catch it.

## Tests

| Test | What it checks |
|------|----------------|
| `finds top-level folders that contain source files` | Checks that scanning `src` gives a single module, `auth`, with its `login.ts` file. |
| `excludes folders with no ts/tsx/js/jsx files` | Skips folders that do not contain files with supported code extensions (the test uses `styles`, which only has a CSS file). |
| `ignores node_modules even when scanning from the repo root` | Checks that, when scanning from the root, no module is named `node_modules` (it compares exact names: a `node_modules/some-package` module would not make it fail). |
| `excludes nested dot-directories from file scanning` | Ensures that a subfolder starting with a dot inside a module (the test creates `auth/.cache/generated.ts`) is not scanned: module `auth` keeps only `login.ts`. |
| `descends into a purely-nested container folder instead of collapsing it into one module` | Checks that `src`, which only has subfolders, does not become a module: the result is only `src/auth` (with `login.ts`), named by its relative path; `src/styles` does not count because it only has a CSS file. |
| `splits a mixed folder (loose files + subfolders) into a loose-files module plus one module per subfolder` | Checks that `src` (with a loose `index.ts` and the subfolders `auth` and `billing`) gives three modules: `src` (only `index.ts`), `src/auth` and `src/billing`. |
| `keeps flat top-level modules working exactly as before (no regression)` | Checks that a top-level folder with code directly in it (`auth/login.ts`) gives the module `auth`. |
| `returns modules and files in stable, alphabetically sorted order regardless of creation order` | Returns the modules and their files in alphabetical order to ensure deterministic behavior. |

## Where it is used

- `discoverModules`: Called by `resolveModuleFiles` in `src/modules/cli/module-files.ts:16` and `buildRunPlan` in `src/modules/cli/build-run-plan.ts:54`.
- `isTestFile`: Called by `test-coverage-gap.ts:72`, `fan-in.ts:156`, and `cyclomatic.ts:120`.
- `discoverModules` and `isTestFile` are re-exported in `src/index.ts:10`.
