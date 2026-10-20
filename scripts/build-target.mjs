#!/usr/bin/env node
/** Compila el binario ejecutable para el destino especificado en FORGE614_TARGET. */

import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const targets = new Map([
  ["darwin-arm64", ["bun-darwin-arm64", "forge614-atlas-darwin-arm64"]],
  ["darwin-x64", ["bun-darwin-x64", "forge614-atlas-darwin-x64"]],
  ["linux-arm64", ["bun-linux-arm64", "forge614-atlas-linux-arm64"]],
  ["linux-x64", ["bun-linux-x64", "forge614-atlas-linux-x64"]],
]);

const target = process.env.FORGE614_TARGET;
if (target === "windows-x64") {
  // Decisión 2 del propietario: Windows queda fuera de Atlas 1.2.0; se omite limpiamente en la matriz.
  process.stdout.write("windows-x64 is excluded from Atlas 1.2.0 (decision 2)\n");
  process.exit(0);
}

const selected = target === undefined ? undefined : targets.get(target);
if (!selected) {
  process.stderr.write(`FORGE614_TARGET must be one of ${[...targets.keys(), "windows-x64"].join(", ")}\n`);
  process.exit(2);
}

const output = resolve("dist/release");
await mkdir(output, { recursive: true });
const result = spawnSync("bun", ["build", "./src/interfaces/cli/main.ts", "--compile", `--target=${selected[0]}`, `--outfile=${resolve(output, selected[1])}`], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

