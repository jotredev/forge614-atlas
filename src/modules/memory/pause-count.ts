/**
 * Lee y actualiza el número de pausas por cuota guardado como memoria del proyecto.
 * `dispatch-modules.ts` lo usa al pausar una corrida y al preparar su informe final.
 */
import { saveProjectMemoryWithSession, type MemoryStore, type Session } from "forge614-engram";

const PAUSE_COUNT_TOPIC = "atlas:meta:pause-count";

/**
 * Lee el contador del proyecto; si no hay memoria, o su contenido no empieza con un número entero, cuenta como cero (de un texto como `12abc` se toma el 12).
 * @param store Base de memorias abierta para consultar el tema del contador.
 * @param projectId Identificador del proyecto cuya memoria se consulta (`dispatchModules` pasa `session.projectId`, que nunca es nulo); un `null` consultaría las memorias compartidas, sin proyecto.
 * @returns El entero con que empieza el contenido guardado, o cero si falta o no empieza con un entero.
 */
export function readPauseCount(store: MemoryStore, projectId: string | null): number {
  const existing = store.getByTopic(projectId, PAUSE_COUNT_TOPIC);
  if (!existing) return 0;
  const parsed = Number.parseInt(existing.content, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Suma una pausa y guarda el nuevo total ligado a la sesión de Atlas.
 * @param store Base de memorias donde se guarda el contador.
 * @param directory Carpeta del proyecto al que corresponde la sesión.
 * @param session Sesión abierta que vincula el nuevo valor con la corrida.
 * @returns El total nuevo después del guardado.
 * @throws `VERSION_CONFLICT` si otro guardado cambió la versión consultada; también propaga los demás errores de Engram (por ejemplo `SESSION_CLOSED` si la sesión ya está cerrada); la función no los captura.
 */
export function recordPause(store: MemoryStore, directory: string, session: Session): number {
  // Una memoria anterior aporta su versión para actualizarla sin sobrescribir una revisión ajena.
  const existing = store.getByTopic(session.projectId, PAUSE_COUNT_TOPIC);
  const currentCount = existing ? Number.parseInt(existing.content, 10) || 0 : 0;
  const nextCount = currentCount + 1;

  // El contenido se guarda como texto porque la memoria de Engram no tiene un campo numérico para este contador.
  saveProjectMemoryWithSession(
    store,
    directory,
    {
      type: "fact",
      topicKey: PAUSE_COUNT_TOPIC,
      title: "Atlas: contador de pausas por cuota",
      content: String(nextCount),
      ...(existing ? { expectedVersion: existing.version } : {}),
    },
    { sessionId: session.sessionId },
  );

  return nextCount;
}
