import { type MemoryStore, type Session, type SummaryFields } from "forge614-engram";

export interface FinalReport {
  repoName: string;
  tierBreakdown: { deep: number; standard: number; light: number };
  engineByTier: Record<"deep" | "standard" | "light", string>;
  totalWorkersByTier: Record<"deep" | "standard" | "light", number>;
  tokensConsumed: number;
  totalTimeMs: number;
  pauseCount: number;
  analyzedModuleNames: string[];
  pendingModuleNames: string[];
}

export function finalizeRun(store: MemoryStore, session: Session, report: FinalReport): void {
  const fields: SummaryFields = {
    goal: `Contextualización profunda de ${report.repoName}`,
    instructions: "Generado automáticamente por Atlas al completar el análisis.",
    discoveries: `Distribución de niveles — Profundo: ${report.tierBreakdown.deep}, Estándar: ${report.tierBreakdown.standard}, Ligero: ${report.tierBreakdown.light}.`,
    accomplishments: [
      `Motor por nivel — Profundo: ${report.engineByTier.deep}, Estándar: ${report.engineByTier.standard}, Ligero: ${report.engineByTier.light}.`,
      `Mandaderos totales por nivel — Profundo: ${report.totalWorkersByTier.deep}, Estándar: ${report.totalWorkersByTier.standard}, Ligero: ${report.totalWorkersByTier.light}.`,
      `Tokens consumidos: ${report.tokensConsumed}.`,
      `Tiempo total: ${report.totalTimeMs} ms.`,
      `Pausas/reanudaciones: ${report.pauseCount}.`,
    ].join("\n"),
    nextSteps: report.pendingModuleNames.length === 0
      ? "Ninguno; análisis completo."
      : `Módulos pendientes: ${report.pendingModuleNames.join(", ")}.`,
    files: report.analyzedModuleNames,
  };

  store.saveSessionSummary(session.projectId, session.sessionId, fields, {
    requestKey: `${session.sessionId}:summary`,
  });
  store.endSession(session.projectId, session.sessionId);
}
