# 🗺️ Forge614 Atlas

> **Orquestador de Contextualización Profunda para el Ecosistema Forge614**  
> *Deep Contextualization Orchestrator for the Forge614 Ecosystem*

[![CI / Tests](https://img.shields.io/badge/tests-26%20passing-brightgreen)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue)](#)
[![Bun](https://img.shields.io/badge/Bun-%3E%3D1.3.8-black)](#)
[![License](https://img.shields.io/badge/license-Private-red)](#)

---

## 🇪🇸 Descripción General (Español)

**Forge614 Atlas** es el orquestador del ecosistema Forge614 encargado de contextualizar un repositorio de código al 100% —línea por línea, módulo por módulo— empleando las herramientas de inteligencia artificial ya instaladas en la máquina del usuario (Claude Code, OpenAI Codex) en modo no interactivo, y depositando todo ese conocimiento estructurado en **`forge614-engram`** (memoria personal local en SQLite FTS5).

### Estado Actual: Plan 1/5 Completado
Se ha completado e integrado el **motor determinista de puntuación de complejidad** (`src/modules/scoring/`):
- **Cero costo de IA:** Evaluación matemática puramente estática sin llamadas a modelos ni consumo de tokens.
- **Señales estructurales:** Combina complejidad ciclomática de McCabe (AST de TypeScript), centralidad *fan-in* de dependencias relativas, volatilidad histórica (*churn* de Git) y brecha de pruebas unitarias hermanas.
- **Clasificación por percentiles:** Agrupa los módulos en tres niveles de atención operativa: **Profundo (~15%)**, **Estándar (~35%)** y **Ligero (~50%)**.
- **Superficie verificada:** 26 pruebas pasando, 0 fallos y chequeo de tipos limpio (`tsc --noEmit`).

---

## 🇬🇧 Overview (English)

**Forge614 Atlas** is the deep contextualization orchestrator for the Forge614 ecosystem. It is designed to comprehend 100% of a target codebase —traversing every module and file— using third-party AI coding CLIs already authenticated on the user's computer (Claude Code, OpenAI Codex) in headless mode, and saving that structured understanding into **`forge614-engram`** (local personal memory powered by SQLite FTS5).

### Current Status: Plan 1/5 Completed
The **deterministic, AI-free complexity scoring engine** (`src/modules/scoring/`) is fully implemented and tested:
- **Zero AI cost:** Purely static, analytical calculation without network or token overhead.
- **Structural signals:** Evaluates McCabe cyclomatic complexity (TypeScript compiler AST), relative dependency fan-in centrality, historical commit churn (Git log), and sibling unit test coverage gaps.
- **Percentile tiers:** Classifies modules into **Deep (~15%)**, **Standard (~35%)**, and **Light (~50%)**.
- **Verified quality:** 26 passing tests, 0 failures, and clean typecheck (`tsc --noEmit`).

---

## 🚀 Inicio Rápido / Quickstart

```bash
# 1. Instalar dependencias congeladas / Install locked dependencies
bun install --frozen-lockfile

# 2. Ejecutar la suite de pruebas / Run test suite
bun test

# 3. Comprobar tipos estáticos / Verify static types
bun run typecheck
```

---

## 📚 Documentación / Documentation

Toda la documentación técnica está disponible en pares bilingües e indexados secuencialmente:

- 🇪🇸 **[Documentación en Español](docs/es/00-resumen-y-guia-rapida.md)**:
  - `00.` [Resumen y Guía Rápida](docs/es/00-resumen-y-guia-rapida.md)
  - `01.` [Alcance y Diseño del Orquestador](docs/es/01-alcance-y-diseno-del-orquestador.md)
  - `02.` [Arquitectura del Motor de Puntuación](docs/es/02-arquitectura-motor-puntuacion.md)
  - `03.` [Señales, Métricas y Fórmulas](docs/es/03-senales-metricas-y-formulas.md)
  - `04.` [Clasificación de Niveles y Percentiles](docs/es/04-clasificacion-niveles-y-percentiles.md)
  - `05.` [Proceso SDD y Catálogo de Defectos](docs/es/05-proceso-sdd-y-catalogo-defectos.md)
  - `06.` [Referencia de API en TypeScript](docs/es/06-referencia-api-typescript.md)
  - `07.` [Estructura y Código Fuente Línea por Línea](docs/es/07-estructura-codigo-linea-por-linea.md)

- 🇬🇧 **[English Documentation](docs/en/00-summary-and-quickstart.md)**:
  - `00.` [Summary & Quickstart](docs/en/00-summary-and-quickstart.md)
  - `01.` [Scope & Orchestrator Design](docs/en/01-scope-and-orchestrator-design.md)
  - `02.` [Scoring Engine Architecture](docs/en/02-scoring-engine-architecture.md)
  - `03.` [Signals, Metrics & Formulas](docs/en/03-signals-metrics-and-formulas.md)
  - `04.` [Tier Classification & Percentiles](docs/en/04-tier-classification-and-percentiles.md)
  - `05.` [SDD Process & Defect Catalog](docs/en/05-sdd-process-and-defect-catalog.md)
  - `06.` [TypeScript API Reference](docs/en/06-typescript-api-reference.md)
  - `07.` [Project Structure & Source Code Line-by-Line](docs/en/07-project-structure-documented-source-code.md)
