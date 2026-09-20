import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";

/**
 * sessionId es un identificador GLOBAL en la base de Engram (no tiene
 * espacio de nombres por proyecto). Debe derivarse de la ruta real del
 * repo para que dos proyectos nunca choquen entre sí.
 */
export function deriveSessionId(directory: string): string {
  const canonical = realpathSync(directory);
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  return `atlas:${hash}`;
}

/**
 * Para una re-corrida forzada (--force) sobre un repo cuya sesión
 * anterior ya está cerrada: una sesión cerrada no puede reabrirse con el
 * mismo id, así que se genera uno nuevo y distinto.
 */
export function deriveForcedSessionId(directory: string): string {
  return `${deriveSessionId(directory)}:${Date.now()}`;
}
