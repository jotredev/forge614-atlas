/**
 * Pruebas de `computeTestCoverageGap` con archivos de ejemplo creados en una carpeta temporal.
 * Comprueban que la brecha de pruebas (qué parte de los archivos fuente de un módulo no tiene un archivo `.test` al lado) valga
 * 0, 1 y 0,5 en tres módulos de ejemplo. No cubren las pruebas con sufijo `.spec` ni un módulo sin archivos fuente.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeTestCoverageGap } from "./test-coverage-gap";
import type { ModuleDescriptor } from "./discovery";

/**
 * Comprueba `computeTestCoverageGap` en tres casos: todos los archivos con prueba, ninguno y solo uno de dos.
 * Importa porque esta brecha es la que `computeCompositeScores` usa como recargo de hasta 20 % sobre la puntuación.
 */
describe("computeTestCoverageGap", () => {
  /**
   * Comprueba que `auth`, con `login.ts` y su `login.test.ts` al lado, tenga brecha 0.
   * Importa porque es el caso sin brecha: todos los archivos fuente tienen su prueba hermana.
   */
  test("returns 0 when every source file has a sibling .test file", () => {
    // Escenario: Cobertura perfecta (1 archivo productivo acompañado de 1 archivo de test hermano).
    // Fórmula: 1 - (1 con test / 1 fuente) = 0.0 de brecha.
    const root = mkdtempSync(join(tmpdir(), "atlas-gap-covered-"));
    const modulePath = join(root, "auth");
    mkdirSync(modulePath, { recursive: true });
    const source = join(modulePath, "login.ts");
    const testFile = join(modulePath, "login.test.ts");
    writeFileSync(source, "export const login = () => true;");
    writeFileSync(testFile, "// test");

    const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [source, testFile] }];
    const result = computeTestCoverageGap(modules);

    expect(result.get("auth")).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * Comprueba que `billing`, con solo `charge.ts` y sin ninguna prueba al lado, tenga brecha 1.
   * Importa porque es el caso de máxima brecha, el que más recarga la puntuación del módulo.
   */
  test("returns 1 when no source file has a sibling test", () => {
    // Escenario: Brecha total (1 archivo productivo sin archivo de test hermano).
    // Fórmula: 1 - (0 con test / 1 fuente) = 1.0 de brecha (máximo riesgo).
    const root = mkdtempSync(join(tmpdir(), "atlas-gap-uncovered-"));
    const modulePath = join(root, "billing");
    mkdirSync(modulePath, { recursive: true });
    const source = join(modulePath, "charge.ts");
    writeFileSync(source, "export const charge = () => true;");

    const modules: ModuleDescriptor[] = [{ name: "billing", path: modulePath, files: [source] }];
    const result = computeTestCoverageGap(modules);

    expect(result.get("billing")).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * Comprueba que `mixed`, con `a.ts` (que tiene `a.test.ts`) y `b.ts` (sin prueba), tenga brecha 0,5.
   * Importa porque fija la fórmula 1 − (archivos con prueba / archivos fuente) cuando solo una parte está cubierta.
   */
  test("returns a fractional gap when only some files are covered", () => {
    // Escenario: Cobertura mixta (2 archivos productivos, solo 1 tiene prueba hermana).
    // Fórmula: 1 - (1 con test / 2 fuentes) = 0.5 (50% de brecha).
    const root = mkdtempSync(join(tmpdir(), "atlas-gap-partial-"));
    const modulePath = join(root, "mixed");
    mkdirSync(modulePath, { recursive: true });
    const covered = join(modulePath, "a.ts");
    const coveredTest = join(modulePath, "a.test.ts");
    const uncovered = join(modulePath, "b.ts");
    writeFileSync(covered, "export const a = 1;");
    writeFileSync(coveredTest, "// test");
    writeFileSync(uncovered, "export const b = 2;");

    const modules: ModuleDescriptor[] = [
      { name: "mixed", path: modulePath, files: [covered, coveredTest, uncovered] },
    ];
    const result = computeTestCoverageGap(modules);

    expect(result.get("mixed")).toBe(0.5);
    rmSync(root, { recursive: true, force: true });
  });
});
