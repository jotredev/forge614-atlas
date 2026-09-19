import { describe, expect, test } from "bun:test";
import { assignTiers } from "./tiers";
import type { ModuleScore } from "./composite-score";

describe("assignTiers", () => {
  test("splits 20 modules into roughly 50/35/15 by descending score", () => {
    const scores: ModuleScore[] = Array.from({ length: 20 }, (_, index) => ({
      name: `module-${index}`,
      score: 20 - index, // module-0 has the highest score, module-19 the lowest
    }));

    const tiered = assignTiers(scores);
    const byTier = {
      profundo: tiered.filter(m => m.tier === "profundo").map(m => m.name),
      estandar: tiered.filter(m => m.tier === "estandar").map(m => m.name),
      ligero: tiered.filter(m => m.tier === "ligero").map(m => m.name),
    };

    expect(byTier.profundo).toHaveLength(3); // round(20 * 0.15)
    expect(byTier.estandar).toHaveLength(7); // round(20 * 0.35)
    expect(byTier.ligero).toHaveLength(10);
    expect(byTier.profundo).toEqual(["module-0", "module-1", "module-2"]);
  });

  test("a project with a single module still gets a tier, never crashes", () => {
    const scores: ModuleScore[] = [{ name: "only", score: 5 }];
    const tiered = assignTiers(scores);

    expect(tiered).toHaveLength(1);
    expect(tiered[0]?.tier).toBe("profundo");
  });

  test("ties on score break deterministically by name, regardless of input order", () => {
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

    // All-tied scores should sort alphabetically among ties, independent of input order.
    expect(namesA).toEqual(["apple", "kiwi", "mango", "zebra"]);
    expect(namesB).toEqual(["apple", "kiwi", "mango", "zebra"]);

    // Tier assignment per module name should also match between the two orderings.
    const tierByNameA = Object.fromEntries(tieredA.map(m => [m.name, m.tier]));
    const tierByNameB = Object.fromEntries(tieredB.map(m => [m.name, m.tier]));
    expect(tierByNameA).toEqual(tierByNameB);
  });
});
