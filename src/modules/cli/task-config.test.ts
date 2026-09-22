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

  test("omits reasoningLevel when the engine does not support it, even for profundo", () => {
    const config = resolveTaskConfig("profundo", "claude-code", { supportsReasoningLevel: false });
    expect(config).not.toHaveProperty("reasoningLevel");
  });

  test("includes reasoningLevel when the engine supports it", () => {
    const config = resolveTaskConfig("profundo", "codex", { supportsReasoningLevel: true });
    expect(config.reasoningLevel).toBe("medium");
  });

  test("throws for an engine id outside the fixed table", () => {
    expect(() => resolveTaskConfig("ligero", "cursor", { supportsReasoningLevel: false })).toThrow();
  });
});
