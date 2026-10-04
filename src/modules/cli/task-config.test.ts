import { describe, expect, test } from "bun:test";
import { resolveTaskConfig } from "./task-config";

describe("resolveTaskConfig", () => {
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

  // Regla de defensa: ya no es el caso real de ningún motor, pero Atlas sigue sin mandar nivel si Engines dice que no.
  test("omits reasoningLevel when the engine does not support it, even for profundo", () => {
    const config = resolveTaskConfig("profundo", "claude-code", { supportsReasoningLevel: false });
    expect(config).not.toHaveProperty("reasoningLevel");
  });

  test("includes reasoningLevel when the engine supports it", () => {
    const config = resolveTaskConfig("profundo", "codex", { supportsReasoningLevel: true });
    expect(config.reasoningLevel).toBe("medium");
  });

  test("throws for an engine id outside the fixed table", () => {
    expect(() => resolveTaskConfig("ligero", "example-agent", { supportsReasoningLevel: false })).toThrow();
  });
});
