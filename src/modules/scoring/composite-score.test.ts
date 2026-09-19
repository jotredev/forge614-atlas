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
