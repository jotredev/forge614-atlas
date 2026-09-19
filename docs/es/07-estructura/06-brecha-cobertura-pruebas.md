# 07.06 Brecha de Cobertura de Pruebas (Test Coverage Gap)

> **Documento de Arquitectura y Código — Ecosistema Forge614 Atlas**  
> **Alcance:** `src/modules/scoring/test-coverage-gap.ts` y `test-coverage-gap.test.ts`  
> **Traducción hermana:** [07.06 (EN) Test Coverage Gap (test-coverage-gap.ts and test)](../../en/07-structure/06-test-coverage-gap.md)

---

## 1. Justificación Arquitectónica

La Brecha de Cobertura de Pruebas (Test Coverage Gap) cuantifica la fragilidad operativa de un módulo evaluando la ausencia de suites de pruebas unitarias colocalizadas (*sibling tests*). En sistemas guiados por agentes de Inteligencia Artificial como Atlas, modificar un módulo complejo que carece de pruebas automatizadas representa un riesgo mayúsculo de introducir regresiones silenciosas.

### Reglas Críticas del Algoritmo
1. **Detección de Archivos Hermanos (*Sibling Tests*):** Por convención estándar, para cada archivo productivo `auth.ts`, busca si existe en el mismo directorio `auth.test.ts` o `auth.spec.ts` (preservando la extensión `.tsx`, `.js`, etc.).
2. **Fórmula Normalizada en $[0.0, 1.0]$:**
   $$\text{TestGap} = 1.0 - \frac{|\text{Archivos con Prueba Hermana}|}{|\text{Total Archivos Fuente Productivos}|}$$
   - $\text{TestGap} = 0.0$: Todos los archivos productivos están respaldados por pruebas.
   - $\text{TestGap} = 1.0$: Ningún archivo productivo cuenta con pruebas unitarias (máxima desprotección).
3. **Manejo de Casos Borde:** Módulos que únicamente contienen configuraciones o carecen de código productivo devuelven $0.0$ de brecha para no penalizar estructuras de soporte.
4. **Función en el Sistema:** No es una señal aditiva; opera como un **multiplicador de riesgo** del $+20\%$ en la fórmula compuesta ($1 + 0.20 \cdot \text{TestGap}$).

### Analogía del Mundo Real
> Es como circular por una cornisa montañosa con un camión pesado: el peso y la velocidad representan la complejidad del módulo, pero la presencia o ausencia de barandillas de contención en el acantilado representa la cobertura de pruebas. Si no hay barandilla ($\text{TestGap} = 1.0$), cualquier maniobra imprevista es fatal.

---

## 2. Código Fuente Documentado: `src/modules/scoring/test-coverage-gap.ts`

```typescript
import { existsSync } from "node:fs";
import { isTestFile, type ModuleDescriptor } from "./discovery";

/**
 * Comprueba si un archivo fuente productivo tiene un archivo de pruebas hermano (sibling test).
 * 
 * Convención estándar de la industria (co-located tests):
 * - Para un archivo como `/src/auth/jwt.ts`, se buscan dos variantes hermanas directas:
 *   1. `/src/auth/jwt.test.ts` (o con la extensión original: .tsx, .js, .jsx)
 *   2. `/src/auth/jwt.spec.ts`
 * 
 * Algoritmo paso a paso:
 * 1. Encuentra la última posición del punto (`.`) en la ruta para extraer la extensión (`ext`)
 *    y la ruta base (`base`).
 * 2. Verifica mediante `existsSync` si existe `{base}.test{ext}` o `{base}.spec{ext}`.
 * 
 * @param filePath - Ruta absoluta del archivo fuente productivo
 * @returns `true` si existe un archivo de prueba hermano en disco, `false` en caso contrario
 */
function hasSiblingTest(filePath: string): boolean {
  const dotIndex = filePath.lastIndexOf(".");
  const base = filePath.slice(0, dotIndex);
  const ext = filePath.slice(dotIndex);

  return existsSync(`${base}.test${ext}`) || existsSync(`${base}.spec${ext}`);
}

/**
 * Calcula la Brecha de Cobertura de Pruebas (Test Coverage Gap) para cada módulo.
 * 
 * Definición y Fundamento de Calidad:
 * - El "Test Coverage Gap" cuantifica la proporción de archivos fuente productivos que
 *   carecen de una suite de pruebas unitarias asociada.
 * - Rango normalizado: `[0.0, 1.0]`.
 *   - `0.0`: Cobertura de pruebas completa (todos los archivos tienen su test hermano).
 *   - `1.0`: Brecha total (ningún archivo productivo cuenta con pruebas automatizadas).
 * 
 * Algoritmo paso a paso:
 * 1. Por cada módulo, filtra exclusivamente sus archivos productivos excluyendo los tests existentes.
 * 2. Caso borde: Si el módulo no contiene archivos productivos (ej. solo configuración o vacío),
 *    la brecha es estrictamente 0.0 para no penalizar módulos que no ejecutan lógica de negocio.
 * 3. Cuenta cuántos de esos archivos productivos poseen un archivo hermano de prueba (`withTests`).
 * 4. Aplica la fórmula complementaria:
 *    `gap = 1.0 - (withTests / sourceFiles.length)`
 * 5. Almacena el resultado en el mapa por cada módulo.
 * 
 * Rol en el Motor de Puntuación:
 * - Esta métrica NO se suma directamente a las señales estructurales (ciclomática, fan-in, churn).
 * - En su lugar, se utiliza en `composite-score.ts` como un MULTIPLICADOR DE RIESGO:
 *   `score = base * (1 + 0.20 * testGap)`.
 *   Un módulo complejo sin pruebas recibe un castigo del +20% en su puntuación de complejidad,
 *   garantizando que reciba mayor presupuesto de contexto en los agentes de Forge614 Atlas.
 * 
 * @param modules - Lista de módulos descubiertos
 * @returns Diccionario `Map<string, number>` con el gap en rango [0.0, 1.0] por cada módulo
 */
export function computeTestCoverageGap(modules: ModuleDescriptor[]): Map<string, number> {
  const result = new Map<string, number>();

  for (const module of modules) {
    // 1. Filtrar solo los archivos de código fuente productivo (excluir archivos de prueba)
    const sourceFiles = module.files.filter(file => !isTestFile(file));

    // 2. Manejo de caso borde: módulo sin código productivo
    if (sourceFiles.length === 0) {
      result.set(module.name, 0);
      continue;
    }

    // 3. Filtrar aquellos archivos que sí disponen de su respectivo archivo hermano de pruebas
    const withTests = sourceFiles.filter(hasSiblingTest);

    // 4. Calcular la proporción de archivos desprotegidos (brecha)
    const gap = 1 - withTests.length / sourceFiles.length;

    // 5. Guardar la brecha calculada
    result.set(module.name, gap);
  }

  return result;
}
```

---

## 3. Pruebas Automatizadas: `src/modules/scoring/test-coverage-gap.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeTestCoverageGap } from "./test-coverage-gap";
import type { ModuleDescriptor } from "./discovery";

describe("computeTestCoverageGap", () => {
  test("returns 0 when every source file has a sibling .test file", () => {
    // Escenario: Cobertura perfecta (1 archivo productivo acompañado de 1 archivo de test hermano).
    // Fórmula: 1 - (1 con test / 1 fuente) = 0.0 de brecha.
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
    // Escenario: Brecha total (1 archivo productivo sin archivo de test hermano).
    // Fórmula: 1 - (0 con test / 1 fuente) = 1.0 de brecha (máximo riesgo).
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
    // Escenario: Cobertura mixta (2 archivos productivos, solo 1 tiene prueba hermana).
    // Fórmula: 1 - (1 con test / 2 fuentes) = 0.5 (50% de brecha).
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
```
