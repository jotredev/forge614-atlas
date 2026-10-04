/**
 * Arma el plan de corrida (la lista de módulos que Atlas va a analizar, cada uno con su nivel de profundidad).
 * Existe para decidir en un solo lugar qué módulos entran y cuáles se saltan al reanudar una corrida interrumpida.
 * Lo llama `init.ts` dos veces: con `skipCompleted: false` en modo forzado y con `true` en la corrida normal;
 * `src/index.ts` lo reexporta junto con sus dos tipos. Piezas: `RunPlanModule`, `RunPlanResult` y `buildRunPlan`.
 */
import type { MemoryStore } from "forge614-engram";
import { discoverModules } from "../scoring/discovery";
import { computeCyclomaticComplexity } from "../scoring/cyclomatic";
import { computeFanIn } from "../scoring/fan-in";
import { computeChurn } from "../scoring/churn";
import { computeTestCoverageGap } from "../scoring/test-coverage-gap";
import { computeCompositeScores, type ModuleSignals } from "../scoring/composite-score";
import { assignTiers, type Tier } from "../scoring/tiers";
import { isModuleReportSaved } from "../memory/run-state";

/**
 * Un módulo incluido en el plan de corrida: qué analizar y con cuánta profundidad.
 */
export interface RunPlanModule {
  /** Nombre del módulo tal como lo entrega `discoverModules`: su ruta relativa a la raíz del proyecto (p. ej. `src/auth`). */
  name: string;
  /** Nivel de profundidad (`ligero`, `estandar` o `profundo`) que `assignTiers` le dio según su puntuación. */
  tier: Tier;
}

/**
 * Resultado de `buildRunPlan`: los módulos por analizar y si la corrida es una continuación.
 */
export interface RunPlanResult {
  /** Módulos pendientes, ordenados de mayor a menor puntuación (el orden en que los entrega `assignTiers`). */
  modules: RunPlanModule[];
  /** `true` solo si se pidió saltar los ya guardados y al menos un módulo se omitió por tener su reporte guardado. */
  resumed: boolean;
}

/**
 * Descubre los módulos del proyecto, los puntúa y les asigna nivel; con `skipCompleted` descarta los que ya
 * tienen su reporte guardado en la memoria. Existe para que una corrida interrumpida retome solo lo pendiente.
 * @param store Memoria (almacén de Engram) donde se busca si el reporte de cada módulo ya está guardado.
 * @param projectId Identificador del proyecto dentro de esa memoria; acota la búsqueda de reportes.
 * @param directory Ruta absoluta del repositorio cuyos módulos se descubren y puntúan.
 * @param options `skipCompleted: true` omite los módulos con reporte guardado; `false` los incluye todos.
 * @returns El plan: módulos pendientes con su nivel y la marca `resumed`. Si no se descubre ningún módulo
 * devuelve `{ modules: [], resumed: false }` sin consultar la memoria.
 * @throws No lanza ningún código propio: los errores de los pasos que invoca suben tal cual (por ejemplo, el `Error` de `computeChurn` si la carpeta no es un repositorio de git o no tiene commits, o el de leer las carpetas), y `init.ts` los captura y los reporta como `ANALYSIS_FAILED`.
 */
export function buildRunPlan(
  store: MemoryStore,
  projectId: string,
  directory: string,
  options: { skipCompleted: boolean },
): RunPlanResult {
  const modules = discoverModules(directory);
  // Sin módulos no hay nada que puntuar ni que consultar en la memoria: plan vacío.
  if (modules.length === 0) {
    return { modules: [], resumed: false };
  }

  // Cuatro señales por módulo: complejidad ciclomática (cuántos caminos distintos tiene el código), fan-in (cuántos otros módulos lo usan), churn (cuántas veces cambió en el historial de git) y brecha de pruebas (cuánto le falta de pruebas); cada función devuelve un mapa nombre → valor.
  const cyclomatic = computeCyclomaticComplexity(modules);
  const fanIn = computeFanIn(modules);
  const churn = computeChurn(directory, modules);
  const testGap = computeTestCoverageGap(modules);

  // Une las señales en un solo registro por módulo; si a un módulo le falta una, cuenta como 0.
  const signals: ModuleSignals[] = modules.map(module => ({
    name: module.name,
    cyclomatic: cyclomatic.get(module.name) ?? 0,
    fanIn: fanIn.get(module.name) ?? 0,
    churn: churn.get(module.name) ?? 0,
    testGap: testGap.get(module.name) ?? 0,
  }));

  // Puntuación compuesta y reparto en niveles: el orden del resultado es el de mayor a menor puntuación.
  const tiered = assignTiers(computeCompositeScores(signals));

  // Al reanudar, se quitan los módulos cuyo reporte ya está guardado; al forzar, se conservan todos.
  const pending = options.skipCompleted
    ? tiered.filter(module => !isModuleReportSaved(store, projectId, module.name))
    : tiered;

  return {
    modules: pending.map(module => ({ name: module.name, tier: module.tier })),
    // Es continuación solo si se pidió saltar y de verdad se omitió alguno.
    resumed: options.skipCompleted && pending.length < tiered.length,
  };
}
