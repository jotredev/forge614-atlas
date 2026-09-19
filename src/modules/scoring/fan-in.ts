import ts from "typescript";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { isTestFile, type ModuleDescriptor } from "./discovery";

export function extractRelativeImportSpecifiers(sourceText: string, fileName = "module.ts"): string[] {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0] as ts.Expression)
    ) {
      specifiers.push((node.arguments[0] as ts.StringLiteral).text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  return specifiers.filter(specifier => specifier.startsWith("."));
}

function resolveImportPath(fromFile: string, specifier: string): string | null {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    join(base, "index.js"),
  ];
  return candidates.find(candidate => existsSync(candidate)) ?? null;
}

export function computeFanIn(modules: ModuleDescriptor[]): Map<string, number> {
  const fanIn = new Map(modules.map(module => [module.name, 0]));

  for (const fromModule of modules) {
    const targetModuleNames = new Set<string>();
    for (const filePath of fromModule.files) {
      if (isTestFile(filePath)) continue;
      const sourceText = readFileSync(filePath, "utf8");
      for (const specifier of extractRelativeImportSpecifiers(sourceText, filePath)) {
        const resolvedPath = resolveImportPath(filePath, specifier);
        if (!resolvedPath) continue;
        const toModule = modules.find(module => {
          const modulePath = module.path;
          return resolvedPath === modulePath || resolvedPath.startsWith(modulePath + sep);
        });
        if (toModule && toModule.name !== fromModule.name) {
          targetModuleNames.add(toModule.name);
        }
      }
    }
    for (const name of targetModuleNames) {
      fanIn.set(name, (fanIn.get(name) ?? 0) + 1);
    }
  }
  return fanIn;
}
