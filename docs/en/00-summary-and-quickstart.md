# 00 (EN). Executive Summary and Quickstart

> **Official Technical Reference Document — Forge614 Ecosystem**  
> **Project:** Forge614 Atlas (Deep Contextualization Orchestrator)  
> **Component:** Plan 1/5 — Deterministic Complexity Scoring Engine (`src/modules/scoring/`)  
> **Branch:** `atlas/plan1-complexity-scoring` (17 commits ahead of `main`)  
> **Runtime:** Bun >= 1.3.8 | TypeScript 5.9.3 | Zero network calls and zero AI model invocations in this phase  
> **Verification:** 26 passing tests (0 failures, 46 assertions in 285 ms) | Clean static typecheck (`tsc --noEmit`)  
> **Sister translation:** [00. Resumen Ejecutivo y Guía Rápida](../es/00-resumen-y-guia-rapida.md)

---

## 1. What is Forge614 Atlas?

**Forge614 Atlas** is the orchestrator of the Forge614 ecosystem tasked with **contextualizing a target repository to 100%** —traversing every folder, module, and file in the codebase— using third-party AI coding tools already installed and authenticated on the user's workstation (such as Claude Code or OpenAI Codex), and persisting that structured understanding into **`forge614-engram`** (the local personal memory engine). Consequently, any future AI assistant working in any new context window can retrieve that knowledge in milliseconds via the standard Model Context Protocol (MCP) without needing to re-read or burn tokens ingesting the entire repository from scratch.

### What Was Built in Plan 1 of 5?

Before dispatching autonomous AI workers (*subagents* or worker processes) to inspect code, the orchestrator must know **which parts of the repository are highly intricate and which are trivial**. Assigning the most capable and expensive AI model to read basic configuration files or presentation types is a massive waste of resources; conversely, dispatching a lightweight, fast model to audit a financial ledger or authentication engine with dozens of logical branches leads to severe comprehension failures.

In **Plan 1 of 5**, we engineered the **deterministic, AI-free complexity scoring library** (`src/modules/scoring/`), which:
1. **Analyzes code without AI calls or token costs (<span color="green">$0.00 token overhead</span>):** All computations are performed locally through Abstract Syntax Tree (AST) inspection via TypeScript compiler APIs, Git revision history, and file dependency resolution.
2. **Assigns every module a composite weighted score:** Blends cyclomatic complexity (logical branches), fan-in centrality (how many other modules depend on it), historical volatility (Git commit churn), and test coverage gaps.
3. **Classifies modules into three percentile-based tiers:**
   - **Deep / Profundo (~top 15%):** The core mission-critical engine (e.g., authentication, billing, core algorithms).
   - **Standard / Estándar (~middle 35%):** Normal business logic, domain services, and stateful controllers.
   - **Light / Ligero (~bottom 50%):** Configuration, static types, passive visual components, and simple helpers.

This tiering will serve as the exact signal that Atlas utilizes in subsequent plans to determine which AI model and what reasoning effort level to assign to each subagent.

---

## 2. The Master Analogy: The Lead Surveyor and Hospital Triage

Imagine an emergency medical inspection team arriving at a complex disaster zone or high-acuity medical center:

1. **The Triage Officer (Discovery & Deterministic Scoring):**
   Before summoning the most expensive chief neurosurgeons, a lead triage nurse performs a swift, cold, and methodical evaluation using only objective physical instruments. They do not rely on subjective intuition; they measure objective vital signs: blood pressure, heart rate, and historical risk factors. In Atlas, this triage officer is the **complexity scoring engine**: it counts branch points (blood pressure), incoming module dependencies (connected vital organs), recent Git commit churn (active recent trauma), and missing unit tests (weak immune defenses).

2. **The Triage Wards (Three Percentile Tiers):**
   - **Intensive Care / Deep Tier (~top 15%):** Critical patients with high complexity and extensive structural dependencies. They receive the Chief of Surgery (the most capable AI model, such as Opus or Codex Sol) with deep analytical attention.
   - **General Ward / Standard Tier (~middle 35%):** Stable patients with routine medical needs. They are treated by seasoned attending physicians (intermediate models, such as Sonnet or Codex Terra).
   - **Outpatient Clinic / Light Tier (~bottom 50%):** Routine dressing changes, administrative forms, and basic checkups (types, styles, entry scripts). They are handled rapidly by general staff (fast, economical models, such as Haiku or Codex Luna).

3. **The Central Patient File (Engram):**
   Everything the medical inspectors document is immediately filed into a unified, durable record (`forge614-engram`). If the shift ends or quota runs out, the clinic loses zero progress; the next shift resumes by reading precisely what was already assessed.

---

## 3. System Requirements and Environment

To compile, execute, and verify the Atlas scoring engine:

| Requirement | Minimum Version | Purpose |
|---|---|---|
| **Bun** | `>= 1.3.8` | High-performance runtime, package manager, and test runner (`bun test`). |
| **Git** | Available in `$PATH` | Required to calculate historical file volatility (`computeChurn` via `git log`). |
| **TypeScript** | `5.9.3` (pinned) | Provides the compiler parser API (`typescript`) to inspect Abstract Syntax Trees (*AST*) without full type-checking passes. |
| **Operating System** | macOS / Linux / Windows | Cross-platform pure TypeScript logic without native C/C++ build requirements in this phase. |

---

## 4. Quickstart: Installation and Verification

### Step 1: Navigate to repository and verify branch

```bash
cd /Users/jorgeetrejoo/Desktop/forge614-atlas
git status
# Confirm you are on: atlas/plan1-complexity-scoring
```

### Step 2: Install locked dependencies

The project relies on deterministic dependencies pinned in `package.json` and locked in `bun.lock`:

```bash
bun install --frozen-lockfile
```

### Step 3: Run the automated test suite

The test suite validates module discovery, AST metrics, relative import resolution, Git churn history, weighted score calculations, and percentile sorting:

```bash
bun test
```

**Expected output:**
```text
bun test v1.3.8
...
 26 pass
 0 fail
 46 expect() calls
Ran 26 tests across 8 files. [~285ms]
```

### Step 4: Run strict static typecheck

```bash
bun run typecheck
```

*(Runs `tsc --noEmit` and must complete with exit code 0 and zero type diagnostics).*

---

## 5. Directory and File Layout

```text
forge614-atlas/
├── package.json                    # Project manifest (exports ./src/index.ts)
├── tsconfig.json                   # Strict TypeScript ESNext configuration
├── bun.lock                        # Deterministic lockfile
├── .gitignore                      # Exclusions for dist, node_modules, .forge614, and temp files
├── src/
│   ├── index.ts                    # Public barrel export of scoring library
│   └── modules/
│       └── scoring/                # Feature-based scoring modular monolith
│           ├── discovery.ts        # Module discovery and folder filtering
│           ├── discovery.test.ts   # Tests for module discovery and alphabetical stability
│           ├── cyclomatic.ts       # McCabe cyclomatic complexity via TypeScript AST
│           ├── cyclomatic.test.ts  # Tests for branching logic (if/switch/loops/operators)
│           ├── fan-in.ts           # Inter-module dependency centrality
│           ├── fan-in.test.ts      # Tests for distinct module counts & test exclusions
│           ├── churn.ts            # Historical commit volatility via git log
│           ├── churn.test.ts       # Tests for churn attribution and UTF-8 path safety
│           ├── test-coverage-gap.ts# Ratio of source files lacking sibling tests
│           ├── test-coverage-gap.test.ts # Tests for test gap calculations
│           ├── composite-score.ts  # Min-max normalization, weights & test gap modifier
│           ├── composite-score.test.ts # Tests for relative rankings and balance guarantees
│           ├── tiers.ts            # Percentile tier classification (15% / 35% / 50%)
│           ├── tiers.test.ts       # Tests for tier distribution and deterministic tie-breaking
│           └── scaffold.test.ts    # Sanity check for test runner pipeline
```

---

## 6. Technical Documentation Index

All documentation adheres to strict two-digit sequential numbering across both local files and Notion pages:

| Index | Spanish Title | English Title | Core Topic |
|:---:|---|---|---|
| **00** | [Resumen y Guía Rápida](../es/00-resumen-y-guia-rapida.md) | [Summary & Quickstart](00-summary-and-quickstart.md) | Global purpose, master analogy, requirements, and quick validation. |
| **01** | [Alcance y Diseño del Orquestador](../es/01-alcance-y-diseno-del-orquestador.md) | [Scope & Orchestrator Design](01-scope-and-orchestrator-design.md) | Full Atlas vision, Engram/Shell relationships, reasoning caps, and cost policy. |
| **02** | [Arquitectura del Motor de Puntuación](../es/02-arquitectura-motor-puntuacion.md) | [Scoring Engine Architecture](02-scoring-engine-architecture.md) | Pipeline architecture, modular monolith layout, and AI-free dataflow. |
| **03** | [Señales, Métricas y Fórmulas](../es/03-senales-metricas-y-formulas.md) | [Signals, Metrics & Formulas](03-signals-metrics-and-formulas.md) | Mathematical and AST details of all 5 signals, normalization, and weights. |
| **04** | [Clasificación de Niveles y Percentiles](../es/04-clasificacion-niveles-y-percentiles.md) | [Tier Classification & Percentiles](04-tier-classification-and-percentiles.md) | Deep/Standard/Light distribution, adaptive percentiles, and tie-breaking. |
| **05** | [Proceso SDD y Catálogo de Defectos](../es/05-proceso-sdd-y-catalogo-defectos.md) | [SDD Process & Defect Catalog](05-sdd-process-and-defect-catalog.md) | 8-task subagent workflow, 17 commits, 5 corrected defects, and deferred items. |
| **06** | [Referencia de API Pública en TypeScript](../es/06-referencia-api-typescript.md) | [TypeScript API Reference](06-typescript-api-reference.md) | Type signatures, module interfaces, and production-ready usage examples. |
| **07** | [Estructura del Proyecto y Código Fuente](../es/07-estructura-codigo-linea-por-linea.md) | [Project Structure & Source Code](07-project-structure-documented-source-code.md) | Master index to 9 modular subpages with complete code and line-by-line analysis of all 19 files. |
