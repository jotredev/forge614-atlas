import { MemoryError, startProjectSession, type MemoryStore, type Session } from "forge614-engram";
import { deriveSessionId } from "./session-id";
import { moduleTopicKey } from "./module-topic";

export type RunState =
  | { status: "active"; session: Session }
  | { status: "already-complete" };

/**
 * startProjectSession es idempotente si el sessionId ya existe, es del
 * mismo proyecto, tipo "runtime" y sigue abierto: devuelve la sesión tal
 * cual, sin error. Si ya está cerrada, lanza SESSION_CONFLICT — eso es
 * justamente la señal de "este repo ya se analizó por completo".
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

export function isModuleReportSaved(store: MemoryStore, projectId: string, moduleName: string): boolean {
  return store.getByTopic(projectId, moduleTopicKey(moduleName)) !== null;
}
