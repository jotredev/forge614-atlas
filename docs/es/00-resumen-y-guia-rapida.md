# 00. Resumen Ejecutivo y Guía Rápida

> **Documento Oficial de Referencia Técnica — Ecosistema Forge614**  
> **Proyecto:** Forge614 Atlas (Orquestador de Contextualización Profunda)  
> **Componente:** Plan 1/5 — Motor Determinista de Puntuación de Complejidad (`src/modules/scoring/`)  
> **Rama:** `atlas/plan1-complexity-scoring` (17 commits sobre `main`)  
> **Entorno:** Bun >= 1.3.8 | TypeScript 5.9.3 | Sin llamadas a red ni modelos de IA en esta fase  
> **Verificación:** 26 pruebas pasando (0 fallas, 46 aserciones en 285 ms) | Verificación de tipos limpia (`tsc --noEmit`)  
> **Traducción hermana:** [00 (EN). Executive Summary and Quickstart](../en/00-summary-and-quickstart.md)

---

## 1. ¿Qué es Forge614 Atlas?

**Forge614 Atlas** es el orquestador del ecosistema Forge614 cuya misión es **contextualizar al 100% un repositorio de código** —recorriendo cada módulo y archivo del proyecto— utilizando herramientas de inteligencia artificial ya instaladas en la máquina del usuario (como Claude Code o OpenAI Codex), y depositar todo ese conocimiento estructurado en **`forge614-engram`** (el sistema de memoria personal local). De este modo, cualquier asistente futuro que trabaje en el proyecto puede consultar la memoria en milisegundos mediante el protocolo estándar MCP (*Model Context Protocol* o Protocolo de Contexto de Modelo) sin tener que releer ni gastar tokens analizando todo el repositorio desde cero.

### ¿Qué se construyó en este Plan 1/5?

Antes de enviar agentes de inteligencia artificial a inspeccionar un proyecto, es indispensable saber **qué partes del código son críticas y cuáles son simples**. Enviar el modelo de IA más potente y costoso a leer archivos de configuración o tipos básicos es un desperdicio enorme de recursos; al mismo tiempo, asignar un modelo pequeño y veloz a un motor financiero o de autenticación con decenas de bifurcaciones lógicas provocaría errores graves de comprensión.

En el **Plan 1 de 5**, se construyó la **librería determinista de puntuación de complejidad** (`src/modules/scoring/`), la cual:
1. **Analiza el código sin usar IA ni gastar un solo centavo (<span color="green">$0.00 en tokens</span>):** Todo el cálculo se realiza localmente mediante inspección estática del árbol sintáctico del código (AST), métricas de Git y dependencias de archivos.
2. **Asigna a cada módulo un puntaje compuesto:** Combina complejidad ciclomática (ramificaciones lógicas), centralidad *fan-in* (cuántos otros módulos dependen de él), volatilidad histórica (*churn* de Git) y brecha de pruebas unitarias.
3. **Distribuye los módulos en tres niveles de profundidad:**
   - **Profundo (~15% superior):** El núcleo crítico del repositorio (ej. autenticación, pagos, algoritmos centrales).
   - **Estándar (~35% intermedio):** La lógica de negocio habitual y componentes de control.
   - **Ligero (~50% inferior):** Configuración, tipos, componentes visuales pasivos y utilidades sencillas.

Esta clasificación será la señal que Atlas utilizará en planes posteriores para elegir qué modelo de IA y qué nivel de razonamiento despachar a cada mandadero (*subagent* o subagente autónomo).

---

## 2. La Analogía Maestra: El Perito Tasador y el Triage Hospitalario

Imagina que un equipo de cirujanos e inspectores de emergencias llega a una zona de desastre o a un hospital de alta especialidad:

1. **El Perito en Recepción (Descubrimiento y Puntuación Determinista):**
   Antes de llamar a los médicos especialistas más caros, una enfermera de triage o perito realiza una evaluación rápida, fría y metódica con un cronómetro y un tensiómetro. No opina con intuición; mide signos vitales objetivos: presión arterial, ritmo cardíaco y antecedentes. En Atlas, este perito es el **motor de puntuación de complejidad**: cuenta ramificaciones lógicas (presión), dependencias de otros módulos (órganos vitales conectados), cambios recientes en Git (heridas abiertas recientes) y ausencia de pruebas (defensas inmunológicas bajas).

2. **La Sala de Triage (Clasificación en Tres Niveles):**
   - **Cuidados Intensivos / Nivel Profundo (~15%):** Casos críticos con alta complejidad y dependencias masivas. Requieren al jefe de cirugía (el modelo de IA más capaz, como Opus o Codex Sol) con atención minuciosa.
   - **Pabellón General / Nivel Estándar (~35%):** Pacientes estables con lógica de negocio regular. Son atendidos por médicos residentes experimentados (modelos intermedios, como Sonnet o Codex Terra).
   - **Atención Ambulatoria / Nivel Ligero (~50%):** Curaciones menores, recetas y revisiones rutinarias (tipos, estilos, archivos de arranque). Los atiende personal de apoyo veloz (modelos ligeros y económicos, como Haiku o Codex Luna).

3. **La Ficha Clínica Central (Engram):**
   Todo lo que los médicos dictaminan se archiva de inmediato en una ficha clínica unificada (`forge614-engram`). Si se acaba el turno (se agota la cuota de la suscripción de IA), el hospital no olvida nada; el siguiente turno retoma la labor leyendo exactamente lo que ya fue diagnosticado.

---

## 3. Requisitos del Sistema y Entorno de Ejecución

Para compilar, ejecutar y verificar el motor de puntuación de Atlas:

| Requisito | Versión Mínima | Propósito |
|---|---|---|
| **Bun** | `>= 1.3.8` | Entorno de ejecución rápido (*runtime*), gestor de paquetes y ejecutor de pruebas (`bun test`). |
| **Git** | Disponible en `$PATH` | Obligatorio para calcular la volatilidad histórica de archivos (`computeChurn` mediante `git log`). |
| **TypeScript** | `5.9.3` (fijado) | Proporciona la API del compilador (`typescript`) para analizar el árbol de sintaxis abstracta (*AST*) sin requerir compilación a JavaScript. |
| **Arquitectura SO** | macOS / Linux / Windows | Totalmente multiplataforma sin enlaces nativos C/C++ en esta etapa. |

---

## 4. Guía Rápida de Instalación y Comprobación

### Paso 1: Clonar y situarse en la rama de trabajo

```bash
cd /Users/jorgeetrejoo/Desktop/forge614-atlas
git status
# Confirmar que te encuentras en: atlas/plan1-complexity-scoring
```

### Paso 2: Instalar dependencias congeladas

El proyecto utiliza dependencias fijadas en `package.json` y bloqueadas en `bun.lock`:

```bash
bun install --frozen-lockfile
```

### Paso 3: Ejecutar la suite de pruebas unitarias

El conjunto de pruebas valida el descubrimiento, métricas de AST, resolución de rutas de importación, historial de Git, cálculo ponderado y asignación por percentiles:

```bash
bun test
```

**Salida esperada:**
```text
bun test v1.3.8
...
 26 pass
 0 fail
 46 expect() calls
Ran 26 tests across 8 files. [~285ms]
```

### Paso 4: Validar la integridad de tipos (Typecheck estricto)

```bash
bun run typecheck
```

*(El comando ejecuta `tsc --noEmit` y debe finalizar con código 0 y sin ninguna advertencia o error de tipos).*

---

## 5. Estructura de Archivos del Componente

```text
forge614-atlas/
├── package.json                    # Manifiesto del proyecto (exporta ./src/index.ts)
├── tsconfig.json                   # Configuración estricta de TypeScript en modo ESNext
├── bun.lock                        # Archivo de bloqueo reproducible
├── .gitignore                      # Exclusión de dist, node_modules, .forge614 y temporales
├── src/
│   ├── index.ts                    # Superficie pública exportada de la librería
│   └── modules/
│       └── scoring/                # Monolito modular de puntuación de complejidad
│           ├── discovery.ts        # Descubrimiento de módulos y exclusión de carpetas
│           ├── discovery.test.ts   # Pruebas de descubrimiento y orden alfabético
│           ├── cyclomatic.ts       # Complejidad ciclomática mediante AST de TypeScript
│           ├── cyclomatic.test.ts  # Pruebas de detección de ramas (if/switch/loops/operadores)
│           ├── fan-in.ts           # Centralidad de dependencias entre módulos
│           ├── fan-in.test.ts      # Pruebas de conteo de módulos distintos y exclusión de tests
│           ├── churn.ts            # Frecuencia de cambio histórico vía git log
│           ├── churn.test.ts       # Pruebas de conteo de cambios y soporte UTF-8 sin escape
│           ├── test-coverage-gap.ts# Proporción de archivos fuente sin prueba hermana
│           ├── test-coverage-gap.test.ts # Pruebas de cálculo de brecha de pruebas
│           ├── composite-score.ts  # Normalización min-max, pesos y modificador de cobertura
│           ├── composite-score.test.ts # Pruebas de ordenación relativa y pruebas de balance
│           ├── tiers.ts            # Clasificación en niveles por percentiles (15% / 35% / 50%)
│           ├── tiers.test.ts       # Pruebas de asignación y desempate alfabético
│           └── scaffold.test.ts    # Prueba de sanidad del arnés de pruebas
```

---

## 6. Índice de Documentación Técnica

La documentación del proyecto sigue una indexación secuencial estricta de dos dígitos tanto en el repositorio como en Notion:

| Índice | Título en Español | English Translation | Contenido Principal |
|:---:|---|---|---|
| **00** | [Resumen y Guía Rápida](00-resumen-y-guia-rapida.md) | [Summary & Quickstart](../en/00-summary-and-quickstart.md) | Propósito global, analogía maestra, requisitos y validación rápida. |
| **01** | [Alcance y Diseño del Orquestador](01-alcance-y-diseno-del-orquestador.md) | [Scope & Orchestrator Design](../en/01-scope-and-orchestrator-design.md) | Visión completa de Atlas, relación con Engram/Shell, límites de costos y razonamiento. |
| **02** | [Arquitectura del Motor de Puntuación](02-arquitectura-motor-puntuacion.md) | [Scoring Engine Architecture](../en/02-scoring-engine-architecture.md) | Diseño del pipeline determinista, monólito modular y flujo de datos sin IA. |
| **03** | [Señales, Métricas y Fórmulas](03-senales-metricas-y-formulas.md) | [Signals, Metrics & Formulas](../en/03-signals-metrics-and-formulas.md) | Explicación matemática y de código de las 5 señales, AST de TypeScript y normalización. |
| **04** | [Clasificación de Niveles y Percentiles](04-clasificacion-niveles-y-percentiles.md) | [Tier Classification & Percentiles](../en/04-tier-classification-and-percentiles.md) | Asignación de niveles Profundo/Estándar/Ligero, percentiles adaptativos y desempate determinista. |
| **05** | [Proceso SDD y Catálogo de Defectos](05-proceso-sdd-y-catalogo-defectos.md) | [SDD Process & Defect Catalog](../en/05-proceso-sdd-y-catalogo-defectos.md) | Historial de 8 tareas con subagentes, 17 commits, los 5 defectos corregidos y 2 decisiones diferidas. |
| **06** | [Referencia de API Pública en TypeScript](06-referencia-api-typescript.md) | [TypeScript API Reference](../en/06-referencia-api-typescript.md) | Firmas de tipos, interfaces de entrada/salida y código de integración de ejemplo. |
| **07** | [Estructura del Proyecto y Código Fuente](07-estructura-codigo-linea-por-linea.md) | [Project Structure & Source Code](../en/07-project-structure-documented-source-code.md) | Auditoría exhaustiva de los 19 archivos con código completo y análisis línea por línea. |
