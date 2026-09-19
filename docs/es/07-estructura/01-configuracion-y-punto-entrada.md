# 07.01 Configuración del Entorno y Punto de Entrada

> **Documento de Arquitectura y Código — Ecosistema Forge614 Atlas**  
> **Alcance:** `package.json`, `tsconfig.json`, `.gitignore`, `src/index.ts`  
> **Traducción hermana:** [07.01 (EN) Environment Configuration and Entry Point](../../en/07-structure/01-configuration-and-entry-point.md)

---

## 1. Justificación Arquitectónica

Forge614 Atlas está diseñado como una librería autónoma y determinista dentro del ecosistema Forge614. Para garantizar paridad estricta entre desarrollo local, pipelines de CI/CD e integraciones con `forge614-engram` y `forge614-shell`, la configuración del entorno restringe el motor a **Bun >= 1.3.8** y compila exclusivamente en modo estricto de **TypeScript 5.9.3**.

### Analogía del Mundo Real
> Es como el manifiesto de carga y el control aduanero de un barco mercante: antes de que los contenedores (módulos) sean inspeccionados por las grúas de puntuación, el manifiesto (`package.json`) y las reglas de seguridad (`tsconfig.json`) definen exactamente qué estándares de peso, medidas y sellos herméticos deben cumplir sin excepción.

---

## 2. Código Fuente Documentado

### 2.1 `package.json`

```json
{
  // Nombre formal del paquete dentro del monorepositorio Forge614
  "name": "forge614-atlas",
  // Versión semántica inicial correspondiente al Plan 1 completado
  "version": "0.1.0",
  // Previene publicación accidental a registros públicos de npm
  "private": true,
  // Establece ECMAScript Modules (ESM) nativo para import/export
  "type": "module",
  // Descripción formal del propósito arquitectónico
  "description": "Orquestador de contextualizacion profunda para el ecosistema Forge614",
  // Superficie pública formal accesible por paquetes externos
  "exports": "./src/index.ts",
  "scripts": {
    // Ejecución de la suite completa de pruebas unitarias bajo Bun
    "test": "bun test",
    // Chequeo estricto de tipos sin emitir JavaScript en disco
    "typecheck": "tsc --noEmit"
  },
  // Restricción de versión mínima de ejecución del motor Bun
  "engines": {
    "bun": ">=1.3.8"
  },
  // Definiciones de tipos para el entorno de ejecución Bun
  "devDependencies": {
    "@types/bun": "latest"
  },
  // Compilador oficial de TypeScript requerido para el análisis de AST sintáctico
  "dependencies": {
    "typescript": "5.9.3"
  }
}
```

---

### 2.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    // Generar código compatible con las especificaciones ECMAScript más modernas
    "target": "ESNext",
    // Sistema de módulos nativo ECMAScript
    "module": "ESNext",
    // Resolución de módulos optimizada para empaquetadores modernos y Bun
    "moduleResolution": "bundler",
    // Activa todas las comprobaciones estrictas de tipos (sin any implícitos, null checks estrictos)
    "strict": true,
    // Omite el chequeo de archivos de declaración (.d.ts) de librerías externas para acelerar la compilación
    "skipLibCheck": true,
    // Emite código auxiliar para interoperabilidad fluida con librerías CommonJS
    "esModuleInterop": true,
    // Inyecta tipos nativos globales provistos por Bun (Bun.Glob, etc.)
    "types": ["bun-types"]
  }
}
```

---

### 2.3 `.gitignore`

```text
# Dependencias externas instaladas en node_modules
node_modules/

# Salidas de compilación y empaquetado
dist/
build/
coverage/
*.tgz

# Archivos de metadatos del sistema operativo macOS
.DS_Store

# Variables de entorno y secretos locales
.env
.env.*
!.env.example

# Base de datos persistente y estado local de Forge614 Engram
.forge614/

# Artefactos y planes temporales de ejecución SDD
.superpowers/sdd/
```

---

### 2.4 Punto de Entrada Principal: `src/index.ts`

```typescript
/**
 * Forge614 Atlas — Motor Determinista de Puntuación de Complejidad (Plan 1/5)
 * 
 * Barril principal de exportación pública de la librería. Expone las primitivas
 * deterministas para descubrimiento de módulos, análisis de Árbol de Sintaxis Abstracta (AST),
 * grafos de dependencias (Fan-In), historial de versiones Git (Churn), brecha de pruebas unitarias,
 * normalización Min-Max, cálculo de puntaje compuesto y clasificación en niveles de contexto (Tiers).
 */

// 1. Módulo de Descubrimiento e Inspección del Sistema de Archivos
export { discoverModules, isTestFile } from "./modules/scoring/discovery";
export type { ModuleDescriptor } from "./modules/scoring/discovery";

// 2. Módulo de Complejidad Ciclomática (McCabe AST)
export { fileCyclomaticComplexity, computeCyclomaticComplexity } from "./modules/scoring/cyclomatic";

// 3. Módulo de Centralidad de Dependencias Fan-In
export { computeFanIn } from "./modules/scoring/fan-in";

// 4. Módulo de Volatilidad Histórica de Git (Churn UTF-8)
export { computeChurn } from "./modules/scoring/churn";

// 5. Módulo de Brecha de Cobertura de Pruebas Unitarias (Test Coverage Gap)
export { computeTestCoverageGap } from "./modules/scoring/test-coverage-gap";

// 6. Módulo de Puntuación Compuesta Normalizada y Modificador de Riesgo
export { computeCompositeScores } from "./modules/scoring/composite-score";
export type { ModuleSignals, ModuleScore } from "./modules/scoring/composite-score";

// 7. Módulo de Asignación de Niveles de Presupuesto por Percentiles (Tiers)
export { assignTiers } from "./modules/scoring/tiers";
export type { Tier, TieredModule } from "./modules/scoring/tiers";
```
