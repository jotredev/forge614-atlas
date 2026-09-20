import { saveProjectMemoryWithSession, type MemoryStore, type Session, type SessionSaveResult } from "forge614-engram";
import { moduleTopicKey } from "./module-topic";

/**
 * Guardar dos veces bajo el mismo topicKey sin pasar expectedVersion
 * lanza VERSION_CONFLICT en Engram. Por eso se revisa primero si ya
 * existe (getByTopic) para pasar su versión actual y que sea una
 * actualización limpia, no un choque — necesario para que una
 * re-corrida (--force) sobre un módulo ya guardado no falle.
 */
export function recordModuleReport(
  store: MemoryStore,
  directory: string,
  session: Session,
  moduleName: string,
  reportText: string,
): SessionSaveResult {
  const topicKey = moduleTopicKey(moduleName);
  const existing = store.getByTopic(session.projectId, topicKey);

  return saveProjectMemoryWithSession(store, directory, {
    type: "fact",
    topicKey,
    title: `Atlas: ${moduleName}`,
    content: reportText,
    ...(existing ? { expectedVersion: existing.version } : {}),
  }, { sessionId: session.sessionId });
}
