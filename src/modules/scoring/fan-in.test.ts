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
});
