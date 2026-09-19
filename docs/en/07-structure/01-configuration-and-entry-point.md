# 07.01 (EN) Environment Configuration and Entry Point

> **Architecture and Code Reference — Forge614 Atlas Ecosystem**  
> **Scope:** `package.json`, `tsconfig.json`, `.gitignore`, `src/index.ts`  
> **Sister Translation:** [07.01 Configuración del Entorno y Punto de Entrada](../../es/07-estructura/01-configuracion-y-punto-entrada.md)

---

## 1. Architectural Rationale

Forge614 Atlas is engineered as a standalone, deterministic library within the Forge614 ecosystem. To guarantee strict parity across local workstations, CI/CD runners, and integrations with `forge614-engram` and `forge614-shell`, the runtime is strictly locked to **Bun >= 1.3.8** and strictly compiled under **TypeScript 5.9.3**.

### Real-World Analogy
> It is like the cargo manifest and customs checkpoint of a merchant vessel: before containers (modules) are inspected by complexity cranes, the manifest (`package.json`) and safety protocols (`tsconfig.json`) dictate exact dimensions, weights, and hermetic seals without exception.

---

## 2. Documented Source Code

### 2.1 `package.json`

```json
{
  // Formal package identifier within the Forge614 monorepo
  "name": "forge614-atlas",
  // Initial semantic version corresponding to completed Plan 1
  "version": "0.1.0",
  // Prevents accidental publishing to public npm registries
  "private": true,
  // Enforces native ECMAScript Modules (ESM) for import/export
  "type": "module",
  // Formal architectural description (literal Spanish as in source package.json)
  "description": "Orquestacion de contextualizacion profunda para el ecosistema Forge614",
  // Public package entry point exposed to external consumers
  "exports": "./src/index.ts",
  "scripts": {
    // Executes the test suite under native Bun runner
    "test": "bun test",
    // Strict static type checking without emitting files to disk
    "typecheck": "tsc --noEmit"
  },
  // Minimum required runtime version
  "engines": {
    "bun": ">=1.3.8"
  },
  // Type definitions for the Bun runtime environment
  "devDependencies": {
    "@types/bun": "latest"
  },
  // Official TypeScript compiler pinned for AST syntax parsing
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
    // Target modern ECMAScript standard
    "target": "ESNext",
    // Native ESM module output
    "module": "ESNext",
    // Modern bundler module resolution compatible with Bun
    "moduleResolution": "bundler",
    // Enforce strict type safety (no implicit any, strict null checks)
    "strict": true,
    // Skip checking declaration files to accelerate build time
    "skipLibCheck": true,
    // Enable interoperability helpers for CommonJS dependencies
    "esModuleInterop": true,
    // Inject Bun global types (Bun.Glob, etc.)
    "types": ["bun-types"]
  }
}
```

---

### 2.3 `.gitignore`

```text
# Third-party dependencies
node_modules/

# Build and compilation outputs
dist/
build/
coverage/
*.tgz

# OS metadata
.DS_Store

# Local environment secrets
.env
.env.*
!.env.example

# Local persistent state for Forge614 Engram
.forge614/

# Temporary SDD planning artifacts
.superpowers/sdd/
```

---

### 2.4 Main Entry Point: `src/index.ts`

```typescript
/**
 * Forge614 Atlas — Deterministic Complexity Scoring Engine (Plan 1/5)
 * 
 * Public library barrel file. Re-exports deterministic primitives for module discovery,
 * Abstract Syntax Tree (AST) analysis, dependency graph centrality (Fan-In), Git commit
 * volatility (Churn UTF-8), test coverage gap, Min-Max normalization, composite scoring,
 * and context budget tier allocation (Tiers).
 */

// 1. Module Discovery and Filesystem Inspection
export { discoverModules, isTestFile } from "./modules/scoring/discovery";
export type { ModuleDescriptor } from "./modules/scoring/discovery";

// 2. McCabe AST Cyclomatic Complexity
export { fileCyclomaticComplexity, computeCyclomaticComplexity } from "./modules/scoring/cyclomatic";

// 3. Fan-In Dependency Centrality
export { computeFanIn } from "./modules/scoring/fan-in";

// 4. Git Historical Volatility (Churn UTF-8)
export { computeChurn } from "./modules/scoring/churn";

// 5. Unit Test Coverage Gap
export { computeTestCoverageGap } from "./modules/scoring/test-coverage-gap";

// 6. Normalized Composite Score and Fragility Modifier
export { computeCompositeScores } from "./modules/scoring/composite-score";
export type { ModuleSignals, ModuleScore } from "./modules/scoring/composite-score";

// 7. Context Budget Tier Allocation
export { assignTiers } from "./modules/scoring/tiers";
export type { Tier, TieredModule } from "./modules/scoring/tiers";
```
