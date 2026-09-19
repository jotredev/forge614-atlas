# 07.03 Complejidad Ciclomática AST (Cyclomatic)

> **Documento de Arquitectura y Código — Ecosistema Forge614 Atlas**  
> **Alcance:** `src/modules/scoring/cyclomatic.ts` y `cyclomatic.test.ts`  
> **Traducción hermana:** [07.03 (EN) AST Cyclomatic Complexity (cyclomatic.ts and test)](../../en/07-structure/03-cyclomatic-complexity.md)

---

## 1. Justificación Arquitectónica

La complejidad ciclomática desarrollada por Thomas McCabe en 1976 mide la cantidad de rutas independientes y linealmente ejecutables que existen en el flujo de control de un programa. En Forge614 Atlas, en lugar de usar expresiones regulares rudimentarias propensas a errores, el análisis se efectúa directamente sobre el **Árbol de Sintaxis Abstracta (AST)** compilado por el motor oficial de TypeScript:
1. **Línea Base = 1:** Todo archivo válido posee al menos una ruta de ejecución lineal continua.
2. **Bifurcaciones Estructurales (+1):** `if`, operador ternario `? :`, bucles `while`, `do...while`, `for`, `for...in`, `for...of`, bloques `catch` y cláusulas `case`.
3. **Regla de McCabe para `default:`:** La cláusula `default:` de un `switch` **no suma puntos** porque no añade una condición evaluable nueva, sino que representa la ruta de salida por omisión.
4. **Operadores Lógicos de Cortocircuito (+1):** En JavaScript/TypeScript, `&&`, `||` y `??` (coalescencia nula) bifurcan internamente el flujo de evaluación en tiempo de ejecución.
5. **Aislamiento de Pruebas:** Los archivos `.test.ts` y `.spec.ts` se excluyen estrictamente del total acumulado para no penalizar a los módulos que cuentan con amplias suites de pruebas.

### Analogía del Mundo Real
> Es como el laberinto de carreteras de una ciudad: una autopista recta sin salidas ni semáforos tiene complejidad 1 (fácil de conducir). Cada bifurcación, rotonda, semáforo condicional o salida de emergencia añade una nueva posibilidad de perderse o accidentarse, requiriendo mayor atención mental.

---

## 2. Código Fuente Documentado: `src/modules/scoring/cyclomatic.ts`

```typescript
import ts from "typescript";
import { readFileSync } from "node:fs";
import { isTestFile, type ModuleDescriptor } from "./discovery";

/**
 * Calcula la Complejidad Ciclomática de McCabe para un archivo fuente individual
 * analizando su Árbol de Sintaxis Abstracta (AST) con el compilador oficial de TypeScript.
 * 
 * Fundamento Matemático (Thomas J. McCabe, 1976):
 * - M = E - N + 2P
 *   Donde E = aristas de control, N = nodos del grafo de flujo, P = componentes conectados.
 * - Para un programa con un único punto de entrada y salida, la fórmula equivale a:
 *   M = 1 + (número de puntos de bifurcación y decisiones booleanas en el código).
 * 
 * Algoritmo paso a paso:
 * 1. Parsea el texto del código fuente en un AST en memoria usando `ts.createSourceFile`.
 *    Se emplea `ts.ScriptTarget.Latest` para comprender sintaxis moderna (ej. operadores `??`, optional chaining).
 * 2. Inicia el contador en `complexity = 1` (ruta base de ejecución lineal).
 * 3. Recorre el árbol recursivamente mediante la función `visit(node)`.
 * 4. Por cada estructura de control condicional o de repetición, incrementa en +1:
 *    - Sentencias `if` y expresiones ternarias (`condición ? val1 : val2`).
 *    - Bucles `while`, `do...while`, `for`, `for...in`, `for...of`.
 *    - Bloques `catch` de manejo de excepciones (bifurcación de flujo de error).
 *    - Cláusulas `case` en instrucciones `switch`. (Nota: La cláusula `default:` NO se
 *      contabiliza porque no introduce una nueva condición, sino que actúa como la ruta de escape).
 * 5. Por cada expresión binaria lógica (`&&`, `||`, `??`), incrementa en +1 debido a que
 *    el cortocircuito lógico (short-circuit evaluation) crea una rama condicional implícita.
 * 6. Invoca recursivamente `ts.forEachChild` para explorar todos los nodos descendientes.
 * 
 * @param sourceText - Contenido textual completo del archivo de código fuente
 * @param fileName - Nombre virtual del archivo para asociar información de diagnóstico
 * @returns Número entero positivo representando la puntuación de complejidad ciclomática
 */
export function fileCyclomaticComplexity(sourceText: string, fileName = "module.ts"): number {
  // 1. Construcción del Árbol de Sintaxis Abstracta (AST) de solo lectura
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true // setParentNodes: habilita navegación sintáctica completa
  );

  // 2. Línea base fundamental de McCabe: todo archivo ejecutable posee al menos una ruta directa
  let complexity = 1;

  // 3. Recorrido sintáctico en profundidad (Depth-First Search) sobre el AST
  function visit(node: ts.Node): void {
    // 4. Detección de bifurcaciones estructurales explícitas
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:              // if (...)
      case ts.SyntaxKind.ConditionalExpression:    // cond ? a : b
      case ts.SyntaxKind.WhileStatement:            // while (...)
      case ts.SyntaxKind.DoStatement:               // do { ... } while (...)
      case ts.SyntaxKind.ForStatement:              // for (let i = 0; ...)
      case ts.SyntaxKind.ForInStatement:           // for (const key in obj)
      case ts.SyntaxKind.ForOfStatement:           // for (const item of arr)
      case ts.SyntaxKind.CatchClause:              // try { ... } catch (err)
      case ts.SyntaxKind.CaseClause:               // case "VAL": (default es omiso por regla de McCabe)
        complexity++;
        break;
      default:
        break;
    }

    // 5. Detección de bifurcaciones booleanas implícitas por cortocircuito lógico
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken || // exprA && exprB
        op === ts.SyntaxKind.BarBarToken ||             // exprA || exprB
        op === ts.SyntaxKind.QuestionQuestionToken     // exprA ?? fallback
      ) {
        complexity++;
      }
    }

    // 6. Descender a todos los nodos hijos del AST
    ts.forEachChild(node, visit);
  }

  // Iniciar la visita desde la raíz del archivo fuente
  visit(sourceFile);

  return complexity;
}

/**
 * Calcula la suma total de complejidad ciclomática para cada módulo de una colección.
 * 
 * Reglas arquitectónicas esenciales:
 * 1. Los archivos de prueba (`.test.ts`, `.spec.ts`) se excluyen estrictamente mediante `isTestFile`.
 *    Justificación: Las pruebas contienen numerosas aserciones y datos simulados que no reflejan
 *    complejidad cognitiva ni lógica de producción. Incluirlos penalizaría injustamente a los
 *    módulos bien probados.
 * 2. Si un módulo solo contiene archivos de prueba o está vacío, su complejidad se reporta como 0.
 * 
 * @param modules - Lista de descriptores de módulos descubiertos
 * @returns Diccionario `Map<string, number>` asociando el nombre de cada módulo con su suma ciclomática
 */
export function computeCyclomaticComplexity(modules: ModuleDescriptor[]): Map<string, number> {
  const result = new Map<string, number>();

  // Iterar módulo por módulo
  for (const module of modules) {
    let total = 0;

    // Iterar sobre cada archivo registrado en el módulo
    for (const filePath of module.files) {
      // Regla de oro: Omitir archivos de test
      if (isTestFile(filePath)) {
        continue;
      }

      // Lectura síncrona en memoria con codificación UTF-8
      const sourceText = readFileSync(filePath, "utf8");

      // Acumular la complejidad ciclomática del archivo
      total += fileCyclomaticComplexity(sourceText, filePath);
    }

    // Asignar la métrica total del módulo
    result.set(module.name, total);
  }

  return result;
}
```

---

## 3. Pruebas Automatizadas: `src/modules/scoring/cyclomatic.test.ts`

```typescript
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
```
