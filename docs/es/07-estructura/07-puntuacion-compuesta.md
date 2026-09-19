# 07.07 Puntuación Compuesta Normalizada (Composite Score)

> **Documento de Arquitectura y Código — Ecosistema Forge614 Atlas**  
> **Alcance:** `src/modules/scoring/composite-score.ts` y `composite-score.test.ts`  
> **Traducción hermana:** [07.07 (EN) Normalized Composite Score (composite-score.ts and test)](../../en/07-structure/07-composite-scoring.md)

---

## 1. Justificación Arquitectónica

Las tres señales cuantitativas estructurales (Ciclomática, Fan-In y Churn) operan en dominios numéricos radicalmente diferentes:
- La **complejidad ciclomática** suele rondar decenas o cientos de puntos.
- La **centralidad Fan-In** está acotada por el número total de módulos (rara vez supera 10 o 20).
- La **volatilidad Git Churn** puede superar fácilmente los 1,000 cambios en repositorios maduros.

Si se combinaran sin normalizar, el Churn dominaría el 95% del peso de la decisión, ignorando módulos centrales de arquitectura que son estables pero altamente complejos. Para solucionar esto, Atlas aplica:
1. **Normalización Min-Max:** Cada señal se proyecta independientemente al intervalo adimensional $[0.0, 1.0]$:
   $$X_{\text{norm}} = \frac{X - \min(X)}{\max(X) - \min(X)}$$
2. **Protección de Varianza Cero:** Si todos los módulos tienen exactamente el mismo valor ($\max = \min$), para evitar una indeterminación por división entre cero ($0/0$), se asigna $0.0$ a todos los elementos del vector.
3. **Ponderación Balanceada:**
   $$\text{Base} = 0.35 \cdot \text{Cyclo}_{\text{norm}} + 0.35 \cdot \text{FanIn}_{\text{norm}} + 0.30 \cdot \text{Churn}_{\text{norm}}$$
4. **Modificador de Fragilidad:**
   $$\text{Score} = \text{Base} \cdot (1 + 0.20 \cdot \text{TestGap})$$

### Analogía del Mundo Real
> Es como la calificación de un decatlón olímpico: no puedes sumar directamente los segundos de una carrera de 100 metros con los metros alcanzados en salto de longitud o los kilogramos de lanzamiento de peso. Cada disciplina se normaliza contra los mejores y peores competidores para obtener una puntuación justa y comparable.

---

## 2. Código Fuente Documentado: `src/modules/scoring/composite-score.ts`

```typescript
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
```

---

## 3. Pruebas Automatizadas: `src/modules/scoring/composite-score.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import { computeCompositeScores } from "./composite-score";

describe("computeCompositeScores", () => {
  test("weights cyclomatic and fan-in higher than churn, and never lets testGap fully decide", () => {
    // Escenario: Dos módulos con perfiles contrastantes.
    // 'trivial': señales en 0 -> Min-Max resulta en 0 -> puntuación 0.
    // 'complex-untested': ciclomática=10, fanIn=8, churn=5, testGap=1.0.
    // Min-Max normaliza los máximos a 1.0.
    // Base = 0.35 * 1 + 0.35 * 1 + 0.30 * 1 = 1.0.
    // Score final = base * (1 + 0.20 * testGap) = 1.0 * 1.20 = 1.20.
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
    // Escenario: Módulo complejo pero con excelente cobertura de pruebas (testGap = 0).
    // Su puntuación base = 1.0.
    // Como testGap = 0, el multiplicador es (1 + 0) = 1.0, sin recargo por fragilidad.
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
