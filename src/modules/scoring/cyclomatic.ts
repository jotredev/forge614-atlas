import ts from "typescript";
import { readFileSync } from "node:fs";
import type { ModuleDescriptor } from "./discovery";

export function fileCyclomaticComplexity(sourceText: string, fileName = "module.ts"): number {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  let complexity = 1;

  function visit(node: ts.Node): void {
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.CaseClause:
        complexity++;
        break;
      default:
        break;
    }
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      ) {
        complexity++;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return complexity;
}

export function computeCyclomaticComplexity(modules: ModuleDescriptor[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const module of modules) {
    let total = 0;
    for (const filePath of module.files) {
      const sourceText = readFileSync(filePath, "utf8");
      total += fileCyclomaticComplexity(sourceText, filePath);
    }
    result.set(module.name, total);
  }
  return result;
}
