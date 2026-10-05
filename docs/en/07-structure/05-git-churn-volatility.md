# 07.05 Git Churn Volatility

[Sister translation: 07.05 (ES) Volatilidad Histórica de Git (Churn)](../../es/07-estructura/05-volatilidad-git-churn.md)

## What it is for

Counts how many times a module's files have been modified in the whole Git history. A module that changes often ("high churn") is an unstable area prone to technical debt (pending fixes that pile up) and bugs, so it raises its score and, with it, its analysis tier. In real life, it is like reviewing the complete repair history of cars in a fleet: the car that has been to the shop the most times since it was bought needs a more thorough inspection.

## Files

- `src/modules/scoring/churn.ts`: Invokes Git to get the modified files in each commit and assigns them to their respective modules ([Card in Chapter 06](../06-typescript-api-reference.md)).

## How it works

1. `computeChurn` executes the terminal command `git -c core.quotepath=false log --format= --name-only` synchronously at the root of the repository (`src/modules/scoring/churn.ts:48-51`).
2. Checks if the command failed; if the exit code is not zero, it immediately throws an error (`src/modules/scoring/churn.ts:54-56`).
3. Initializes the results map with `0` for each received module (`src/modules/scoring/churn.ts:59`).
4. Splits the text output into lines (individual modified files), trimming whitespace and discarding empty lines (`src/modules/scoring/churn.ts:62-65`).
5. For each file path in the output, it converts it to an absolute path based on the repository root (`src/modules/scoring/churn.ts:70`).
6. Filters which modules contain that file path in their directory. The absolute path must match the module's path or start with the module's path followed by a directory separator (`src/modules/scoring/churn.ts:73-77`).
7. To resolve mixed folders (which produce a parent module and other modules for each subfolder), it selects the most specific module, which is the one with the longest base path (`src/modules/scoring/churn.ts:81-85`).
8. If it finds the module, it increments its "churn" counter by 1 for each appearance in the history (`src/modules/scoring/churn.ts:88-90`).

## Edge cases and decisions

- UTF-8 encoding in Git: By default, Git escapes non-ASCII characters (like ñ or accents) in its output, preventing them from being matched to the file paths; using `-c core.quotepath=false` forces raw UTF-8 output (`src/modules/scoring/churn.ts:48`).
- Files outside detected modules: Paths in Git's output that do not fall inside any module's folder (e.g., files in `dist/` or loose at the root) are ignored (`src/modules/scoring/churn.ts:88`). By contrast, a file that no longer exists, was renamed, is not code or is a test DOES count if its path ended up inside a module's folder, because `computeChurn` uses only the folder path and not `module.files` (`src/modules/scoring/churn.ts:73-77`).
- Repository root: `repoRoot` must be the root of the Git repository; if it is a subfolder, Git does not fail, but the paths do not match the modules' folders and everyone's churn is 0 (`src/modules/scoring/churn.ts:70`).
- Command error: If the directory is not a Git repository, Git is not installed, or the repo has no commits (orphan HEAD: no commit yet), the command will fail and the function will throw an error that aborts the entire calculation process (`src/modules/scoring/churn.ts:55`).

## Tests

| Test | What it checks |
|------|----------------|
| `counts changed-file entries per module across commit history` | Verifies the count in a real Git repository created in a temporary folder: `auth` (one file changed in 2 commits) counts 2 and `billing` (1 commit) counts 1. |
| `correctly attributes files to modules with prefix-overlapping names` | Ensures that `auth/login.ts` adds only to `auth` and `auth-legacy/old-login.ts` only to `auth-legacy` (1 each), without mixing. |
| `correctly attributes churn for modules with non-ASCII names` | Checks that the `señales` module (with an ñ) counts its change (1); without `core.quotepath=false` Git would write the path with octal codes and it would not match the folder. |
| `attributes each changed file to the most specific module in a mixed folder` | Guarantees that a modified file inside a mixed folder adds to the module of its subfolder, not the parent container's module: `src` = 1, `src/auth` = 2 and `src/billing` = 1. |

## Where it is used

- `computeChurn`: Called by `buildRunPlan` in `src/modules/cli/build-run-plan.ts:63` and re-exported in `src/index.ts:20`.
