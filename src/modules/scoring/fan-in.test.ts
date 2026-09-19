import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeFanIn } from "./fan-in";
import type { ModuleDescriptor } from "./discovery";

describe("computeFanIn", () => {
  test("counts how many other modules import from this one", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-fanin-"));
    const sharedPath = join(root, "shared");
    const authPath = join(root, "auth");
    const billingPath = join(root, "billing");
    mkdirSync(sharedPath, { recursive: true });
    mkdirSync(authPath, { recursive: true });
    mkdirSync(billingPath, { recursive: true });

    const sharedFile = join(sharedPath, "logger.ts");
    const authFile = join(authPath, "login.ts");
    const billingFile = join(billingPath, "charge.ts");

    writeFileSync(sharedFile, "export const log = (message: string) => console.log(message);");
    writeFileSync(authFile, `import { log } from "../shared/logger";\nexport const login = () => log("login");`);
    writeFileSync(billingFile, `import { log } from "../shared/logger";\nexport const charge = () => log("charge");`);

    const modules: ModuleDescriptor[] = [
      { name: "shared", path: sharedPath, files: [sharedFile] },
      { name: "auth", path: authPath, files: [authFile] },
      { name: "billing", path: billingPath, files: [billingFile] },
    ];

    const result = computeFanIn(modules);

    expect(result.get("shared")).toBe(2);
    expect(result.get("auth")).toBe(0);
    expect(result.get("billing")).toBe(0);

    rmSync(root, { recursive: true, force: true });
  });

  test("does not count a module importing from itself", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-fanin-self-"));
    const modulePath = join(root, "auth");
    mkdirSync(modulePath, { recursive: true });
    const fileA = join(modulePath, "a.ts");
    const fileB = join(modulePath, "b.ts");
    writeFileSync(fileA, "export const helper = () => true;");
    writeFileSync(fileB, `import { helper } from "./a";\nexport const login = () => helper();`);

    const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [fileA, fileB] }];
    const result = computeFanIn(modules);

    expect(result.get("auth")).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  test("handles sibling modules with overlapping names correctly (path-prefix collision)", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-fanin-collision-"));
    const authPath = join(root, "auth");
    const authLegacyPath = join(root, "auth-legacy");
    mkdirSync(authPath, { recursive: true });
    mkdirSync(authLegacyPath, { recursive: true });

    const authFile = join(authPath, "index.ts");
    const authLegacyFile = join(authLegacyPath, "index.ts");

    writeFileSync(authFile, "export const newAuth = () => true;");
    writeFileSync(authLegacyFile, `import { newAuth } from "../auth";\nexport const legacyAuth = () => newAuth();`);

    const modules: ModuleDescriptor[] = [
      { name: "auth", path: authPath, files: [authFile] },
      { name: "auth-legacy", path: authLegacyPath, files: [authLegacyFile] },
    ];

    const result = computeFanIn(modules);

    expect(result.get("auth")).toBe(1);
    expect(result.get("auth-legacy")).toBe(0);

    rmSync(root, { recursive: true, force: true });
  });

  test("counts distinct importing modules, not import statements or files", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-fanin-distinct-"));
    const sharedPath = join(root, "shared");
    const authPath = join(root, "auth");
    mkdirSync(sharedPath, { recursive: true });
    mkdirSync(authPath, { recursive: true });

    const sharedFile = join(sharedPath, "logger.ts");
    const authFileA = join(authPath, "a.ts");
    const authFileB = join(authPath, "b.ts");
    const authFileC = join(authPath, "c.ts");

    writeFileSync(sharedFile, "export const log = (message: string) => console.log(message);");
    // Four separate import statements across the same source module, all targeting "shared".
    writeFileSync(
      authFileA,
      `import { log } from "../shared/logger";\nimport { log as log2 } from "../shared/logger";\nexport const a = () => { log("a"); log2("a2"); };`,
    );
    writeFileSync(authFileB, `import { log } from "../shared/logger";\nexport const b = () => log("b");`);
    writeFileSync(authFileC, `import { log } from "../shared/logger";\nexport const c = () => log("c");`);

    const modules: ModuleDescriptor[] = [
      { name: "shared", path: sharedPath, files: [sharedFile] },
      { name: "auth", path: authPath, files: [authFileA, authFileB, authFileC] },
    ];

    const result = computeFanIn(modules);

    // auth imports from shared via 4 statements across 3 files, but it is a single distinct
    // importing module, so shared's fan-in should be 1, not 4 or 3.
    expect(result.get("shared")).toBe(1);

    rmSync(root, { recursive: true, force: true });
  });

  test("does not count imports from a module's own test files", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-fanin-testfile-"));
    const sharedPath = join(root, "shared");
    const authPath = join(root, "auth");
    mkdirSync(sharedPath, { recursive: true });
    mkdirSync(authPath, { recursive: true });

    const sharedFile = join(sharedPath, "logger.ts");
    const authSourceFile = join(authPath, "login.ts");
    const authTestFile = join(authPath, "login.test.ts");

    writeFileSync(sharedFile, "export const log = (message: string) => console.log(message);");
    writeFileSync(authSourceFile, "export const login = () => true;");
    writeFileSync(
      authTestFile,
      `import { log } from "../shared/logger";\nlog("testing login");`,
    );

    const modules: ModuleDescriptor[] = [
      { name: "shared", path: sharedPath, files: [sharedFile] },
      { name: "auth", path: authPath, files: [authSourceFile, authTestFile] },
    ];

    const result = computeFanIn(modules);

    // Only the test file imports from "shared"; that shouldn't count as auth importing it.
    expect(result.get("shared")).toBe(0);

    rmSync(root, { recursive: true, force: true });
  });
});
