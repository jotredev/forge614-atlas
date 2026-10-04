/**
 * Guarda el texto que entregó un trabajador bajo el tema del módulo en la sesión actual.
 * `dispatch-modules.ts` lo llama al recibir un informe; `build-run-plan.test.ts` e `init.test.ts` crean informes previos con él.
 */
import { saveProjectMemoryWithSession, type MemoryStore, type Session, type SessionSaveResult } from "forge614-engram";
import { moduleTopicKey } from "./module-topic";

/**
 * Guarda el informe de un módulo bajo su clave de tema (`topicKey`: identificador estable de la memoria dentro del proyecto).
 * Guardar dos veces bajo la misma clave sin pasar `expectedVersion` (la versión que se cree vigente) lanza `VERSION_CONFLICT`
 * en Engram. Por eso primero se consulta con `getByTopic` si ya existe y se pasa su versión actual: así es una
 * actualización limpia y no un choque, necesario para que una re-corrida (`--force`) sobre un módulo ya guardado no falle.
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
