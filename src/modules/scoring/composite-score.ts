export interface ModuleSignals {
  name: string;
  cyclomatic: number;
  fanIn: number;
  churn: number;
  testGap: number;
}

export interface ModuleScore {
  name: string;
  score: number;
}

export function computeCompositeScores(signals: ModuleSignals[]): ModuleScore[] {
  const cyclomaticNorm = normalize(signals.map(s => s.cyclomatic));
  const fanInNorm = normalize(signals.map(s => s.fanIn));
  const churnNorm = normalize(signals.map(s => s.churn));

  return signals.map((signal, index) => {
    const base = 0.35 * (cyclomaticNorm[index] ?? 0) + 0.35 * (fanInNorm[index] ?? 0) + 0.3 * (churnNorm[index] ?? 0);
    const score = base * (1 + 0.2 * signal.testGap);
    return { name: signal.name, score };
  });
}

function normalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0);
  return values.map(value => (value - min) / (max - min));
}
