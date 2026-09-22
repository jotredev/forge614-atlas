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

export function resolveTaskConfig(
  tier: Tier,
  engineId: string,
  capabilities: { supportsReasoningLevel: boolean },
): TaskModelConfig {
  const row = MODEL_TABLE[tier][engineId as EngineId];
  if (!row) {
    throw new Error(`No hay configuración de modelo/razonamiento para el motor "${engineId}"`);
  }
  if (!capabilities.supportsReasoningLevel) {
    return { model: row.model };
  }
  return row;
}
