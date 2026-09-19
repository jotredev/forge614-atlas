# 07.09 Arnés de Pruebas y Sanidad (Scaffold Test)

> **Documento de Arquitectura y Código — Ecosistema Forge614 Atlas**  
> **Alcance:** `src/modules/scoring/scaffold.test.ts`  
> **Traducción hermana:** [07.09 (EN) Test Harness and Sanity (scaffold.test.ts)](../../en/07-structure/09-test-harness-sanity.md)

---

## 1. Justificación Arquitectónica

Antes de comenzar la construcción incremental de las cinco fases del motor de puntuación guiado por la metodología SDD (Software Design Description), se requería una prueba de sanidad fundamental. El archivo `scaffold.test.ts` valida que el arnés de pruebas de Bun (`bun test`) esté correctamente configurado en el monorrepositorio, que los tipos globales de `@types/bun` resuelvan limpiamente y que la aserción matemática elemental funcione antes de cualquier lógica compleja.

### Analogía del Mundo Real
> Es como encender el contacto y verificar que las luces del tablero del automóvil prenden antes de arrancar el motor para un viaje largo. Si el tablero no enciende, no tiene sentido poner primera marcha.

---

## 2. Código Fuente Documentado: `src/modules/scoring/scaffold.test.ts`

```typescript
import { describe, expect, test } from "bun:test";

/**
 * Suite de verificación inicial del arnés de pruebas (scaffold test).
 * 
 * Propósito:
 * - Garantizar que el ejecutor nativo de pruebas de Bun (`bun test`)
 *   esté correctamente enlazado, configurado y funcional antes de ejecutar
 *   la suite de pruebas unitarias y de integración de Forge614 Atlas.
 */
describe("project scaffold", () => {
  test("the test runner is wired up", () => {
    // Aserción de sanidad mínima y determinista
    expect(1 + 1).toBe(2);
  });
});
```

---

## 3. Registro de Ejecución de la Suite Completa de Pruebas

```bash
$ bun test
bun test v1.3.8 (b64edcb4)

src/modules/scoring/test-coverage-gap.test.ts:
✓ computeTestCoverageGap > returns 0 when every source file has a sibling .test file
✓ computeTestCoverageGap > returns 1 when no source file has a sibling test
✓ computeTestCoverageGap > returns a fractional gap when only some files are covered

src/modules/scoring/tiers.test.ts:
✓ assignTiers > splits 20 modules into roughly 50/35/15 by descending score
✓ assignTiers > a project with a single module still gets a tier, never crashes
✓ assignTiers > ties on score break deterministically by name, regardless of input order

src/modules/scoring/scaffold.test.ts:
✓ project scaffold > the test runner is wired up

src/modules/scoring/fan-in.test.ts:
✓ computeFanIn > counts how many other modules import from this one
✓ computeFanIn > does not count a module importing from itself
✓ computeFanIn > handles sibling modules with overlapping names correctly (path-prefix collision)
✓ computeFanIn > counts distinct importing modules, not import statements or files
✓ computeFanIn > does not count imports from a module's own test files

src/modules/scoring/cyclomatic.test.ts:
✓ fileCyclomaticComplexity > a function with no branching has the baseline complexity of 1
✓ fileCyclomaticComplexity > counts if/else-if, loops, switch cases, and logical operators (never default)
✓ computeCyclomaticComplexity > sums complexity across every file in a module
✓ computeCyclomaticComplexity > excludes *.test.ts files from the module's complexity total

src/modules/scoring/composite-score.test.ts:
✓ computeCompositeScores > weights cyclomatic and fan-in higher than churn, and never lets testGap fully decide
✓ computeCompositeScores > a module that is complex but well-tested still outranks a trivial one, without the test gap inflating it

src/modules/scoring/discovery.test.ts:
✓ discoverModules > finds top-level folders that contain source files
✓ discoverModules > excludes folders with no ts/tsx/js/jsx files
✓ discoverModules > ignores node_modules even when scanning from the repo root
✓ discoverModules > excludes nested dot-directories from file scanning
✓ discoverModules > returns modules and files in stable, alphabetically sorted order regardless of creation order

src/modules/scoring/churn.test.ts:
✓ computeChurn > counts changed-file entries per module across commit history
✓ computeChurn > correctly attributes files to modules with prefix-overlapping names
✓ computeChurn > correctly attributes churn for modules with non-ASCII names

 26 pass
 0 fail
 46 expect() calls
Ran 26 tests across 8 files. [287.00ms]
```
