/**
 * Guarda que `package.json` (la fuente de la versión), la línea de versión del capítulo 10 en español y en inglés y la
 * entrada `## <versión>` de `CHANGELOG.md` digan la misma versión. No revisa otros lugares (por ejemplo `README.md`).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json";

const root = join(import.meta.dir, "..");

/**
 * Lee un archivo del repositorio como texto UTF-8.
 * @param path Ruta del archivo relativa a la raíz del repositorio.
 * @returns El contenido completo del archivo.
 */
function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

/**
 * Busca la versión que un capítulo declara en su línea «`package.json`: versión `X`» (en inglés, «version»), o `undefined`.
 * @param text Texto completo del capítulo.
 * @returns La versión encontrada, o `undefined` si el texto no tiene esa línea.
 */
function chapterVersion(text: string): string | undefined {
  return /`package\.json`: (?:versión|version) `([^`]+)`/.exec(text)?.[1];
}

/** Agrupa las pruebas que comparan la versión de `package.json` con el capítulo 10 (español e inglés) y con `CHANGELOG.md`. */
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
