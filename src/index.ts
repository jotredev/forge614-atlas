/**
 * Forge614 Atlas — Motor Determinista de Puntuación de Complejidad (Plan 1/5)
 * 
 * Barril principal de exportación pública de la librería. Expone las primitivas
 * deterministas para descubrimiento de módulos, análisis de Árbol de Sintaxis Abstracta (AST),
 * grafos de dependencias (Fan-In), historial de versiones Git (Churn), brecha de pruebas unitarias,
 * normalización Min-Max, cálculo de puntaje compuesto y clasificación en niveles de contexto (Tiers).
 */

// 1. Módulo de Descubrimiento e Inspección del Sistema de Archivos
export { discoverModules, isTestFile } from "./modules/scoring/discovery";
export type { ModuleDescriptor } from "./modules/scoring/discovery";

// 2. Módulo de Complejidad Ciclomática (McCabe AST)
export { fileCyclomaticComplexity, computeCyclomaticComplexity } from "./modules/scoring/cyclomatic";

// 3. Módulo de Centralidad de Dependencias Fan-In
export { computeFanIn } from "./modules/scoring/fan-in";

// 4. Módulo de Volatilidad Histórica de Git (Churn UTF-8)
export { computeChurn } from "./modules/scoring/churn";

// 5. Módulo de Brecha de Cobertura de Pruebas Unitarias (Test Coverage Gap)
export { computeTestCoverageGap } from "./modules/scoring/test-coverage-gap";

// 6. Módulo de Puntuación Compuesta Normalizada y Modificador de Riesgo
export { computeCompositeScores } from "./modules/scoring/composite-score";
export type { ModuleSignals, ModuleScore } from "./modules/scoring/composite-score";

// 7. Módulo de Asignación de Niveles de Presupuesto por Percentiles (Tiers)
export { assignTiers } from "./modules/scoring/tiers";
export type { Tier, TieredModule } from "./modules/scoring/tiers";

// 8. Módulo de Integración con Engram (Sesiones y Reportes de Módulo)
export { moduleTopicKey } from "./modules/memory/module-topic";
export { deriveSessionId, deriveForcedSessionId } from "./modules/memory/session-id";
export { startOrResumeSession, isModuleReportSaved } from "./modules/memory/run-state";
export type { RunState } from "./modules/memory/run-state";
export { recordModuleReport } from "./modules/memory/module-report";
export { finalizeRun } from "./modules/memory/finalize-run";
export type { FinalReport } from "./modules/memory/finalize-run";

// 9. Módulo Cliente de Engines (Detección y Capacidades)
export { detectAgents } from "./modules/engines-client/detect";
export type { AgentDetection } from "./modules/engines-client/detect";
export { getCapabilities } from "./modules/engines-client/capabilities";
export type { Capabilities } from "./modules/engines-client/capabilities";
export { resolveEnginesBinaryPath } from "./modules/engines-client/binary-path";

// 10. Módulo de Núcleo del CLI (Resolución de Motor y Plan de Corrida)
export { resolveEngine } from "./modules/cli/resolve-engine";
export type { EngineResolution } from "./modules/cli/resolve-engine";
export { buildRunPlan } from "./modules/cli/build-run-plan";
export type { RunPlanModule, RunPlanResult } from "./modules/cli/build-run-plan";
export { runInitCommand } from "./modules/cli/init";
export type { RunInitOptions, InitOutcome } from "./modules/cli/init";
