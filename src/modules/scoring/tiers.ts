import type { ModuleScore } from "./composite-score";

export type Tier = "ligero" | "estandar" | "profundo";

export interface TieredModule extends ModuleScore {
  tier: Tier;
}

export function assignTiers(scores: ModuleScore[]): TieredModule[] {
  const sorted = [...scores].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const total = sorted.length;
  const deepCount = Math.max(1, Math.round(total * 0.15));
  const standardCount = Math.round(total * 0.35);

  return sorted.map((module, index) => {
    let tier: Tier;
    if (index < deepCount) tier = "profundo";
    else if (index < deepCount + standardCount) tier = "estandar";
    else tier = "ligero";
    return { ...module, tier };
  });
}
