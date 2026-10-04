/**
 * Abre o reconoce la sesión de una corrida y consulta qué informes de módulos ya están guardados.
 * `init.ts` usa el estado de la sesión y `dispatch-modules.ts` consulta los informes pendientes.
 */
import { MemoryError, startProjectSession, type MemoryStore, type Session } from "forge614-engram";
import { deriveSessionId } from "./session-id";
import { moduleTopicKey } from "./module-topic";

/** Distingue una sesión abierta, incluida su referencia, de una corrida que ya había terminado. */
export type RunState =
  | { status: "active"; session: Session }
  | { status: "already-complete" };

/**
 * Inicia una sesión con el ID estable del repositorio o recupera una sesión abierta con ese mismo ID.
 * Convierte `SESSION_CONFLICT` en `already-complete` cuando Engram encuentra la sesión cerrada.
 * @param store Base de memorias con sesiones habilitadas.
 * @param directory Carpeta del proyecto que se analiza.
 * @returns Estado `active` con la sesión, o `already-complete` si el ID ya corresponde a una sesión cerrada.
 * @throws `MIGRATION_REQUIRED` si la base no admite sesiones, u otro error de Engram distinto de `SESSION_CONFLICT`; también puede propagarse `ENOENT` al derivar la identidad.
 */
export function startOrResumeSession(store: MemoryStore, directory: string): RunState {
  const sessionId = deriveSessionId(directory);
  try {
    const session = startProjectSession(store, directory, sessionId);
    return { status: "active", session };
  } catch (error) {
    if (error instanceof MemoryError && error.code === "SESSION_CONFLICT") {
      return { status: "already-complete" };
    }
    throw error;
  }
}

/**
 * Consulta si ya existe un informe de ese módulo bajo la clave de tema del proyecto.
 * @param store Base de memorias donde están guardados los informes.
 * @param projectId Identificador del proyecto al que pertenece el módulo.
 * @param moduleName Nombre del módulo cuya clave se consulta.
 * @returns `true` si hay una memoria con esa clave; `false` si no la hay.
 */
export function isModuleReportSaved(store: MemoryStore, projectId: string, moduleName: string): boolean {
  return store.getByTopic(projectId, moduleTopicKey(moduleName)) !== null;
}
