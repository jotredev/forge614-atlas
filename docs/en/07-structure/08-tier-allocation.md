# 07.08 (EN) Budget Tier Allocation (tiers.ts and test)

> **Architecture and Code Reference — Forge614 Atlas Ecosystem**  
> **Scope:** `src/modules/scoring/tiers.ts` and `tiers.test.ts`  
> **Sister Translation:** [07.08 Asignación de Niveles de Presupuesto (Tiers)](../../es/07-estructura/08-asignacion-niveles-tiers.md)

---

## 1. Architectural Rationale

The primary objective of the Plan 1/5 scoring engine is to supply the contextualization orchestrator with a deterministic allocation of token budget and LLM reasoning depth:
- **Deep Tier (`"profundo"`):** Assigned to top ~15% highest complexity modules. Receives comprehensive context: full AST dependency graphs, public contracts, and in-depth architectural summaries.
- **Standard Tier (`"estandar"`):** Assigned to next ~35% modules. Receives public interface signatures and executive summaries.
- **Light Tier (`"ligero"`):** Assigned to remaining ~50% peripheral modules. Receives one-line summaries and directory paths.

### Essential Mathematical Guarantees
1. **Deterministic Lexicographical Tie-Breaking:** If two modules share identical scores, alphabetical sorting via `localeCompare` resolves ties deterministically.
2. **Guaranteed Non-Empty Deep Tier (`Math.max(1, ...)`):** In smaller repositories (1 to 6 modules), naive 15% rounding yields zero deep modules. Atlas uses `Math.max(1, Math.round(total * 0.15))`, guaranteeing that **at least one module is always allocated to the deep tier**.

### Real-World Analogy
> It is like emergency trauma triage: surgeons and intensive care units are allocated to critical cases (top 15% Deep), standard recovery wards handle moderate injuries (35% Standard), and outpatient clinics handle minor checkups (50% Light).

---

## 2. Documented Source Code: `src/modules/scoring/tiers.ts`

```typescript
import type { ModuleScore } from "./composite-score";

/**
 * Context depth tiers assigned by Forge614 Atlas.
 * 
 * - `"profundo"`: Full AST dependency graph, public contracts, deep summary.
 * - `"estandar"`: Public signature interface map and executive summary.
 * - `"ligero"`: One-line summary and file paths.
 */
export type Tier = "ligero" | "estandar" | "profundo";

/**
 * Evaluated module descriptor with assigned budget tier.
 */
export interface TieredModule extends ModuleScore {
  tier: Tier;
}

/**
 * Assigns context depth tiers based on composite scores.
 * 
 * Target Percentile Distribution:
 * - Top ~15%: Deep tier (`"profundo"`).
 * - Next ~35%: Standard tier (`"estandar"`).
 * - Remaining ~50%: Light tier (`"ligero"`).
 * 
 * Determinism Rules:
 * 1. Stable Sort with Alphabetical Tie-Breaking:
 *    - Primary: Descending score (`b.score - a.score`).
 *    - Secondary: Ascending name (`a.name.localeCompare(b.name)`).
 * 2. Guaranteed Deep Module (`Math.max(1, ...)`):
 *    - Guarantees at least 1 module is classified as `"profundo"` whenever total > 0.
 * 3. Gap-Free Sequential Assignment:
 *    - `[0, deepCount)` -> `"profundo"`.
 *    - `[deepCount, deepCount + standardCount)` -> `"estandar"`.
 *    - Remainder -> `"ligero"`.
 * 
 * @param scores - List of composite module scores
 * @returns Sorted list of modules with assigned `tier` property
 */
export function assignTiers(scores: ModuleScore[]): TieredModule[] {
  // 1. Sort descending by score; break ties alphabetically by name
  const sorted = [...scores].sort((a, b) => {
    const diff = b.score - a.score;
    if (diff !== 0) {
      return diff;
    }
    return a.name.localeCompare(b.name);
  });

  const total = sorted.length;

  // 2. Compute percentile boundaries
  const deepCount = total > 0 ? Math.max(1, Math.round(total * 0.15)) : 0;
  const standardCount = Math.round(total * 0.35);

  // 3. Map each element to its corresponding tier
  return sorted.map((module, index) => {
    let tier: Tier;

    if (index < deepCount) {
      tier = "profundo";
    } else if (index < deepCount + standardCount) {
      tier = "estandar";
    } else {
      tier = "ligero";
    }

    return {
      ...module,
      tier,
    };
  });
}
```

---

## 3. Automated Tests: `src/modules/scoring/tiers.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import { assignTiers } from "./tiers";
import type { ModuleScore } from "./composite-score";

describe("assignTiers", () => {
  test("splits 20 modules into roughly 50/35/15 by descending score", () => {
    // Monorepo scenario with 20 modules:
    // Scores from 20 down to 1.
    // - Deep: round(20 * 0.15) = 3 modules (top 15%).
    // - Standard: round(20 * 0.35) = 7 modules (next 35%).
    // - Light: 20 - (3 + 7) = 10 modules (remaining 50%).
    const scores: ModuleScore[] = Array.from({ length: 20 }, (_, index) => ({
      name: `module-${index}`,
      score: 20 - index,
    }));

    const tiered = assignTiers(scores);
    const byTier = {
      profundo: tiered.filter(m => m.tier === "profundo").map(m => m.name),
      estandar: tiered.filter(m => m.tier === "estandar").map(m => m.name),
      ligero: tiered.filter(m => m.tier === "ligero").map(m => m.name),
    };

    expect(byTier.profundo).toHaveLength(3);
    expect(byTier.estandar).toHaveLength(7);
    expect(byTier.ligero).toHaveLength(10);
    expect(byTier.profundo).toEqual(["module-0", "module-1", "module-2"]);
  });

  test("a project with a single module still gets a tier, never crashes", () => {
    // Edge case: 1 module project.
    // Math.max(1, ...) ensures it receives 'profundo'.
    const scores: ModuleScore[] = [{ name: "only", score: 5 }];
    const tiered = assignTiers(scores);

    expect(tiered).toHaveLength(1);
    expect(tiered[0]?.tier).toBe("profundo");
  });

  test("ties on score break deterministically by name, regardless of input order", () => {
    // Tie-break scenario: 4 modules with identical scores.
    // Order of inputs must not alter alphabetical sorting.
    const scoresInOneOrder: ModuleScore[] = [
      { name: "zebra", score: 5 },
      { name: "mango", score: 5 },
      { name: "apple", score: 5 },
      { name: "kiwi", score: 5 },
    ];
    const scoresInAnotherOrder: ModuleScore[] = [
      { name: "kiwi", score: 5 },
      { name: "apple", score: 5 },
      { name: "zebra", score: 5 },
      { name: "mango", score: 5 },
    ];

    const tieredA = assignTiers(scoresInOneOrder);
    const tieredB = assignTiers(scoresInAnotherOrder);

    const namesA = tieredA.map(m => m.name);
    const namesB = tieredB.map(m => m.name);

    expect(namesA).toEqual(["apple", "kiwi", "mango", "zebra"]);
    expect(namesB).toEqual(["apple", "kiwi", "mango", "zebra"]);

    const tierByNameA = Object.fromEntries(tieredA.map(m => [m.name, m.tier]));
    const tierByNameB = Object.fromEntries(tieredB.map(m => [m.name, m.tier]));
    expect(tierByNameA).toEqual(tierByNameB);
  });
});
```
