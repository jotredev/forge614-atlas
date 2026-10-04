/**
 * Calcula la puntuación compuesta de complejidad (composite score) de los módulos a partir de sus señales.
 * Existe para normalizar (llevar a 0–1) y ponderar cuatro señales: ciclomática (caminos del código), fan-in (cuántos módulos
 * dependen de él), churn (cambios en git) y brecha de pruebas (qué parte no tiene pruebas), en una sola calificación de riesgo
 * por módulo; no ordena, el orden lo da `assignTiers`.
 * Lo usa `buildRunPlan` (en `src/modules/cli/build-run-plan.ts`); `assignTiers` convierte sus puntuaciones en el nivel de
 * análisis de cada módulo; `src/index.ts` lo reexporta.
 * Pieza principal: `computeCompositeScores`.
 */
/**
 * Señales cuantitativas sin procesar recopiladas para un módulo determinado.
 */
export interface ModuleSignals {
  /** Nombre identificador del módulo */
  name: string;
  /** Suma acumulada de complejidad ciclomática de código productivo */
  cyclomatic: number;
  /** Cantidad de otros módulos dependientes (in-degree en el grafo) */
  fanIn: number;
  /** Total de modificaciones históricas en commits de Git */
  churn: number;
  /** Brecha de cobertura de pruebas unitarias en rango [0.0, 1.0] */
  testGap: number;
}

/**
 * Puntuación de complejidad compuesta final calculada para un módulo.
 */
export interface ModuleScore {
  /** Nombre del módulo */
  name: string;
  /** Puntuación escalar no negativa resultante de la normalización y ponderación */
  score: number;
}

/**
 * Calcula la Puntuación Compuesta de Complejidad para una colección de módulos.
 * 
 * Desafío Matemático:
 * - Las tres señales estructurales manejan escalas de magnitud completamente dispares:
 *   - Complejidad Ciclomática: Típicamente entre 1 y 500.
 *   - Centralidad Fan-In: Típicamente entre 0 y 20 (acotada por la cantidad de módulos).
 *   - Volatilidad Git Churn: Puede superar los 1,000 commits en proyectos maduros.
 * - Si se sumaran directamente, el Churn dominaría el 95% de la decisión, invisibilizando
 *   módulos arquitectónicamente críticos pero estables.
 * 
 * Solución de Normalización Min-Max:
 * 1. Cada señal $X$ se proyecta al rango adimensional $[0.0, 1.0]$:
 *    $X_{\text{norm}} = \frac{X - \min(X)}{\max(X) - \min(X)}$
 * 2. Si todos los módulos poseen exactamente el mismo valor ($\max = \min$), la varianza es cero.
 *    Para evitar indeterminación por división entre cero ($0/0$), se asigna $0.0$ a todos.
 * 
 * Ponderación Lineal Base:
 * - $\text{Base} = 0.35 \cdot \text{Cyclomatic}_{\text{norm}} + 0.35 \cdot \text{FanIn}_{\text{norm}} + 0.30 \cdot \text{Churn}_{\text{norm}}$
 *   - 35% Complejidad Ciclomática (dificultad cognitiva intrínseca del código).
 *   - 35% Centralidad Fan-In (impacto sistémico de cambio y riesgo de rotura transversal).
 *   - 30% Volatilidad Churn (frecuencia empírica de edición y cambio humano).
 * 
 * Modificador de Fragilidad por Brecha de Pruebas:
 * - $\text{Score} = \text{Base} \cdot (1 + 0.20 \cdot \text{TestGap})$
 *   - Un módulo con cobertura perfecta ($\text{TestGap} = 0.0$) mantiene su puntuación base intacta.
 *   - Un módulo sin pruebas ($\text{TestGap} = 1.0$) recibe un recargo del +20% en su puntuación.
 * 
 * @param signals - Lista de señales crudas de todos los módulos del proyecto
 * @returns Lista de puntuaciones compuestas preservando el orden de entrada
 */
export function computeCompositeScores(signals: ModuleSignals[]): ModuleScore[] {
  // 1. Normalización Min-Max independiente por cada vector de señal
  const cyclomaticNorm = normalize(signals.map(s => s.cyclomatic));
  const fanInNorm = normalize(signals.map(s => s.fanIn));
  const churnNorm = normalize(signals.map(s => s.churn));

  // 2. Combinación lineal con aplicación del multiplicador de fragilidad
  return signals.map((signal, index) => {
    // 3. Puntuación base ponderada
    const base =
      0.35 * (cyclomaticNorm[index] ?? 0) +
      0.35 * (fanInNorm[index] ?? 0) +
      0.30 * (churnNorm[index] ?? 0);

    // 4. Modificador de riesgo (hasta +20% si testGap = 1.0)
    const score = base * (1 + 0.2 * signal.testGap);

    return {
      name: signal.name,
      score,
    };
  });
}

/**
 * Función pura auxiliar que proyecta un arreglo numérico al rango [0.0, 1.0] usando Min-Max.
 * 
 * Manejo de estabilidad numérica:
 * - Si el arreglo tiene longitud 0 o 1, o todos los valores son idénticos,
 *   $\max(V) = \min(V)$ produce un divisor de cero. En ese escenario, retorna un arreglo
 *   de ceros preservando la longitud original.
 * 
 * @param values - Vector numérico a normalizar
 * @returns Nuevo vector numérico escalado a [0.0, 1.0]
 */
function normalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Protección contra división entre cero cuando no hay dispersión en los datos
  if (max === min) {
    return values.map(() => 0);
  }

  // Escalado lineal estándar a [0.0, 1.0]
  return values.map(value => (value - min) / (max - min));
}
