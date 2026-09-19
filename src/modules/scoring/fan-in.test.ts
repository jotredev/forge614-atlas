import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeFanIn } from "./fan-in";
import type { ModuleDescriptor } from "./discovery";

describe("computeFanIn", () => {
  test("counts how many other modules import from this one", () => {
    // Escenario: El módulo 'shared' es consumido por 'auth' y 'billing'.
    // Su Fan-In debe ser exactamente 2.
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

    // 'shared' tiene 2 módulos consumidores; 'auth' y 'billing' tienen 0
    expect(result.get("shared")).toBe(2);
    expect(result.get("auth")).toBe(0);
    expect(result.get("billing")).toBe(0);

    rmSync(root, { recursive: true, force: true });
  });

  test("does not count a module importing from itself", () => {
    // Escenario: Dentro de 'auth', fileB importa fileA.
    // Esto es cohesión interna, jamás debe contarse como Fan-In de dependencias externas.
    const root = mkdtempSync(join(tmpdir(), "atlas-fanin-self-"));
    const modulePath = join(root, "auth");
    mkdirSync(modulePath, { recursive: true });
    const fileA = join(modulePath, "a.ts");
    const fileB = join(modulePath, "b.ts");
    writeFileSync(fileA, "export const helper = () => true;");
    writeFileSync(fileB, `import { helper } from "./a";\nexport const login = () => helper();`);

    const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [fileA, fileB] }];
    const result = computeFanIn(modules);

    // Debe ser 0 porque no hay módulos externos importándolo
    expect(result.get("auth")).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  test("handles sibling modules with overlapping names correctly (path-prefix collision)", () => {
    // Escenario de colisión de prefijo: 'auth' vs 'auth-legacy'.
    // Si 'auth-legacy' importa de 'auth', solo 'auth' debe recibir +1 en Fan-In,
    // y 'auth-legacy' no debe ser confundido por coincidencia parcial de texto.
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
    // Escenario de deduplicación de aristas:
    // El módulo 'auth' tiene 3 archivos y 4 sentencias de import dirigidas a 'shared'.
    // Sin embargo, como ambas pertenecen al mismo módulo consumidor ('auth'),
    // el Fan-In de 'shared' debe ser estrictamente 1 (módulo a módulo), NO 4 ni 3.
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

    // Verificación de unicidad en grafo: 1 arista entre 'auth' y 'shared'
    expect(result.get("shared")).toBe(1);

    rmSync(root, { recursive: true, force: true });
  });

  test("does not count imports from a module's own test files", () => {
    // Escenario: El archivo 'auth/login.test.ts' importa de 'shared', pero 'auth/login.ts' NO.
    // Como los archivos de prueba se excluyen del cómputo productivo, el Fan-In de 'shared' debe ser 0.
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

    expect(result.get("shared")).toBe(0);

    rmSync(root, { recursive: true, force: true });
  });
});
