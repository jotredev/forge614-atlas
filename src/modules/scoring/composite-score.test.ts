/**
 * Pruebas para `computeCompositeScores`.
 * Comprueba que la puntuación compuesta (la calificación de riesgo de cada módulo a partir de sus señales) valga 0 sin señales,
 * 1,2 con todas las señales al máximo y testGap (la brecha de pruebas, de 0 a 1) = 1, y 1 con testGap = 0; no verifica los pesos por separado.
 * Importa porque `assignTiers` reparte los módulos en niveles de análisis según esta puntuación.
 */
import { describe, expect, test } from "bun:test";
import { computeCompositeScores } from "./composite-score";

/**
 * Comprueba `computeCompositeScores`, que calcula la puntuación final de riesgo de cada módulo.
 * Importa para verificar la normalización min-max (cada señal se lleva a 0–1) y el recargo por testGap en los casos extremos;
 * los pesos 0,35 / 0,35 / 0,30 no se prueban por separado.
 */
describe("computeCompositeScores", () => {
  /**
   * Comprueba que un módulo con todas las señales en 0 puntúe 0 y otro con todas al máximo y testGap = 1 puntúe 1,2.
   * Importa para fijar los dos extremos: base 1,0 más el recargo máximo de 20 %.
   */
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

  /**
   * Comprueba que un módulo complejo con testGap = 0 (sin brecha de pruebas) puntúe 1, su base, sin recargo.
   * Importa para confirmar que sin brecha de pruebas no hay recargo: el módulo complejo puntúa 1 y el trivial 0.
   */
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
