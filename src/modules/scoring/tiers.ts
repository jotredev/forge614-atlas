/**
 * Reparte los módulos en tres niveles de análisis (`profundo`, `estandar` y `ligero`) según su puntuación compuesta: los ordena
 * de mayor a menor puntuación y toma, aproximadamente, el 15 % de arriba como profundo, el 35 % siguiente como estándar y el resto como ligero.
 * Existe para que Atlas dedique un modelo más capaz a los módulos más riesgosos y uno más barato a los demás.
 * Lo usa `buildRunPlan` (en `src/modules/cli/build-run-plan.ts`) y `src/index.ts` reexporta `assignTiers`, `Tier` y `TieredModule`;
 * el nivel elige el modelo (`resolveTaskConfig`), fija el orden de despacho (`dispatchModules`) y se cuenta aparte en el informe final.
 * Piezas: `Tier`, `TieredModule` y `assignTiers`.
 */
import type { ModuleScore } from "./composite-score";

/**
 * Nivel de análisis que Atlas asigna a un módulo: `"profundo"` (los de mayor puntuación), `"estandar"` (los intermedios) y
 * `"ligero"` (el resto).
 * Cada nivel usa un modelo distinto de Workers en `resolveTaskConfig`, define el orden de despacho (primero `profundo`) y
 * se cuenta por separado en el informe final; no cambia el texto del análisis que se le pide al modelo.
 */
export type Tier = "ligero" | "estandar" | "profundo";

/**
 * Módulo evaluado con su puntuación compuesta y el nivel de análisis asignado.
 */
export interface TieredModule extends ModuleScore {
  /** Nivel de análisis asignado según el lugar del módulo en la lista ordenada por puntuación. */
  tier: Tier;
}

/**
 * Asigna niveles de análisis a partir de las puntuaciones compuestas.
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
 *    - En repositorios muy pequeños (de 1 a 3 módulos), el 15% redondeado daría `0` módulos profundos
 *      (con 4 o más ya da 1 al redondear: 4 × 0,15 = 0,6).
 *    - Mediante `Math.max(1, Math.round(total * 0.15))`, se asegura que, si hay algún módulo, SIEMPRE exista al menos 1
 *      clasificado en el nivel `"profundo"`.
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
  // (se ordena una copia, para no cambiar el orden de la lista que se recibió)
  const sorted = [...scores].sort((a, b) => {
    const diff = b.score - a.score;
    if (diff !== 0) {
      return diff;
    }
    return a.name.localeCompare(b.name);
  });

  const total = sorted.length;

  // 2. Calcular límites percentiles (garantizando al menos 1 módulo profundo si total > 0)
  // Math.round lleva cada cuenta al entero más cercano; el resto de los módulos queda en el nivel ligero.
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
