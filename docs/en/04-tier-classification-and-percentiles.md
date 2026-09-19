# 04 (EN). Tier Classification and Percentiles

> **Official Technical Reference Document — Forge614 Ecosystem**  
> **Project:** Forge614 Atlas (Deep Contextualization Orchestrator)  
> **Component:** `src/modules/scoring/tiers.ts` and `src/modules/scoring/tiers.test.ts`  
> **Distribution:** Relative Percentiles (~15% Deep / ~35% Standard / ~50% Light)  
> **Sister translation:** [04. Clasificación de Niveles y Percentiles](../es/04-clasificacion-niveles-y-percentiles.md)

---

## 1. Why Relative Percentiles Instead of Fixed Thresholds?

In software architecture, complexity follows a **Power Law distribution (the Pareto Principle)**:
- In any codebase, regardless of absolute size, mission-critical architectural complexity concentrates within a compact core (auth, state machines, consensus engines, core dispatchers).
- The vast majority of files represent UI components, schemas, configuration maps, adapters, and peripheral helpers.

### The Failure of Static Thresholds
If the system relied on static absolute cutoffs (e.g., *"cyclomatic complexity > 50 equals Deep"*):
1. **In Small Repositories or Microservices:** No module would ever reach the 50 threshold; every folder would erroneously fall into "Light", dispatching shallow reasoning models to inspect the core domain logic of that service.
2. **In Massive Enterprise Monorepos:** Dozens of folders would exceed 50 merely by volume of lines of code, flooding the system with expensive "Deep" workers analyzing peripheral modules that are routine within that context.

### The Atlas Solution: Adaptive Percentiles
Atlas classifies modules **relative to the internal distribution of the codebase itself**:
- The top ~15% most intricate modules always receive maximum depth.
- The middle ~35% receive standard production analysis.
- The remaining ~50% are processed swiftly and economically.

This mathematical design ensures that Atlas scales smoothly whether analyzing a 3-module microservice or a 50-module enterprise monolith.

---

## 2. The Three Contextualization Tiers

| Tier | Proportion | Typical Code Profile | Claude Code Model | OpenAI Codex Model | Reasoning Effort |
|---|:---:|---|---|---|:---:|
| **Deep (`profundo`)** | **~15%** top | Core state engines, authentication, billing algorithms, orchestrators, dependency roots. | Opus 5 | `gpt-5.6-sol` | `medium` |
| **Standard (`estandar`)** | **~35%** middle | Domain services, stateful controllers, complex CRUD logic, data persistence adapters. | Sonnet 5 | `gpt-5.6-terra` | `medium` |
| **Light (`ligero`)** | **~50%** bottom | Type declarations (`.d.ts`), configuration maps, constant barrels, passive UI views, static styles. | Haiku 4.5 | `gpt-5.6-luna` | `low` |

---

## 3. Tier Assignment Algorithm (`tiers.ts`)

The `assignTiers` function takes an array of modules with composite scores and executes the following deterministic procedure:

```typescript
import type { ModuleScore } from "./composite-score";

export type Tier = "ligero" | "estandar" | "profundo";

export interface TieredModule extends ModuleScore {
  tier: Tier;
}

export function assignTiers(scores: ModuleScore[]): TieredModule[] {
  // 1. Sort descending by score; on tie, break deterministically by module name
  const sorted = [...scores].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  
  const total = sorted.length;
  // 2. Deep tier captures top ~15% (at least 1 for single-module repositories)
  const deepCount = Math.max(1, Math.round(total * 0.15));
  // 3. Standard tier captures next ~35%
  const standardCount = Math.round(total * 0.35);

  // 4. Map sequentially to tiers
  return sorted.map((module, index) => {
    let tier: Tier;
    if (index < deepCount) {
      tier = "profundo";
    } else if (index < deepCount + standardCount) {
      tier = "estandar";
    } else {
      tier = "ligero";
    }
    return { ...module, tier };
  });
}
```

---

## 4. Determinism Guarantees and Edge Cases

### 4.1 Alphabetical Tie-Breaking
When two or more modules achieve identical composite scores (for instance, multiple brand-new modules with $Score = 0.0$ or symmetrical utility packages), traditional JavaScript `sort` calls without tie-breakers can produce unstable orderings depending on filesystem read order.

Atlas introduces **`|| a.name.localeCompare(b.name)`**:
- If $Score_A = Score_B$, the module with the alphabetically smaller name deterministically ranks first.
- Guarantees that subsequent executions across the same repository yield **the exact same classification** (<span color="green">100% deterministic</span>).

### 4.2 Single-Module Codebases ($total = 1$)
When a repository exposes only one root module:
- $\text{deepCount} = \max(1, \text{round}(1 \cdot 0.15)) = \max(1, 0) = 1$.
- The single module is immediately assigned to `profundo`.
- The routine never throws or produces out-of-bounds index errors.

### 4.3 Concrete Distribution on 20 Modules
On a codebase with $20$ discovered modules:
- $\text{deepCount} = \max(1, \text{round}(20 \cdot 0.15)) = \max(1, 3) = 3$ modules (`profundo` — $15\%$).
- $\text{standardCount} = \text{round}(20 \cdot 0.35) = 7$ modules (`estandar` — $35\%$).
- Remainder = $20 - 3 - 7 = 10$ modules (`ligero` — $50\%$).
- Exactly fulfills the target mathematical distribution.
