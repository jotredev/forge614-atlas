/**
 * Pruebas de `assignTiers`, que reparte los módulos en los niveles de análisis `profundo`, `estandar` y `ligero` según su puntuación.
 * Comprueban el reparto de 20 módulos (3 / 7 / 10), el caso de un solo módulo y el desempate por nombre cuando hay puntuaciones iguales.
 */
import { describe, expect, test } from "bun:test";
import { assignTiers } from "./tiers";
import type { ModuleScore } from "./composite-score";

/**
 * Comprueba `assignTiers` en tres casos: el reparto de 20 módulos, un proyecto de un solo módulo y cuatro módulos empatados.
 * Importa porque el nivel de cada módulo decide qué modelo lo analiza y en qué orden se despacha.
 */
describe("assignTiers", () => {
  /**
   * Comprueba que 20 módulos con puntuaciones de 20 a 1 se repartan en 3 profundos, 7 estándar y 10 ligeros, y que los profundos
   * sean `module-0`, `module-1` y `module-2` (los de mayor puntuación).
   * Importa porque fija el reparto aproximado 15 / 35 / 50 % y que los profundos sean los de mayor puntuación; no revisa qué módulos son estándar o ligeros.
   */
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

  /**
   * Comprueba que un proyecto con un solo módulo (`only`) reciba el nivel `profundo` y no se quede sin nivel.
   * Importa porque el 15 % de 1 módulo redondea a 0, y sin `Math.max(1, …)` ese único módulo caería en un nivel más bajo.
   */
  test("a project with a single module still gets a tier, never crashes", () => {
    // Caso borde: Proyecto minimalista con 1 solo módulo.
    // round(1 * 0.15) = 0, pero gracias a Math.max(1, ...) se garantiza que reciba 'profundo'
    // y el orquestador nunca opere sin un módulo principal.
    const scores: ModuleScore[] = [{ name: "only", score: 5 }];
    const tiered = assignTiers(scores);

    expect(tiered).toHaveLength(1);
    expect(tiered[0]?.tier).toBe("profundo");
  });

  /**
   * Comprueba que cuatro módulos con la misma puntuación (5) salgan siempre en orden alfabético (`apple`, `kiwi`, `mango`, `zebra`)
   * con dos órdenes de entrada distintos, y con el mismo nivel en cada uno.
   * Importa para que el plan no cambie según el orden en que lleguen los módulos.
   */
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
