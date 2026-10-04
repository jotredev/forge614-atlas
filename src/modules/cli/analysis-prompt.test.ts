/**
 * Prueba `buildAnalysisPrompt`: que la consigna de análisis cite el módulo y las rutas, pida una
 * explicación narrativa y no pida el contenido crudo de los archivos.
 */
import { describe, expect, test } from "bun:test";
import { buildAnalysisPrompt } from "./analysis-prompt";

/**
 * Agrupa las pruebas de la consigna de análisis que arma `buildAnalysisPrompt`.
 */
describe("buildAnalysisPrompt", () => {
  /**
   * Con un módulo y dos rutas, el texto debe mencionar el nombre, ambas rutas, el tono de «desarrollador senior»
   * y el pedido de «análisis narrativo», y no debe contener «contenido crudo»; sin eso el ayudante recibiría
   * una consigna incompleta o una que Claude Code rechaza (el expect de «contenido crudo» protege este caso).
   */
  test("includes the module name, the exact file paths, and asks for narrative analysis", () => {
    const prompt = buildAnalysisPrompt("auth", ["/repo/src/auth/login.ts", "/repo/src/auth/session.ts"]);

    expect(prompt).toContain("auth");
    expect(prompt).toContain("/repo/src/auth/login.ts");
    expect(prompt).toContain("/repo/src/auth/session.ts");
    expect(prompt.toLowerCase()).toContain("desarrollador senior");
    // Nunca debe pedir el contenido crudo — Claude Code lo rechaza como
    // patrón de exfiltración (confirmado con pruebas reales).
    expect(prompt.toLowerCase()).not.toContain("contenido crudo");
    expect(prompt.toLowerCase()).toContain("análisis narrativo");
  });
});
