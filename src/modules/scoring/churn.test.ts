import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeChurn } from "./churn";
import type { ModuleDescriptor } from "./discovery";

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

describe("computeChurn", () => {
  test("counts commits that touched files inside each module", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-churn-"));
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "Test"]);

    const authPath = join(root, "auth");
    const billingPath = join(root, "billing");
    mkdirSync(authPath, { recursive: true });
    mkdirSync(billingPath, { recursive: true });
    const authFile = join(authPath, "login.ts");
    const billingFile = join(billingPath, "charge.ts");

    writeFileSync(authFile, "export const login = () => true;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "add login"]);

    writeFileSync(authFile, "export const login = () => false;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "flip login"]);

    writeFileSync(billingFile, "export const charge = () => true;");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "add charge"]);

    const modules: ModuleDescriptor[] = [
      { name: "auth", path: authPath, files: [authFile] },
      { name: "billing", path: billingPath, files: [billingFile] },
    ];

    const result = computeChurn(root, modules);

    expect(result.get("auth")).toBe(2);
    expect(result.get("billing")).toBe(1);

    rmSync(root, { recursive: true, force: true });
  });
});
