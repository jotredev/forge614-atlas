import { describe, expect, test } from "bun:test";
import { computeCompositeScores } from "./composite-score";

describe("computeCompositeScores", () => {
  test("weights cyclomatic and fan-in higher than churn, and never lets testGap fully decide", () => {
    const signals = [
      { name: "trivial", cyclomatic: 0, fanIn: 0, churn: 0, testGap: 0 },
      { name: "complex-untested", cyclomatic: 10, fanIn: 8, churn: 5, testGap: 1 },
    ];

    const [trivial, complex] = computeCompositeScores(signals);

    expect(trivial?.score).toBe(0);
    expect(complex?.score).toBeGreaterThan(0);
    // base = 0.35*1 + 0.35*1 + 0.3*1 = 1; score = 1 * (1 + 0.2*1) = 1.2
    expect(complex?.score).toBeCloseTo(1.2, 5);
  });

  test("a module that is complex but well-tested still outranks a trivial one, without the test gap inflating it", () => {
    const signals = [
      { name: "complex-tested", cyclomatic: 10, fanIn: 8, churn: 5, testGap: 0 },
      { name: "trivial", cyclomatic: 0, fanIn: 0, churn: 0, testGap: 0 },
    ];

    const [complexTested, trivial] = computeCompositeScores(signals);

    expect(complexTested?.score).toBeCloseTo(1, 5);
    expect(trivial?.score).toBe(0);
  });
});
