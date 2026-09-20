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
  skippedModuleNames: string[];
}

/**
 * Cierra una corrida de análisis con un resumen final en Engram.
 *
 * PRECONDICIÓN: solo debe llamarse cuando la corrida está TOTALMENTE
 * terminada — todos los módulos ya quedaron procesados, sea con éxito o
 * porque fallaron/se saltaron permanentemente. Una corrida pausada o
 * interrumpida a medias (ej. cuota de la suscripción agotada) NUNCA debe
 * llamar a esta función: `finalizeRun` cierra la sesión de forma
 * incondicional (`endSession`), y una sesión cerrada no puede reabrirse con
 * el mismo `sessionId` (ver spec sección 4). Representar una pausa es
 * simplemente detenerse sin llamar nada más — dejar la sesión abierta ES la
 * señal de "quedó a medias" (spec sección 6); el siguiente `init`/`resume`
 * la encuentra abierta automáticamente.
 */
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
    nextSteps: report.skippedModuleNames.length === 0
      ? "Ninguno; análisis completo."
      : `Módulos saltados o fallidos: ${report.skippedModuleNames.join(", ")}.`,
    files: report.analyzedModuleNames,
  };

  store.saveSessionSummary(session.projectId, session.sessionId, fields, {
    requestKey: `${session.sessionId}:summary`,
  });
  store.endSession(session.projectId, session.sessionId);
}
