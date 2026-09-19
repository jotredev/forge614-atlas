import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverModules } from "./discovery";

describe("discoverModules", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "atlas-discovery-"));
    mkdirSync(join(root, "src", "auth"), { recursive: true });
    writeFileSync(join(root, "src", "auth", "login.ts"), "export const login = () => true;");
    mkdirSync(join(root, "src", "styles"), { recursive: true });
    writeFileSync(join(root, "src", "styles", "index.css"), "body { margin: 0; }");
    mkdirSync(join(root, "node_modules", "some-package"), { recursive: true });
    writeFileSync(join(root, "node_modules", "some-package", "index.js"), "module.exports = {};");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("finds top-level folders that contain source files", () => {
    const modules = discoverModules(join(root, "src"));
    expect(modules).toHaveLength(1);
    expect(modules[0]?.name).toBe("auth");
    expect(modules[0]?.files).toEqual([join(root, "src", "auth", "login.ts")]);
  });

  test("excludes folders with no ts/tsx/js/jsx files", () => {
    const modules = discoverModules(join(root, "src"));
    const names = modules.map(module => module.name);
    expect(names).not.toContain("styles");
  });

  test("ignores node_modules even when scanning from the repo root", () => {
    const modules = discoverModules(root);
    const names = modules.map(module => module.name);
    expect(names).not.toContain("node_modules");
  });

  test("excludes nested dot-directories from file scanning", () => {
    const srcPath = join(root, "src");
    mkdirSync(join(srcPath, "auth", ".cache"), { recursive: true });
    writeFileSync(join(srcPath, "auth", ".cache", "generated.ts"), "export const x = 1;");
    const modules = discoverModules(srcPath);
    expect(modules).toHaveLength(1);
    expect(modules[0]?.name).toBe("auth");
    expect(modules[0]?.files).toHaveLength(1);
    expect(modules[0]?.files).toEqual([join(srcPath, "auth", "login.ts")]);
  });
});
