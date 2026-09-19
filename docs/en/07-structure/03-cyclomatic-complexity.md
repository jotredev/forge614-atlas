# 07.03 (EN) AST Cyclomatic Complexity (cyclomatic.ts and test)

> **Architecture and Code Reference — Forge614 Atlas Ecosystem**  
> **Scope:** `src/modules/scoring/cyclomatic.ts` and `cyclomatic.test.ts`  
> **Sister Translation:** [07.03 Complejidad Ciclomática AST (Cyclomatic)](../../es/07-estructura/03-complejidad-ciclomatica.md)

---

## 1. Architectural Rationale

Cyclomatic complexity, introduced by Thomas McCabe in 1976, measures the number of linearly independent paths through a program's source code. Rather than employing error-prone regular expressions, Forge614 Atlas evaluates the **Abstract Syntax Tree (AST)** directly via the official TypeScript compiler API:
1. **Baseline = 1:** Every valid executable file has at least one linear path through it.
2. **Explicit Structural Branches (+1):** `if`, ternary `? :`, `while`, `do...while`, `for`, `for...in`, `for...of`, `catch` clauses, and `case` clauses.
3. **McCabe's Rule on `default:`:** The `default:` clause in a `switch` statement **never adds a point** because it represents the default exit path rather than a distinct conditional choice.
4. **Logical Short-Circuit Operators (+1):** In JavaScript/TypeScript, `&&`, `||`, and `??` (nullish coalescing) introduce implicit conditional branches at runtime.
5. **Test Isolation:** Files ending in `.test.ts` or `.spec.ts` are strictly excluded from module totals to avoid penalizing well-tested modules.

### Real-World Analogy
> It is like driving through a highway network: a straight stretch with no exits or lights has a complexity of 1 (easy to navigate). Every interchange, fork, roundabout, or detour adds a new opportunity to make a wrong turn, requiring more cognitive focus.

---

## 2. Documented Source Code: `src/modules/scoring/cyclomatic.ts`

```typescript
import ts from "typescript";
import { readFileSync } from "node:fs";
import { isTestFile, type ModuleDescriptor } from "./discovery";

/**
 * Computes McCabe's Cyclomatic Complexity for an individual source file
 * by parsing its Abstract Syntax Tree (AST) with the official TypeScript compiler.
 * 
 * Mathematical Formulation (Thomas J. McCabe, 1976):
 * - M = E - N + 2P
 *   Where E = control graph edges, N = nodes, P = connected components.
 * - For a single-entry, single-exit program, this reduces to:
 *   M = 1 + (number of decision points and boolean branches in the code).
 * 
 * Step-by-step Algorithm:
 * 1. Parses source code text into an in-memory AST using `ts.createSourceFile`.
 *    Targets `ts.ScriptTarget.Latest` for modern language features.
 * 2. Initializes complexity at `complexity = 1` (linear baseline path).
 * 3. Recursively visits nodes via `visit(node)`.
 * 4. Increments by +1 for each structural branch:
 *    - `if` statements and ternary expressions (`condition ? a : b`).
 *    - Loops: `while`, `do...while`, `for`, `for...in`, `for...of`.
 *    - `catch` clauses (exception handling error branches).
 *    - `case` clauses in `switch` statements. (Note: `default:` is excluded per McCabe's rule).
 * 5. Increments by +1 for short-circuit binary expressions (`&&`, `||`, `??`).
 * 6. Recursively traverses all child nodes via `ts.forEachChild`.
 * 
 * @param sourceText - Full source code text
 * @param fileName - Virtual filename for compiler diagnostic context
 * @returns Positive integer representing cyclomatic complexity score
 */
export function fileCyclomaticComplexity(sourceText: string, fileName = "module.ts"): number {
  // 1. Construct read-only AST in memory
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true // setParentNodes: enables full tree navigation
  );

  // 2. McCabe's baseline: every executable file has at least 1 direct linear path
  let complexity = 1;

  // 3. Depth-first search (DFS) AST traversal
  function visit(node: ts.Node): void {
    // 4. Match explicit structural branch points
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:              // if (...)
      case ts.SyntaxKind.ConditionalExpression:    // cond ? a : b
      case ts.SyntaxKind.WhileStatement:            // while (...)
      case ts.SyntaxKind.DoStatement:               // do { ... } while (...)
      case ts.SyntaxKind.ForStatement:              // for (let i = 0; ...)
      case ts.SyntaxKind.ForInStatement:           // for (const key in obj)
      case ts.SyntaxKind.ForOfStatement:           // for (const item of arr)
      case ts.SyntaxKind.CatchClause:              // try { ... } catch (err)
      case ts.SyntaxKind.CaseClause:               // case "VAL": (default is excluded by McCabe's rule)
        complexity++;
        break;
      default:
        break;
    }

    // 5. Match implicit short-circuit boolean branches
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

    // 6. Descend to child nodes
    ts.forEachChild(node, visit);
  }

  // Start traversal from root node
  visit(sourceFile);

  return complexity;
}

/**
 * Computes the total aggregate cyclomatic complexity for each module in a collection.
 * 
 * Key Architectural Rules:
 * 1. Test files (`.test.ts`, `.spec.ts`) are strictly excluded via `isTestFile`.
 *    Justification: Tests contain numerous assertions and fixtures that do not reflect
 *    production cognitive load. Including them would unfairly penalize well-tested modules.
 * 2. Modules without production files report a complexity of 0.
 * 
 * @param modules - List of discovered module descriptors
 * @returns Map associating each module name with its aggregate cyclomatic complexity
 */
export function computeCyclomaticComplexity(modules: ModuleDescriptor[]): Map<string, number> {
  const result = new Map<string, number>();

  // Iterate module by module
  for (const module of modules) {
    let total = 0;

    // Iterate over files registered in the module
    for (const filePath of module.files) {
      // Golden rule: skip test files
      if (isTestFile(filePath)) {
        continue;
      }

      // Synchronous UTF-8 read
      const sourceText = readFileSync(filePath, "utf8");

      // Accumulate file cyclomatic complexity
      total += fileCyclomaticComplexity(sourceText, filePath);
    }

    // Assign module metric
    result.set(module.name, total);
  }

  return result;
}
```

---

## 3. Automated Tests: `src/modules/scoring/cyclomatic.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileCyclomaticComplexity, computeCyclomaticComplexity } from "./cyclomatic";
import type { ModuleDescriptor } from "./discovery";

describe("fileCyclomaticComplexity", () => {
  test("a function with no branching has the baseline complexity of 1", () => {
    // Linear function: 0 branches -> baseline complexity = 1 (McCabe's axiom)
    const source = "export function identity(value: number) { return value; }";
    expect(fileCyclomaticComplexity(source)).toBe(1);
  });

  test("counts if/else-if, loops, switch cases, and logical operators (never default)", () => {
    // Code with multiple control structures:
    // 1 (baseline)
    // + 1 (if value > 10)
    // + 1 (else if value > 0)
    // + 1 (for const item of items)
    // + 1 (if item < 0 ...)
    // + 1 (logical operator &&)
    // + 1 (case 1:)
    // + 1 (case 2:)
    // + 0 (default: NEVER counts per McCabe's rule)
    // Total expected = 8
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

    // fileA: identity -> complexity 1
    writeFileSync(fileA, "export function identity(value: number) { return value; }");
    // fileB: flag with 1 if -> complexity 1 (baseline) + 1 (if) = 2
    writeFileSync(fileB, "export function flag(value: boolean) { if (value) return 1; return 0; }");

    const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [fileA, fileB] }];
    const result = computeCyclomaticComplexity(modules);

    // Expected aggregate: 1 + 2 = 3
    expect(result.get("auth")).toBe(3);
    rmSync(root, { recursive: true, force: true });
  });

  test("excludes *.test.ts files from the module's complexity total", () => {
    root = mkdtempSync(join(tmpdir(), "atlas-cyclomatic-testfile-"));
    const modulePath = join(root, "auth");
    mkdirSync(modulePath, { recursive: true });

    const sourceFile = join(modulePath, "a.ts");
    const testFile = join(modulePath, "a.test.ts");

    // Production code: complexity = 1
    writeFileSync(sourceFile, "export function identity(value: number) { return value; }");

    // Branch-heavy test file: must be SKIPPED
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

    // Only counts production file (1), skipping a.test.ts
    expect(result.get("auth")).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });
});
```
