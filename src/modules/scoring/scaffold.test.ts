/**
 * Prueba mínima de arranque: comprueba que `bun test` encuentra y ejecuta una prueba del proyecto.
 * Existe para que, si el ejecutor de pruebas (el programa que corre las pruebas) no está bien enlazado, falle algo simple
 * y fácil de reconocer, y no las pruebas de verdad. No prueba código de Atlas y ningún archivo la importa: solo la recoge `bun test`.
 */
import { describe, expect, test } from "bun:test";

/**
 * Prueba mínima de arranque (scaffold: la estructura básica del proyecto): comprueba que `bun test` corre una prueba y que `expect` responde.
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
