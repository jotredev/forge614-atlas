# 07.07 (EN) Normalized Composite Score (composite-score.ts and test)

> **Architecture and Code Reference — Forge614 Atlas Ecosystem**  
> **Scope:** `src/modules/scoring/composite-score.ts` and `composite-score.test.ts`  
> **Sister Translation:** [07.07 Puntuación Compuesta Normalizada (Composite Score)](../../es/07-estructura/07-puntuacion-compuesta.md)

---

## 1. Architectural Rationale

The three structural signals (Cyclomatic, Fan-In, and Churn) operate in vastly divergent numeric scales:
- **Cyclomatic complexity** ranges in tens or hundreds of points.
- **Fan-In centrality** is bounded by module count (rarely exceeding 10 to 20).
- **Git Churn** can exceed 1,000 commits in mature codebases.

Unnormalized aggregation would allow Churn to dictate 95% of the scoring decisions, ignoring complex but stable foundational modules. Atlas resolves this using:
1. **Min-Max Normalization:** Scales each vector independently to $[0.0, 1.0]$:
   $$X_{\text{norm}} = \frac{X - \min(X)}{\max(X) - \min(X)}$$
2. **Zero-Variance Guard:** If all modules share the same value ($\max = \min$), avoids zero-division ($0/0$) by returning $0.0$.
3. **Linear Weighting:**
   $$\text{Base} = 0.35 \cdot \text{Cyclo}_{\text{norm}} + 0.35 \cdot \text{FanIn}_{\text{norm}} + 0.30 \cdot \text{Churn}_{\text{norm}}$$
4. **Fragility Risk Multiplier:**
   $$\text{Score} = \text{Base} \cdot (1 + 0.20 \cdot \text{TestGap})$$

### Real-World Analogy
> It is like Olympic decathlon scoring: you cannot directly sum 100m sprint seconds with high jump meters or shot put kilograms. Each discipline is normalized against benchmarks to determine a fair composite champion.

---

## 2. Documented Source Code: `src/modules/scoring/composite-score.ts`

```typescript
/**
 * Raw quantitative signals collected for a module.
 */
export interface ModuleSignals {
  /** Module directory name */
  name: string;
  /** Aggregate cyclomatic complexity of production code */
  cyclomatic: number;
  /** Number of other dependent modules (graph in-degree) */
  fanIn: number;
  /** Total historical Git commit modifications */
  churn: number;
  /** Unit test coverage gap in range [0.0, 1.0] */
  testGap: number;
}

/**
 * Final composite complexity score computed for a module.
 */
export interface ModuleScore {
  /** Module name */
  name: string;
  /** Non-negative scalar score resulting from normalization and weighting */
  score: number;
}

/**
 * Computes Composite Complexity Scores for a collection of modules.
 * 
 * Mathematical Challenge:
 * - Structural signals operate at vastly different scales:
 *   - Cyclomatic: 1 to 500.
 *   - Fan-In: 0 to 20.
 *   - Churn: 0 to 1,000+.
 * - Direct addition would allow Churn to overpower cognitive and architectural complexity.
 * 
 * Min-Max Normalization Solution:
 * 1. Each signal $X$ is scaled to $[0.0, 1.0]$:
 *    $X_{\text{norm}} = \frac{X - \min(X)}{\max(X) - \min(X)}$
 * 2. If all values are identical ($\max = \min$), returns $0.0$ to avoid zero division.
 * 
 * Linear Base Weighting:
 * - $\text{Base} = 0.35 \cdot \text{Cyclomatic}_{\text{norm}} + 0.35 \cdot \text{FanIn}_{\text{norm}} + 0.30 \cdot \text{Churn}_{\text{norm}}$
 *   - 35% Cyclomatic Complexity (intrinsic cognitive load).
 *   - 35% Fan-In Centrality (systemic blast radius of change).
 *   - 30% Churn Volatility (empirical developer activity).
 * 
 * Test Gap Fragility Multiplier:
 * - $\text{Score} = \text{Base} \cdot (1 + 0.20 \cdot \text{TestGap})$
 *   - Perfectly tested modules ($\text{TestGap} = 0.0$) retain unmodified base score.
 *   - Untested modules ($\text{TestGap} = 1.0$) receive a +20% score penalty.
 * 
 * @param signals - Raw signals across all modules
 * @returns Array of composite scores preserving input order
 */
export function computeCompositeScores(signals: ModuleSignals[]): ModuleScore[] {
  // 1. Independent Min-Max normalization per signal vector
  const cyclomaticNorm = normalize(signals.map(s => s.cyclomatic));
  const fanInNorm = normalize(signals.map(s => s.fanIn));
  const churnNorm = normalize(signals.map(s => s.churn));

  // 2. Linear combination with fragility multiplier
  return signals.map((signal, index) => {
    // 3. Weighted base score
    const base =
      0.35 * (cyclomaticNorm[index] ?? 0) +
      0.35 * (fanInNorm[index] ?? 0) +
      0.30 * (churnNorm[index] ?? 0);

    // 4. Fragility modifier (up to +20%)
    const score = base * (1 + 0.2 * signal.testGap);

    return {
      name: signal.name,
      score,
    };
  });
}

/**
 * Pure helper function projecting numeric arrays to [0.0, 1.0] using Min-Max.
 * 
 * Numerical Stability:
 * - Returns all zeros if array has length <= 1 or all values are equal.
 * 
 * @param values - Numeric vector
 * @returns Scaled numeric vector in [0.0, 1.0]
 */
function normalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Prevent division by zero
  if (max === min) {
    return values.map(() => 0);
  }

  return values.map(value => (value - min) / (max - min));
}
```

---

## 3. Automated Tests: `src/modules/scoring/composite-score.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import { computeCompositeScores } from "./composite-score";

describe("computeCompositeScores", () => {
  test("weights cyclomatic and fan-in higher than churn, and never lets testGap fully decide", () => {
    // Scenario: Two contrasting modules.
    // 'trivial': all signals 0 -> score 0.
    // 'complex-untested': max values -> normalized 1.0.
    // Base = 0.35*1 + 0.35*1 + 0.30*1 = 1.0.
    // Final score = 1.0 * (1 + 0.20*1) = 1.20.
    const signals = [
      { name: "trivial", cyclomatic: 0, fanIn: 0, churn: 0, testGap: 0 },
      { name: "complex-untested", cyclomatic: 10, fanIn: 8, churn: 5, testGap: 1 },
    ];

    const [trivial, complex] = computeCompositeScores(signals);

    expect(trivial?.score).toBe(0);
    expect(complex?.score).toBeGreaterThan(0);
    expect(complex?.score).toBeCloseTo(1.2, 5);
  });

  test("a module that is complex but well-tested still outranks a trivial one, without the test gap inflating it", () => {
    // Scenario: Complex module with perfect test coverage (testGap = 0).
    // Base = 1.0, multiplier = 1.0 (no inflation).
    const signals = [
      { name: "complex-tested", cyclomatic: 10, fanIn: 8, churn: 5, testGap: 0 },
      { name: "trivial", cyclomatic: 0, fanIn: 0, churn: 0, testGap: 0 },
    ];

    const [complexTested, trivial] = computeCompositeScores(signals);

    expect(complexTested?.score).toBeCloseTo(1, 5);
    expect(trivial?.score).toBe(0);
  });
});
```
