/**
 * Prueba mínima de arranque: comprueba que `bun test` encuentra y ejecuta una prueba del proyecto.
 * Existe para que, si el ejecutor de pruebas (el programa que corre las pruebas) no está bien enlazado, falle primero algo simple
 * y no las pruebas de verdad. No prueba código de Atlas y ningún archivo la importa: solo la recoge `bun test`.
 */
import { describe, expect, test } from "bun:test";

/**
 * Suite de verificación inicial del arnés de pruebas (scaffold test).
 *
 * Propósito:
 * - Comprobar que el ejecutor nativo de pruebas de Bun (`bun test`) corre una prueba
 *   y que `expect` funciona, antes de ejecutar la suite de pruebas unitarias y de integración de Forge614 Atlas.
 */
describe("project scaffold", () => {
  /**
   * Comprueba que `1 + 1` sea 2; no prueba código de Atlas, solo que el ejecutor corre una prueba y su `expect` responde.
   * Importa como señal rápida de que `bun test` está enlazado: si esta falla, el problema es la configuración y no el código.
   */
  test("the test runner is wired up", () => {
    // Aserción de sanidad mínima y determinista
    expect(1 + 1).toBe(2);
  });
});
