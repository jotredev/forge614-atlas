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
