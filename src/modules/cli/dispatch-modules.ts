/**
 * Manda los módulos a Forge614 Workers (el programa que ejecuta tareas de IA en lote) y guarda el reporte de
 * cada uno en la memoria de Engram; al final devuelve cómo terminó la corrida.
 * Existe para concentrar en un solo lugar el orden de envío, el candado de solo lectura (cada tarea se manda con
 * `readOnly: true`, para que Workers pida a Engines la garantía de que el ayudante no modifica archivos) y el manejo de cada evento.
 * Lo llama `init.ts` (dentro de su paso de despacho) y `src/index.ts` lo reexporta (lo vuelve a publicar) con `DispatchResult`.
 * Piezas: los tipos `Tier`, `ReportTier` y `DispatchResult`, y la función `dispatchModules`.
 */
import { MemoryError, type MemoryStore, type Session } from "forge614-engram";
import type { Capabilities } from "../engines-client/capabilities";
import type { FinalReport } from "../memory/finalize-run";
import { resolveModuleFiles } from "./module-files";
import { resolveTaskConfig } from "./task-config";
import { buildAnalysisPrompt } from "./analysis-prompt";
import { runWorkersBatch, type WorkersTask, type WorkersEvent } from "../workers-client/run-batch";
import { recordModuleReport } from "../memory/module-report";
import { readPauseCount, recordPause } from "../memory/pause-count";
import { finalizeRun } from "../memory/finalize-run";
import { READ_ONLY_UNSUPPORTED_PREFIX } from "./requirements";

/**
 * Nivel de profundidad de un módulo, en los nombres en español que usa el plan de corrida
 * (misma lista de valores que `Tier` de `scoring/tiers.ts`, repetida aquí como tipo local).
 */
type Tier = "ligero" | "estandar" | "profundo";
/**
 * Los mismos tres niveles con los nombres en inglés (`deep`, `standard`, `light`) que usa el reporte final
 * (`FinalReport`) como claves de sus conteos.
 */
type ReportTier = "deep" | "standard" | "light";

const TIER_TO_REPORT_TIER: Record<Tier, ReportTier> = {
  profundo: "deep",
  estandar: "standard",
  ligero: "light",
};

const TIER_DISPATCH_ORDER: Tier[] = ["profundo", "estandar", "ligero"];

/** Resultado de mandar el lote de módulos a Workers. */
export type DispatchResult =
  | { status: "completed"; report: FinalReport }
  | { status: "paused"; analyzedCount: number; pendingCount: number }
  | { status: "fatal_error"; message: string }
  // Segunda defensa: Workers se negó a correr tareas por falta de candado de solo lectura. No es un
  // módulo omitido: el análisis no se hizo y la sesión se deja abierta.
  | { status: "read_only_unsupported" };

/**
 * Manda a Workers un lote con una tarea por módulo y guarda en Engram el reporte de cada una.
 * Todas las tareas llevan `readOnly: true`, siempre, sin opción de apagarlo.
 * Las tareas salen ordenadas por nivel: primero `profundo`, luego `estandar` y al final `ligero`.
 * @param store Memoria de Engram donde se guardan los reportes de cada módulo, el contador de pausas y el resumen final.
 * @param directory Carpeta del proyecto analizado.
 * @param session Sesión de Engram de esta corrida.
 * @param workersBinaryPath Ruta del binario de Workers.
 * @param enginesBinaryPath Ruta del binario de Engines, que Workers usa para armar cada comando.
 * @param engine Motor elegido: `id` (p. ej. `claude-code`) decide el modelo de cada tarea y `executable` es la ruta del programa que Workers ejecuta.
 * @param capabilities Capacidades de ese motor (decide si se manda nivel de razonamiento).
 * @param modules Módulos pendientes con su nivel.
 * @returns `completed` con el reporte final; `paused` si se agotó la cuota (la sesión queda abierta);
 * `fatal_error` si Workers no pudo correr el lote; o `read_only_unsupported` si Workers se negó a correr las
 * tareas por falta de candado de solo lectura (tampoco se cierra la sesión).
 * @throws No lanza un código propio: la promesa se rechaza con el `Error` de `resolveTaskConfig` si el motor no está en su tabla;
 * con el de `runWorkersBatch` si Workers no se puede lanzar, imprime una línea que no es JSON o si guardar un reporte falla con un error de Engram que no sea `SECRET_REJECTED` (llega envuelto: «onEvent handler threw…», con el error original en `cause`); y con el error de Engram, sin envolver, si falla `recordPause`, `readPauseCount` o `finalizeRun`.
 */
export async function dispatchModules(
  store: MemoryStore,
  directory: string,
  session: Session,
  workersBinaryPath: string,
  enginesBinaryPath: string,
  engine: { id: string; executable: string },
  capabilities: Capabilities,
  modules: { name: string; tier: Tier }[],
): Promise<DispatchResult> {
  // Copia ordenada por nivel (el orden es estable: dentro de un mismo nivel se respeta el orden recibido).
  const orderedModules = [...modules].sort(
    (a, b) => TIER_DISPATCH_ORDER.indexOf(a.tier) - TIER_DISPATCH_ORDER.indexOf(b.tier),
  );
  const filesByModule = resolveModuleFiles(directory, orderedModules.map(m => m.name));

  // Una tarea por módulo; el id de la tarea es el nombre del módulo, y así se reconoce cada evento al volver.
  const tasks: WorkersTask[] = orderedModules.map(module => {
    const config = resolveTaskConfig(module.tier, engine.id, capabilities);
    return {
      id: module.name,
      agentId: engine.id,
      executable: engine.executable,
      prompt: buildAnalysisPrompt(module.name, filesByModule.get(module.name) ?? []),
      readableDir: directory,
      readOnly: true,
      model: config.model,
      // El nivel de razonamiento solo se manda si la configuración lo trae.
      ...(config.reasoningLevel ? { reasoningLevel: config.reasoningLevel } : {}),
    };
  });

  // Estado que va llenando el manejador de eventos mientras Workers corre el lote.
  const tierByModuleName = new Map(orderedModules.map(m => [m.name, m.tier]));
  const analyzedModuleNames: string[] = [];
  const skippedModuleNames: string[] = [];
  const rejectedReportModuleNames: string[] = [];
  let quotaExhausted = false;
  let fatalErrorMessage: string | undefined;
  let readOnlyRejected = false;
  let runCompletedEvent: Extract<WorkersEvent, { event: "run_completed" }> | undefined;

  // Manejador de eventos: Workers lo invoca una vez por cada línea de evento, en orden de llegada;
  // clasifica cada módulo como analizado u omitido y recuerda la cuota, el error fatal y el cierre del lote.
  const onEvent = (event: WorkersEvent) => {
    if (event.event === "task_completed") {
      // Una respuesta que Workers marca como truncada (stdoutTruncated) no se guarda como reporte: el módulo se omite.
      if (event.stdoutTruncated) {
        skippedModuleNames.push(event.taskId);
      } else {
        try {
          recordModuleReport(store, directory, session, event.taskId, event.stdout);
          analyzedModuleNames.push(event.taskId);
        } catch (error) {
          // Engram rechaza guardar un texto que parece un secreto. Un solo módulo con una cadena
          // parecida a una clave no debe tumbar un análisis largo: se omite y se reintenta luego.
          // Cualquier otro error se sigue propagando.
          if (!(error instanceof MemoryError && error.code === "SECRET_REJECTED")) throw error;
          skippedModuleNames.push(event.taskId);
          rejectedReportModuleNames.push(event.taskId);
        }
      }
    } else if (event.event === "task_failed") {
      // Si el error empieza con el prefijo de solo lectura, Workers se negó a correr la tarea por falta del candado:
      // no cuenta como módulo omitido, hace que todo el despacho termine como `read_only_unsupported`.
      if (typeof event.stderr === "string" && event.stderr.startsWith(READ_ONLY_UNSUPPORTED_PREFIX)) {
        readOnlyRejected = true;
      } else {
        skippedModuleNames.push(event.taskId);
      }
    } else if (event.event === "quota_exhausted") {
      quotaExhausted = true;
    } else if (event.event === "fatal_error") {
      fatalErrorMessage = `${event.reason}: ${event.message}`;
    } else if (event.event === "run_completed") {
      // Se guarda para tomar de él la duración total al armar el reporte.
      runCompletedEvent = event;
    }
  };

  await runWorkersBatch(workersBinaryPath, enginesBinaryPath, tasks, onEvent);

  // Prioridad del resultado: error fatal, luego falta de candado de solo lectura, luego cuota agotada.
  if (fatalErrorMessage) {
    return { status: "fatal_error", message: fatalErrorMessage };
  }

  if (readOnlyRejected) {
    return { status: "read_only_unsupported" };
  }

  // Cuota agotada: se anota la pausa y se regresa sin cerrar la sesión; así la siguiente corrida retoma.
  // `pendingCount` cuenta todo lo no analizado, también lo omitido.
  if (quotaExhausted) {
    recordPause(store, directory, session);
    return {
      status: "paused",
      analyzedCount: analyzedModuleNames.length,
      pendingCount: orderedModules.length - analyzedModuleNames.length,
    };
  }

  // Corrida terminada: se cuentan los módulos analizados por nivel, con los nombres de nivel del reporte.
  // Los módulos omitidos no se cuentan.
  const tierBreakdown: Record<ReportTier, number> = { deep: 0, standard: 0, light: 0 };
  const engineByTier: Record<ReportTier, string> = { deep: engine.id, standard: engine.id, light: engine.id };
  const totalWorkersByTier: Record<ReportTier, number> = { deep: 0, standard: 0, light: 0 };
  for (const name of analyzedModuleNames) {
    const tier = tierByModuleName.get(name);
    if (!tier) continue;
    const reportTier = TIER_TO_REPORT_TIER[tier];
    tierBreakdown[reportTier] += 1;
    totalWorkersByTier[reportTier] += 1;
  }

  const report: FinalReport = {
    repoName: directory,
    tierBreakdown,
    engineByTier,
    totalWorkersByTier,
    // Deliberado: Workers nunca interpreta el contenido de la respuesta de la IA (por diseño,
    // documentado en la spec de Workers), así que Atlas no tiene de dónde sacar un conteo real de tokens hoy.
    tokensConsumed: 0,
    // Sin evento de cierre del lote, el tiempo total queda en 0.
    totalTimeMs: runCompletedEvent?.totalDurationMs ?? 0,
    pauseCount: readPauseCount(store, session.projectId),
    analyzedModuleNames,
    skippedModuleNames,
    rejectedReportModuleNames,
  };
  // Guarda el resumen final en Engram y cierra la sesión (por eso solo se llega aquí si la corrida terminó).
  finalizeRun(store, session, report);
  return { status: "completed", report };
}
