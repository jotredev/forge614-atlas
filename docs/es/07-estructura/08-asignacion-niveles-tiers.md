# 07.08 Asignación de Niveles de Presupuesto (Tiers)

> **Documento de Arquitectura y Código — Ecosistema Forge614 Atlas**  
> **Alcance:** `src/modules/scoring/tiers.ts` y `tiers.test.ts`  
> **Traducción hermana:** [07.08 (EN) Budget Tier Allocation (tiers.ts and test)](../../en/07-structure/08-tier-allocation.md)

---

## 1. Justificación Arquitectónica

El propósito supremo del motor de puntuación en el Plan 1/5 es alimentar el orquestador de contextualización con una clasificación determinista de presupuesto de tokens y atención de los modelos de lenguaje:
- **Nivel Profundo (`"profundo"`):** Asignado al top ~15% de módulos más complejos. Recibe presupuesto exhaustivo: grafo completo de dependencias AST, contratos públicos y resumen arquitectónico profundo.
- **Nivel Estándar (`"estandar"`):** Asignado al siguiente ~35% de módulos. Recibe mapa de firmas públicas y resumen ejecutivo intermedio.
- **Nivel Ligero (`"ligero"`):** Asignado al restante ~50% de módulos. Recibe únicamente resumen de una línea y ubicación de rutas.

### Garantías Matemáticas Esenciales
1. **Desempate Lexicográfico Determinista:** Si dos módulos tienen idéntica puntuación compuesta, se desempata por orden alfabético de nombre mediante `localeCompare`. Esto erradica cualquier no-determinismo introducido por el orden de recorrido en disco.
2. **Garantía de No Vacío en Profundo (`Math.max(1, ...)`):** En repositorios pequeños (de 1 a 6 módulos), un cálculo ciego del 15% daría cero módulos profundos. Atlas utiliza `Math.max(1, Math.round(total * 0.15))`, garantizando que **siempre exista al menos un módulo clasificado como profundo**, evitando que el orquestador opere en vacío.

### Analogía del Mundo Real
> Es como el triaje de un hospital de traumatología: los cirujanos y el quirófano avanzado se reservan para los pacientes críticos (top 15% Profundo), las salas de curación intermedias para fracturas y cuidados estándar (35%), y las consultas ambulatorias rápidas para molestias leves (50% Ligero).

---

## 2. Código Fuente Documentado: `src/modules/scoring/tiers.ts`

```typescript
import type { ModuleScore } from "./composite-score";

/**
 * Niveles jerárquicos de profundidad de contexto asignables por Forge614 Atlas.
 * 
 * - `"profundo"`: Requiere grafo completo de dependencias AST, contratos públicos y resumen arquitectónico.
 * - `"estandar"`: Requiere mapa de firmas públicas y resumen ejecutivo.
 * - `"ligero"`: Requiere únicamente el resumen de una línea y ubicación de rutas.
 */
export type Tier = "ligero" | "estandar" | "profundo";

/**
 * Módulo evaluado con su nivel de presupuesto de contexto asignado.
 */
export interface TieredModule extends ModuleScore {
  tier: Tier;
}

/**
 * Asigna niveles de profundidad de contexto a partir de las puntuaciones compuestas.
 * 
 * Distribución Percentil Objetivo:
 * - Top ~15%: Nivel `"profundo"` (Módulos de máxima criticidad y complejidad).
 * - Siguiente ~35%: Nivel `"estandar"` (Módulos de relevancia intermedia).
 * - Restante ~50%: Nivel `"ligero"` (Módulos periféricos, utilidades o componentes estables).
 * 
 * Reglas de Determinismo y Estabilidad:
 * 1. Ordenamiento Estable con Desempate Alfabético:
 *    - Criterio primario: Orden descendente por `score` (`b.score - a.score`).
 *    - Criterio secundario de desempate: Orden lexicográfico ascendente por `name` (`a.name.localeCompare(b.name)`).
 *    - Esta garantía elimina cualquier comportamiento errático si múltiples módulos tienen puntuación idéntica.
 * 2. Garantía de Módulo Profundo (`Math.max(1, ...)`):
 *    - En repositorios pequeños (ej. de 1 a 6 módulos), el 15% daría `0` módulos profundos si se aplicara un redondeo ciego.
 *    - Mediante `Math.max(1, Math.round(total * 0.15))`, se asegura que SIEMPRE exista al menos 1 módulo clasificado
 *      en el nivel `"profundo"`, garantizando que el orquestador nunca opere en modo vacío.
 * 3. Asignación Secuencial sin Huecos:
 *    - Índices en `[0, deepCount)` -> `"profundo"`.
 *    - Índices en `[deepCount, deepCount + standardCount)` -> `"estandar"`.
 *    - Índices restantes -> `"ligero"`.
 * 
 * @param scores - Lista de puntuaciones compuestas calculadas para cada módulo
 * @returns Lista de módulos clasificados con su propiedad `tier`, ordenados por prioridad descendente
 */
export function assignTiers(scores: ModuleScore[]): TieredModule[] {
  // 1. Ordenar descendente por puntuación; desempatar alfabéticamente por nombre
  const sorted = [...scores].sort((a, b) => {
    const diff = b.score - a.score;
    if (diff !== 0) {
      return diff;
    }
    return a.name.localeCompare(b.name);
  });

  const total = sorted.length;

  // 2. Calcular límites percentiles (garantizando al menos 1 módulo profundo si total > 0)
  const deepCount = total > 0 ? Math.max(1, Math.round(total * 0.15)) : 0;
  const standardCount = Math.round(total * 0.35);

  // 3. Mapear cada elemento al nivel correspondiente según su índice en la lista ordenada
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

## 3. Pruebas Automatizadas: `src/modules/scoring/tiers.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import { assignTiers } from "./tiers";
import type { ModuleScore } from "./composite-score";

describe("assignTiers", () => {
  test("splits 20 modules into roughly 50/35/15 by descending score", () => {
    // Escenario de monorrepo estándar con 20 módulos:
    // Scores decrecientes desde 20 hasta 1.
    // - Profundo: round(20 * 0.15) = 3 módulos (top 15%).
    // - Estándar: round(20 * 0.35) = 7 módulos (siguiente 35%).
    // - Ligero: 20 - (3 + 7) = 10 módulos (restante 50%).
    const scores: ModuleScore[] = Array.from({ length: 20 }, (_, index) => ({
      name: `module-${index}`,
      score: 20 - index, // module-0 tiene el score más alto (20), module-19 el más bajo (1)
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
    // Los módulos con mayor puntuación deben estar asignados al nivel más profundo
    expect(byTier.profundo).toEqual(["module-0", "module-1", "module-2"]);
  });

  test("a project with a single module still gets a tier, never crashes", () => {
    // Caso borde: Proyecto minimalista con 1 solo módulo.
    // round(1 * 0.15) = 0, pero gracias a Math.max(1, ...) se garantiza que reciba 'profundo'
    // y el orquestador nunca opere sin un módulo principal.
    const scores: ModuleScore[] = [{ name: "only", score: 5 }];
    const tiered = assignTiers(scores);

    expect(tiered).toHaveLength(1);
    expect(tiered[0]?.tier).toBe("profundo");
  });

  test("ties on score break deterministically by name, regardless of input order", () => {
    // Escenario de empate: Cuatro módulos tienen exactamente la misma puntuación (5).
    // El orden de entrada en el arreglo NO debe alterar el resultado final.
    // El desempate lexicográfico por nombre (localeCompare) debe producir siempre:
    // ['apple', 'kiwi', 'mango', 'zebra']
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

    // La asignación de niveles por cada módulo también debe ser idéntica
    const tierByNameA = Object.fromEntries(tieredA.map(m => [m.name, m.tier]));
    const tierByNameB = Object.fromEntries(tieredB.map(m => [m.name, m.tier]));
    expect(tierByNameA).toEqual(tierByNameB);
  });
});
```
