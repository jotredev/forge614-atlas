/**
 * Guarda el texto que entregó un trabajador bajo el tema del módulo en la sesión actual.
 * `dispatch-modules.ts` lo llama al recibir un informe; las pruebas de planificación crean informes previos con él.
 */
import { saveProjectMemoryWithSession, type MemoryStore, type Session, type SessionSaveResult } from "forge614-engram";
import { moduleTopicKey } from "./module-topic";

/**
 * Guardar dos veces bajo el mismo topicKey sin pasar expectedVersion
 * lanza VERSION_CONFLICT en Engram. Por eso se revisa primero si ya
 * existe (getByTopic) para pasar su versión actual y que sea una
 * actualización limpia, no un choque — necesario para que una
 * re-corrida (--force) sobre un módulo ya guardado no falle.
 * @param store Base de memorias abierta donde se guarda el informe.
 * @param directory Carpeta del proyecto al que pertenece el módulo.
 * @param session Sesión a la que se vincula el guardado.
 * @param moduleName Nombre del módulo usado para el título y la clave de tema.
 * @param reportText Texto completo del informe recibido.
 * @returns Resultado del guardado de Engram, incluida la memoria creada o actualizada.
 * @throws `SECRET_REJECTED` si Engram detecta un secreto; `VERSION_CONFLICT` si otra escritura cambió la versión entre lectura y guardado.
 */
export function recordModuleReport(
  store: MemoryStore,
  directory: string,
  session: Session,
  moduleName: string,
  reportText: string,
): SessionSaveResult {
  const topicKey = moduleTopicKey(moduleName);
  // La versión existente habilita una actualización; sin ella, Engram rechazaría guardar el mismo tema dos veces.
  const existing = store.getByTopic(session.projectId, topicKey);

  return saveProjectMemoryWithSession(store, directory, {
    type: "fact",
    topicKey,
    title: `Atlas: ${moduleName}`,
    content: reportText,
    ...(existing ? { expectedVersion: existing.version } : {}),
  }, { sessionId: session.sessionId });
}
