/**
 * Guarda que todos los lugares que dicen la versión del producto digan la misma: `package.json` (la única
 * fuente), la línea de versión del capítulo 10 en los dos idiomas y la entrada correspondiente de `CHANGELOG.md`.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json";

const root = join(import.meta.dir, "..");

/** Lee un archivo del repositorio como texto UTF-8. */
function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

/** Busca la versión que un capítulo declara en su línea «`package.json`: versión `X`», o `undefined`. */
function chapterVersion(text: string): string | undefined {
  return /`package\.json`: (?:versión|version) `([^`]+)`/.exec(text)?.[1];
}

describe("aligned versions", () => {
  /** El capítulo 10 en español debe declarar la versión de `package.json`. */
  test("docs/es chapter 10 declares the package.json version", () => {
    expect(chapterVersion(read("docs/es/10-instalador-y-release.md"))).toBe(pkg.version);
  });

  /** El capítulo 10 en inglés debe declarar la versión de `package.json`. */
  test("docs/en chapter 10 declares the package.json version", () => {
    expect(chapterVersion(read("docs/en/10-installer-and-release.md"))).toBe(pkg.version);
  });

  /** El changelog debe tener una entrada `## <versión>` para la versión de `package.json`. */
  test("CHANGELOG.md has a '## <version>' entry for the package.json version", () => {
    expect(read("CHANGELOG.md").split("\n")).toContain(`## ${pkg.version}`);
  });
});
