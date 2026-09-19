import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileCyclomaticComplexity, computeCyclomaticComplexity } from "./cyclomatic";
import type { ModuleDescriptor } from "./discovery";

describe("fileCyclomaticComplexity", () => {
  test("a function with no branching has the baseline complexity of 1", () => {
    // Función estrictamente lineal: 0 bifurcaciones -> complejidad base = 1 (Axioma de McCabe)
    const source = "export function identity(value: number) { return value; }";
    expect(fileCyclomaticComplexity(source)).toBe(1);
  });

  test("counts if/else-if, loops, switch cases, and logical operators (never default)", () => {
    // Código con múltiples estructuras de control sintácticas y lógicas:
    // 1 (base)
    // + 1 (if value > 10)
    // + 1 (else if value > 0)
    // + 1 (for const item of items)
    // + 1 (if item < 0 ...)
    // + 1 (operador lógico &&)
    // + 1 (case 1:)
    // + 1 (case 2:)
    // + 0 (default: NUNCA suma, es el escape por omisión de McCabe)
    // Total esperado = 8
    const source = `
      export function classify(value: number, items: number[]): string {
        if (value > 10) {
          return "big";
        } else if (value > 0) {
          return "small";
        }
        for (const item of items) {
          if (item < 0 && value > 0) continue;
        }
        switch (value) {
          case 1:
            return "one";
          case 2:
            return "two";
          default:
            return "other";
        }
      }
    `;
    expect(fileCyclomaticComplexity(source)).toBe(8);
  });
});

describe("computeCyclomaticComplexity", () => {
  let root: string;

  test("sums complexity across every file in a module", () => {
    root = mkdtempSync(join(tmpdir(), "atlas-cyclomatic-"));
    const modulePath = join(root, "auth");
    mkdirSync(modulePath, { recursive: true });

    const fileA = join(modulePath, "a.ts");
    const fileB = join(modulePath, "b.ts");

    // fileA: identity -> complejidad 1
    writeFileSync(fileA, "export function identity(value: number) { return value; }");
    // fileB: flag con 1 if -> complejidad 1 (base) + 1 (if) = 2
    writeFileSync(fileB, "export function flag(value: boolean) { if (value) return 1; return 0; }");

    const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [fileA, fileB] }];
    const result = computeCyclomaticComplexity(modules);

    // Suma acumulada esperada: 1 + 2 = 3
    expect(result.get("auth")).toBe(3);
    rmSync(root, { recursive: true, force: true });
  });

  test("excludes *.test.ts files from the module's complexity total", () => {
    root = mkdtempSync(join(tmpdir(), "atlas-cyclomatic-testfile-"));
    const modulePath = join(root, "auth");
    mkdirSync(modulePath, { recursive: true });

    const sourceFile = join(modulePath, "a.ts");
    const testFile = join(modulePath, "a.test.ts");

    // Código productivo limpio: complejidad = 1
    writeFileSync(sourceFile, "export function identity(value: number) { return value; }");

    // Archivo de pruebas con múltiples bifurcaciones: debe ser IGNORADO
    writeFileSync(
      testFile,
      `
        import { describe, test, expect } from "bun:test";
        describe("identity", () => {
          test("branches a lot", () => {
            const value = 1;
            if (value > 0) {
              expect(true).toBe(true);
            } else if (value < 0) {
              expect(false).toBe(true);
            } else {
              expect(value).toBe(0);
            }
          });
        });
      `,
    );

    const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [sourceFile, testFile] }];
    const result = computeCyclomaticComplexity(modules);

    // Solo debe contabilizar el archivo fuente productivo (1), omitiendo a.test.ts
    expect(result.get("auth")).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });
});
