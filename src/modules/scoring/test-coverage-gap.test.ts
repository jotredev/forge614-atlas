import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeTestCoverageGap } from "./test-coverage-gap";
import type { ModuleDescriptor } from "./discovery";

describe("computeTestCoverageGap", () => {
  test("returns 0 when every source file has a sibling .test file", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-gap-covered-"));
    const modulePath = join(root, "auth");
    mkdirSync(modulePath, { recursive: true });
    const source = join(modulePath, "login.ts");
    const testFile = join(modulePath, "login.test.ts");
    writeFileSync(source, "export const login = () => true;");
    writeFileSync(testFile, "// test");

    const modules: ModuleDescriptor[] = [{ name: "auth", path: modulePath, files: [source, testFile] }];
    const result = computeTestCoverageGap(modules);

    expect(result.get("auth")).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  test("returns 1 when no source file has a sibling test", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-gap-uncovered-"));
    const modulePath = join(root, "billing");
    mkdirSync(modulePath, { recursive: true });
    const source = join(modulePath, "charge.ts");
    writeFileSync(source, "export const charge = () => true;");

    const modules: ModuleDescriptor[] = [{ name: "billing", path: modulePath, files: [source] }];
    const result = computeTestCoverageGap(modules);

    expect(result.get("billing")).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  test("returns a fractional gap when only some files are covered", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-gap-partial-"));
    const modulePath = join(root, "mixed");
    mkdirSync(modulePath, { recursive: true });
    const covered = join(modulePath, "a.ts");
    const coveredTest = join(modulePath, "a.test.ts");
    const uncovered = join(modulePath, "b.ts");
    writeFileSync(covered, "export const a = 1;");
    writeFileSync(coveredTest, "// test");
    writeFileSync(uncovered, "export const b = 2;");

    const modules: ModuleDescriptor[] = [
      { name: "mixed", path: modulePath, files: [covered, coveredTest, uncovered] },
    ];
    const result = computeTestCoverageGap(modules);

    expect(result.get("mixed")).toBe(0.5);
    rmSync(root, { recursive: true, force: true });
  });
});
