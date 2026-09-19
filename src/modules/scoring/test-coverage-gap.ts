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
