import { describe, expect, test } from "bun:test";
import { buildAnalysisPrompt } from "./analysis-prompt";

describe("buildAnalysisPrompt", () => {
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
