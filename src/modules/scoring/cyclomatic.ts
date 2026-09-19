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
