/**
 * Convierte el resultado de una corrida terminada en un resumen de sesión y cierra esa sesión.
 * `dispatch-modules.ts` entrega los conteos y nombres que forman el informe final.
 */
import { type MemoryStore, type Session, type SummaryFields } from "forge614-engram";

/** Datos de módulos, niveles, consumo y pausas necesarios para el resumen final de Atlas. */
export interface FinalReport {
  /** Nombre o ruta del proyecto (`dispatchModules` manda la ruta de la carpeta); aparece en el objetivo (`goal`) del resumen. */
  repoName: string;
  /** Número de módulos analizados con éxito en cada nivel de análisis (los saltados no se cuentan). */
  tierBreakdown: { deep: number; standard: number; light: number };
  /** Nombre del motor elegido para cada nivel. */
  engineByTier: Record<"deep" | "standard" | "light", string>;
  /** Número de trabajadores (ayudantes de IA, uno por módulo) que terminaron su módulo en cada nivel. */
  totalWorkersByTier: Record<"deep" | "standard" | "light", number>;
  /** Total de tokens (las unidades de texto que procesa la IA) consumidos por los trabajadores; hoy `dispatchModules` manda 0 porque Workers no los cuenta. */
  tokensConsumed: number;
  /** Duración acumulada de la corrida en milisegundos. */
  totalTimeMs: number;
  /** Número de pausas por cuota registradas para el proyecto. */
  pauseCount: number;
  /** Nombres de los módulos cuyo informe se guardó en Engram. */
  analyzedModuleNames: string[];
  /** Nombres de módulos saltados o fallidos que quedan en los pasos siguientes. */
  skippedModuleNames: string[];
  /**
   * Subconjunto de `skippedModuleNames` cuyo reporte Engram rechazó con `SECRET_REJECTED` por parecer
   * un secreto. Campo aditivo: quien lee el resultado y no lo conoce puede ignorarlo.
   */
  rejectedReportModuleNames?: string[];
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
 * el mismo `sessionId` (ver sección 4 de `docs/superpowers/specs/2026-09-19-atlas-engram-integration-design.md`). Representar una pausa es
 * simplemente detenerse sin llamar nada más — dejar la sesión abierta ES la
 * señal de "quedó a medias" (sección 6 del mismo documento); el siguiente `init`
 * la encuentra abierta automáticamente.
 * @param store Base de memorias donde se escribe el resumen y se cierra la sesión.
 * @param session Sesión de la corrida ya terminada.
 * @param report Conteos y nombres que se incorporan al resumen.
 * @throws `SUMMARY_TOPIC_CONFLICT` si el tema reservado del resumen está ocupado; `SESSION_NOT_FOUND` o `SESSION_KIND` si Engram no puede cerrar la sesión indicada.
 */
export function finalizeRun(store: MemoryStore, session: Session, report: FinalReport): void {
  // Los módulos rechazados por parecer secretos se mencionan solo si hay alguno; no se guarda su texto rechazado.
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
    nextSteps: [
      report.skippedModuleNames.length === 0
        ? "Ninguno; análisis completo."
        : `Módulos saltados o fallidos: ${report.skippedModuleNames.join(", ")}.`,
      ...(report.rejectedReportModuleNames?.length
        ? [`Engram rechazó el reporte de estos módulos por parecer un secreto: ${report.rejectedReportModuleNames.join(", ")}.`]
        : []),
    ].join(" "),
    files: report.analyzedModuleNames,
  };

  // La clave de petición permite repetir el guardado del mismo resumen sin crear otro recuerdo.
  store.saveSessionSummary(session.projectId, session.sessionId, fields, {
    requestKey: `${session.sessionId}:summary`,
  });
  store.endSession(session.projectId, session.sessionId);
}
