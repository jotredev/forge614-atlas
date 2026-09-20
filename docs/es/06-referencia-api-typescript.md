# 06. Referencia de API Pública en TypeScript

> **Documento Oficial de Referencia Técnica — Ecosistema Forge614**  
> **Proyecto:** Forge614 Atlas (Orquestador de Contextualización Profunda)  
> **Punto de Entrada:** `src/index.ts` (`"exports": "./src/index.ts"` en `package.json`)  
> **Compatibilidad:** Bun >= 1.3.8 | TypeScript 5.9.3 en modo estricto  
> **Traducción hermana:** [06 (EN). TypeScript Public API Reference](../en/06-typescript-api-reference.md)

---

## 1. Declaración de Tipos e Interfaces

Todos los tipos de datos expuestos por la librería son inmutables y fuertemente tipados:

### `ModuleDescriptor`
Representa un módulo identificado en el disco con sus archivos de código fuente:

```typescript
export interface ModuleDescriptor {
  /** Nombre del directorio del módulo (ej. "auth", "scoring") */
  name: string;
  /** Ruta absoluta al directorio en el sistema de archivos */
  path: string;
  /** Lista de rutas absolutas de archivos (.ts, .tsx, .js, .jsx) ordenadas alfabéticamente */
  files: string[];
}
```

### `ModuleSignals`
Agrupa las cuatro mediciones en bruto de un módulo antes de ser normalizadas:

```typescript
export interface ModuleSignals {
  /** Nombre del módulo correspondiente */
  name: string;
  /** Suma de complejidad ciclomática de todos los archivos productivos */
  cyclomatic: number;
  /** Cantidad de otros módulos distintos que importan este módulo */
  fanIn: number;
  /** Número total de cambios en el historial de Git */
  churn: number;
  /** Proporción entre 0.0 y 1.0 de archivos fuente sin archivo de prueba hermano */
  testGap: number;
}
```

### `ModuleScore`
Puntaje compuesto resultante tras la normalización Min-Max y aplicación de pesos:

```typescript
export interface ModuleScore {
  /** Nombre del módulo */
  name: string;
  /** Puntaje ponderado continuo */
  score: number;
}
```

### `Tier` y `TieredModule`
Nivel operativo asignado según la posición percentil del módulo:

```typescript
export type Tier = "ligero" | "estandar" | "profundo";

export interface TieredModule extends ModuleScore {
  /** Clasificación final del módulo */
  tier: Tier;
}
```

---

## 2. Catálogo de Funciones Exportadas

### 2.1 Descubrimiento de Módulos

#### `discoverModules(root: string): ModuleDescriptor[]`
Escanea la carpeta `root` y devuelve un arreglo de módulos de primer nivel, excluyendo carpetas ocultas y directorios de compilación (`node_modules`, `.git`, `dist`, `build`, etc.).

```typescript
import { discoverModules } from "forge614-atlas";

const modules = discoverModules("/Users/jorgeetrejoo/Desktop/mi-proyecto");
console.log(`Módulos descubiertos: ${modules.length}`);
```

#### `isTestFile(filePath: string): boolean`
Retorna `true` si el archivo termina con `.test.ts`, `.spec.tsx`, etc.

---

### 2.2 Métricas de Complejidad

#### `fileCyclomaticComplexity(sourceText: string, fileName?: string): number`
Analiza una cadena de texto TypeScript mediante el AST del compilador y calcula la complejidad ciclomática de McCabe (base 1 + ramas).

#### `computeCyclomaticComplexity(modules: ModuleDescriptor[]): Map<string, number>`
Calcula la suma acumulada de complejidad ciclomática de los archivos productivos de cada módulo, ignorando automáticamente los archivos de prueba.

---

### 2.3 Centralidad y Dependencias

#### `computeFanIn(modules: ModuleDescriptor[]): Map<string, number>`
Analiza las sentencias de importación/exportación relativas de todo el proyecto y cuenta cuántos otros módulos distintos dependen de cada módulo.

---

### 2.4 Volatilidad Histórica

#### `computeChurn(repoRoot: string, modules: ModuleDescriptor[]): Map<string, number>`
Ejecuta `git -c core.quotepath=false log` y cuantifica el número de veces que los archivos de cada módulo han sido modificados en el historial de commits.

> [!CAUTION]
> Lanza un error si `repoRoot` no es un repositorio de Git o si `git log` falla (por ejemplo, en repositorios sin commits). `runInitCommand` lo convierte en el resultado JSON estructurado `ANALYSIS_FAILED`; `computeChurn` no degrada a cero por sí mismo.

---

### 2.5 Brecha de Pruebas

#### `computeTestCoverageGap(modules: ModuleDescriptor[]): Map<string, number>`
Verifica la presencia de archivos `.test.*` o `.spec.*` hermanos para cada archivo fuente y calcula la fracción descubierta entre `0.0` y `1.0`.

---

### 2.6 Puntuación y Clasificación

#### `computeCompositeScores(signals: ModuleSignals[]): ModuleScore[]`
Aplica normalización Min-Max sobre ciclomática, fan-in y churn, pondera con $0.35 / 0.35 / 0.30$ y multiplica por $(1 + 0.20 \cdot testGap)$.

#### `assignTiers(scores: ModuleScore[]): TieredModule[]`
Ordena de forma descendente y determinista los módulos por puntaje y asigna los niveles `profundo` (~15%), `estandar` (~35%) y `ligero` (~50%).

---

## 3. Ejemplo de Integración de Extremo a Extremo (Listo para Producción)

El siguiente script muestra cómo consumir la librería completa para puntuar un proyecto:

```typescript
import {
  discoverModules,
  computeCyclomaticComplexity,
  computeFanIn,
  computeChurn,
  computeTestCoverageGap,
  computeCompositeScores,
  assignTiers,
  type ModuleSignals,
} from "forge614-atlas";

function analyzeRepository(repoPath: string) {
  console.log(`[1/5] Descubriendo módulos en: ${repoPath}`);
  const modules = discoverModules(repoPath);

  if (modules.length === 0) {
    console.warn("No se encontraron módulos de código fuente.");
    return [];
  }

  console.log(`[2/5] Extrayendo señales estáticas del código...`);
  const cyclomaticMap = computeCyclomaticComplexity(modules);
  const fanInMap = computeFanIn(modules);
  const churnMap = computeChurn(repoPath, modules);
  const testGapMap = computeTestCoverageGap(modules);

  console.log(`[3/5] Consolidando señales por módulo...`);
  const signals: ModuleSignals[] = modules.map(m => ({
    name: m.name,
    cyclomatic: cyclomaticMap.get(m.name) ?? 0,
    fanIn: fanInMap.get(m.name) ?? 0,
    churn: churnMap.get(m.name) ?? 0,
    testGap: testGapMap.get(m.name) ?? 0,
  }));

  console.log(`[4/5] Calculando puntaje compuesto ponderado...`);
  const scores = computeCompositeScores(signals);

  console.log(`[5/5] Asignando niveles por percentiles...`);
  const tieredModules = assignTiers(scores);

  console.table(
    tieredModules.map(m => ({
      Módulo: m.name,
      Puntaje: m.score.toFixed(4),
      Nivel: m.tier.toUpperCase(),
    }))
  );

  return tieredModules;
}
```
