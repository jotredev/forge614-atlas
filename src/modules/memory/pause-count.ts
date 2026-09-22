import { saveProjectMemoryWithSession, type MemoryStore, type Session } from "forge614-engram";

const PAUSE_COUNT_TOPIC = "atlas:meta:pause-count";

export function readPauseCount(store: MemoryStore, projectId: string | null): number {
  const existing = store.getByTopic(projectId, PAUSE_COUNT_TOPIC);
  if (!existing) return 0;
  const parsed = Number.parseInt(existing.content, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function recordPause(store: MemoryStore, directory: string, session: Session): number {
  const existing = store.getByTopic(session.projectId, PAUSE_COUNT_TOPIC);
  const currentCount = existing ? Number.parseInt(existing.content, 10) || 0 : 0;
  const nextCount = currentCount + 1;

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
