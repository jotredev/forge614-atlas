import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveModuleFiles } from "./module-files";

describe("resolveModuleFiles", () => {
  test("returns the absolute file list for each named module, empty for unknown names", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-module-files-"));
    mkdirSync(join(root, "auth"), { recursive: true });
    writeFileSync(join(root, "auth", "login.ts"), "export const login = () => true;");
    mkdirSync(join(root, "billing"), { recursive: true });
    writeFileSync(join(root, "billing", "invoice.ts"), "export const invoice = () => 1;");

    const result = resolveModuleFiles(root, ["auth", "unknown-module"]);

    expect(result.get("auth")).toEqual([join(root, "auth", "login.ts")]);
    expect(result.get("unknown-module")).toEqual([]);
    expect(result.has("billing")).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});
