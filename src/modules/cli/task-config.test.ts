/**
 * Prueba la tabla fija que traduce nivel y motor en el modelo y, cuando corresponde, el nivel de razonamiento.
 * Cada caso consulta la función pública para proteger la configuración que se manda a Workers sin editar la tabla en la prueba.
 */
import { describe, expect, test } from "bun:test";
import { resolveTaskConfig } from "./task-config";

/** Agrupa la selección de configuración de tarea para los dos motores reconocidos y sus defensas. */
describe("resolveTaskConfig", () => {
  /** Comprueba tres cruces de nivel y motor, incluidos dos sin razonamiento, para fijar los modelos literales de la tabla. */
  test("returns the fixed model for each tier and engine", () => {
    expect(resolveTaskConfig("ligero", "claude-code", { supportsReasoningLevel: false })).toEqual({
      model: "claude-haiku-4-5-20251001",
    });
    expect(resolveTaskConfig("estandar", "codex", { supportsReasoningLevel: true })).toEqual({
      model: "gpt-5.6-terra",
      reasoningLevel: "medium",
    });
    expect(resolveTaskConfig("profundo", "claude-code", { supportsReasoningLevel: false })).toEqual({
      model: "claude-opus-5",
    });
  });

  /** Comprueba los tres niveles de `claude-code` cuando Engines permite razonamiento, incluido `low` para ligero. */
  test("claude-code gets the table's reasoning level when Engines reports support (Engines 1.16.0+)", () => {
    expect(resolveTaskConfig("ligero", "claude-code", { supportsReasoningLevel: true })).toEqual({
      model: "claude-haiku-4-5-20251001",
      reasoningLevel: "low",
    });
    expect(resolveTaskConfig("estandar", "claude-code", { supportsReasoningLevel: true })).toEqual({
      model: "claude-sonnet-5",
      reasoningLevel: "medium",
    });
    expect(resolveTaskConfig("profundo", "claude-code", { supportsReasoningLevel: true })).toEqual({
      model: "claude-opus-5",
      reasoningLevel: "medium",
    });
  });

  /** Comprueba la defensa que omite `reasoningLevel` aunque el nivel sea profundo si Engines lo declara no compatible. */
  test("omits reasoningLevel when the engine does not support it, even for profundo", () => {
    const config = resolveTaskConfig("profundo", "claude-code", { supportsReasoningLevel: false });
    expect(config).not.toHaveProperty("reasoningLevel");
  });

  /** Comprueba que un motor compatible recibe el valor `medium` configurado para la tarea profunda de Codex. */
  test("includes reasoningLevel when the engine supports it", () => {
    const config = resolveTaskConfig("profundo", "codex", { supportsReasoningLevel: true });
    expect(config.reasoningLevel).toBe("medium");
  });

  /** Comprueba que un identificador sin fila no produce una configuración inventada y en su lugar lanza `Error`. */
  test("throws for an engine id outside the fixed table", () => {
    expect(() => resolveTaskConfig("ligero", "example-agent", { supportsReasoningLevel: false })).toThrow();
  });
});
