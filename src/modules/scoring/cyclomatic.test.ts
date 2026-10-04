/**
 * Pruebas para el cálculo de la complejidad ciclomática (el número de caminos distintos del código).
 * Comprueba que se cuente leyendo el árbol de sintaxis (AST) de cada archivo, sin contar las pruebas.
 * Importa para que la puntuación de riesgo no se dispare por pruebas con muchas ramas, y porque los `if`, el `for...of`,
 * el `&&` y los `case` del código de producción sumen; los demás bucles, `catch`, ternarios, `||` y `??` no tienen prueba.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileCyclomaticComplexity, computeCyclomaticComplexity } from "./cyclomatic";
import type { ModuleDescriptor } from "./discovery";

/**
 * Comprueba `fileCyclomaticComplexity`, que analiza el AST de un solo archivo.
 * Importa para verificar que el conteo siga la regla de McCabe (el método clásico para contar caminos): base 1, +1 por cada
 * rama, y el `default` de un `switch` no suma.
 */
describe("fileCyclomaticComplexity", () => {
  /**
   * Comprueba que una función sin condiciones devuelva exactamente la complejidad base de 1.
   * Importa porque es el valor mínimo posible: todo archivo vale al menos 1.
   */
  test("a function with no branching has the baseline complexity of 1", () => {
    // Función estrictamente lineal: 0 bifurcaciones -> complejidad base = 1 (Axioma de McCabe)
    const source = "export function identity(value: number) { return value; }";
    expect(fileCyclomaticComplexity(source)).toBe(1);
  });

  /**
   * Comprueba que un archivo con 3 `if` (uno es `else if`), 1 `for...of`, 1 `&&` y 2 `case` valga 8 (1 base + 7), sin contar el `default`.
   * Importa porque fija el total de un caso mixto: las ramas, el bucle, el `&&` y los `case` suman, y el `default` no.
   */
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

/**
 * Comprueba `computeCyclomaticComplexity`, que suma la complejidad a lo largo de un módulo entero.
 * Importa para fijar la suma por módulo y la exclusión de los archivos de prueba.
 */
describe("computeCyclomaticComplexity", () => {
  let root: string;

  /**
   * Comprueba que el total de un módulo sea la suma del análisis de cada uno de sus archivos individuales.
   * Importa porque la complejidad del módulo es la suma de sus archivos: aquí 1 + 2 = 3.
   */
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

  /**
   * Comprueba que `a.test.ts`, con un `if` y un `else if`, no sume al total de `auth`, que queda en 1 (solo cuenta `a.ts`).
   * Importa para que los archivos de prueba no inflen la complejidad del módulo.
   */
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
