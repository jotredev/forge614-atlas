import { describe, expect, test } from "bun:test";

/**
 * Suite de verificación inicial del arnés de pruebas (scaffold test).
 * 
 * Propósito:
 * - Garantizar que el ejecutor nativo de pruebas de Bun (`bun test`)
 *   esté correctamente enlazado, configurado y funcional antes de ejecutar
 *   la suite de pruebas unitarias y de integración de Forge614 Atlas.
 */
describe("project scaffold", () => {
  test("the test runner is wired up", () => {
    // Aserción de sanidad mínima y determinista
    expect(1 + 1).toBe(2);
  });
});
