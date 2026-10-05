# 07.03 Cyclomatic Complexity (McCabe AST)

[Sister translation: 07.03 (ES) Complejidad Ciclomática](../../es/07-estructura/03-complejidad-ciclomatica.md)

## What it is for

Calculates how many possible execution paths a piece of code can take (McCabe complexity). Code with many `if`s, loops, and logical operators receives a higher score, indicating that it is harder to understand and needs a larger context window budget from the model. In real life, it is like counting how many forks a maze has: the more turns, the harder it is to cross.

## Files

- `src/modules/scoring/cyclomatic.ts`: Analyzes each file's AST to count branching nodes and sums the totals per module ([Card in Chapter 06](../06-typescript-api-reference.md)).

## How it works

1. `computeCyclomaticComplexity` iterates over each module in the repository (`src/modules/scoring/cyclomatic.ts:113`).
2. For each file in the module, if it is not a unit test, it reads its source code (`src/modules/scoring/cyclomatic.ts:117-125`).
3. Calls `fileCyclomaticComplexity` passing the source code and the path (`src/modules/scoring/cyclomatic.ts:128`).
4. `fileCyclomaticComplexity` parses the code into a TypeScript AST (`src/modules/scoring/cyclomatic.ts:45`).
5. Starts with a baseline complexity of `1` (the file's linear path) (`src/modules/scoring/cyclomatic.ts:52`).
6. The `visit` function walks each node of the tree. It adds `1` for each: `if`, ternary, `while`, `do...while`, `for`, `for...in`, `for...of`, `catch` block, and `case` clause in a `switch` (`src/modules/scoring/cyclomatic.ts:57-70`).
7. It also adds `1` for each short-circuit logical operator (`&&`, `||`, `??`) because they implicitly branch the evaluation (`src/modules/scoring/cyclomatic.ts:76-80`).
8. `ts.forEachChild` continues visiting child nodes recursively (`src/modules/scoring/cyclomatic.ts:86`).
9. Returns the accumulated total in the module results map (`src/modules/scoring/cyclomatic.ts:132`).

## Edge cases and decisions

- Excluded tests: All test files (`.test` or `.spec`) are strictly ignored so that their assertions do not artificially inflate complexity (`src/modules/scoring/cyclomatic.ts:119`).
- Skipping `default`: Inside a `switch`, `default` clauses do not add points because they are not an extra condition, but rather the default fallback path (`src/modules/scoring/cyclomatic.ts:67`).

## Tests

| Test | What it checks |
|------|----------------|
| `a function with no branching has the baseline complexity of 1` | Ensures that linear code without conditionals returns a minimum of 1. |
| `counts if/else-if, loops, switch cases, and logical operators (never default)` | Verifies correct addition for all types of branches, and that `default` is ignored. |
| `sums complexity across every file in a module` | Checks that a module's total complexity is the sum of its files. |
| `excludes *.test.ts files from the module's complexity total` | Guarantees that test code does not add to the module's score. |

## Where it is used

- `computeCyclomaticComplexity`: Called by `buildRunPlan` in `src/modules/cli/build-run-plan.ts:61`.
- `fileCyclomaticComplexity`: Called locally by `computeCyclomaticComplexity` in `src/modules/scoring/cyclomatic.ts:128` and re-exported in `src/index.ts:14`.
