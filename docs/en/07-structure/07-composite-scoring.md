# 07.07 Composite Scoring

[Sister translation: 07.07 (ES) Puntuación Compuesta Normalizada](../../es/07-estructura/07-puntuacion-compuesta.md)

## What it is for

Converts a module's various signals (complexity, fan-in, churn, and test gap) into a single risk and context-need score. Because each metric uses different scales (churn can reach thousands, fan-in rarely passes a few tens), this step standardizes and weighs them. In real life, it is like grading a student on an exam, assignments and participation, but "on a curve": each grade is measured against the best and the worst of the group.

## Files

- `src/modules/scoring/composite-score.ts`: Normalizes the values using a Min-Max formula, combines them with percentages, and applies the untested penalty ([Card in Chapter 06](../06-typescript-api-reference.md)).

## How it works

1. `computeCompositeScores` receives a list of `ModuleSignals` objects (which group the values for each module) (`src/modules/scoring/composite-score.ts:67`).
2. Extracts the `cyclomatic`, `fanIn`, and `churn` value lists and passes them through the `normalize` function independently (`src/modules/scoring/composite-score.ts:69-71`).
3. The `normalize` function applies a classic Min-Max scaling: `(value - min) / (max - min)`, returning values between `0.0` and `1.0` (`src/modules/scoring/composite-score.ts:101-110`).
4. Iterating through each module, it calculates a `base` score by adding `35%` of the normalized cyclomatic complexity, `35%` of fan-in, and `30%` of churn (`src/modules/scoring/composite-score.ts:76-79`).
5. Multiplies the result by the test risk factor (`testGap`): `base * (1 + 0.2 * signal.testGap)`, adding up to 20% more if there are no tests (`src/modules/scoring/composite-score.ts:82`).
6. Returns the list of modules with their final score, respecting the original order (`src/modules/scoring/composite-score.ts:84-87`).

## Edge cases and decisions

- Division by zero: If all modules have exactly the same value for a signal (the maximum equals the minimum), the Min-Max formula would divide by zero (`0/0`); the `normalize` function detects this and returns a vector of zeros (`src/modules/scoring/composite-score.ts:105-107`).
- Signal weighting: Complexity and fan-in weigh 35 % each and churn 30 %. The code describes complexity as the code's cognitive difficulty, fan-in as the impact a change has on other modules and churn as the real frequency of editing (`src/modules/scoring/composite-score.ts:55-57`; weights at `:77-79`).
- Relative score: Each signal is normalized with the minimum and the maximum of the project's own modules, so a module's score depends on the others; with a single module, that signal is 0. `testGap` is not normalized: it goes as is into the surcharge (`src/modules/scoring/composite-score.ts:69-71`, `:82`).

## Tests

| Test | What it checks |
|------|----------------|
| `weights cyclomatic and fan-in higher than churn, and never lets testGap fully decide` | Checks the two extremes: a module with all signals at 0 scores 0, and another with all at the maximum and `testGap` = 1 scores 1.2 (base 1.0 plus the maximum 20 % surcharge). It does not test the 0.35 / 0.35 / 0.30 weights separately. |
| `a module that is complex but well-tested still outranks a trivial one, without the test gap inflating it` | Checks that a complex module with `testGap` = 0 scores 1 (its base, no surcharge) and that the trivial module scores 0. |

## Where it is used

- `computeCompositeScores`: Called by `buildRunPlan` in `src/modules/cli/build-run-plan.ts:76` and re-exported in `src/index.ts:26`.
