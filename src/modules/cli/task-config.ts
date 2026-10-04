type Tier = "ligero" | "estandar" | "profundo";
type EngineId = "claude-code" | "codex";

export interface TaskModelConfig {
  model: string;
  reasoningLevel?: "low" | "medium";
}

const MODEL_TABLE: Record<Tier, Record<EngineId, TaskModelConfig>> = {
  ligero: {
    "claude-code": { model: "claude-haiku-4-5-20251001", reasoningLevel: "low" },
    codex: { model: "gpt-5.6-luna", reasoningLevel: "low" },
  },
  estandar: {
    "claude-code": { model: "claude-sonnet-5", reasoningLevel: "medium" },
    codex: { model: "gpt-5.6-terra", reasoningLevel: "medium" },
  },
  profundo: {
    "claude-code": { model: "claude-opus-5", reasoningLevel: "medium" },
    codex: { model: "gpt-5.6-sol", reasoningLevel: "medium" },
  },
};

/**
 * Da el modelo y el nivel de razonamiento de una tarea según la tabla fija (`MODEL_TABLE`).
 * @param tier Nivel del módulo (ligero, estándar o profundo).
 * @param engineId Motor elegido (`claude-code` o `codex`).
 * @param capabilities Capacidades del motor; solo se mira `supportsReasoningLevel`.
 * @returns El modelo y, si el motor acepta nivel de razonamiento, el nivel; si no, solo el modelo.
 * @throws Error si la tabla no tiene una fila para ese motor.
 */
export function resolveTaskConfig(
  tier: Tier,
  engineId: string,
  capabilities: { supportsReasoningLevel: boolean },
): TaskModelConfig {
  const row = MODEL_TABLE[tier][engineId as EngineId];
  if (!row) {
    throw new Error(`No hay configuración de modelo/razonamiento para el motor "${engineId}"`);
  }
  // Defensa: hoy Engines 1.16.0+ dice true para los dos motores, pero si algún día un motor dijera false
  // se manda solo el modelo, sin nivel.
  if (!capabilities.supportsReasoningLevel) {
    return { model: row.model };
  }
  return row;
}
