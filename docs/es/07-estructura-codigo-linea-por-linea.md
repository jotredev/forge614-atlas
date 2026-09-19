# 07. Estructura del Proyecto y Código Fuente Documentado

> **Documento Oficial de Referencia Técnica — Ecosistema Forge614**  
> **Proyecto:** Forge614 Atlas (Orquestador de Contextualización Profunda)  
> **Componente:** Plan 1/5 — Motor Determinista de Puntuación de Complejidad  
> **Alcance:** Índice y navegación hacia las 9 subpáginas modulares de código fuente documentado línea por línea  
> **Traducción hermana:** [07 (EN). Project Structure and Documented Source Code](../en/07-project-structure-documented-source-code.md)

---

## 1. Directorio Maestro de Subpáginas Modulares

> [!IMPORTANT]
> **Aclaración Arquitectónica de Estructura:** Este documento **ya no es un archivo monolítico único** con el volcado plano de todo el código del proyecto. Funciona formalmente como el **índice maestro y punto de navegación hacia 9 subpáginas modulares (07.01 a 07.09)**, donde cada subpágina aloja su propio código fuente integral documentado línea por línea, justificación teórica, explicaciones del algoritmo y suite de pruebas automatizadas aisladas.

Para garantizar máxima legibilidad, profundidad pedagógica y accesibilidad arquitectónica, la documentación detallada del código fuente se encuentra desglosada en las siguientes subpáginas:

| Subpágina | Archivos Cubiertos | Propósito Arquitectónico | Algoritmo / Estándar Clave |
| :--- | :--- | :--- | :--- |
| [**07.01 Configuración y Punto de Entrada**](07-estructura/01-configuracion-y-punto-entrada.md) | `package.json`, `tsconfig.json`, `.gitignore`, `src/index.ts` | Configuración del entorno de ejecución, compilación estricta y barril de exportación pública. | Bun >= 1.3.8, ESM Nativo, TS 5.9.3 Strict |
| [**07.02 Descubrimiento de Módulos (Discovery)**](07-estructura/02-descubrimiento-discovery.md) | `discovery.ts`, `discovery.test.ts` | Escaneo determinista en disco de carpetas de primer nivel y archivos de código fuente. | Filtro $O(1)$ `EXCLUDED_DIRS`, `localeCompare` lexicográfico |
| [**07.03 Complejidad Ciclomática AST (Cyclomatic)**](07-estructura/03-complejidad-ciclomatica.md) | `cyclomatic.ts`, `cyclomatic.test.ts` | Medición de bifurcaciones del flujo de ejecución mediante AST de TypeScript. | Fórmula de McCabe (1976), omisión de `default:`, operadores `&&`, `\|\|`, `??` |
| [**07.04 Centralidad Fan-In de Dependencias**](07-estructura/04-centralidad-fan-in.md) | `fan-in.ts`, `fan-in.test.ts` | Cálculo del grado de entrada en el grafo de dependencias entre módulos. | Deduplicación por `Set` (arista módulo a módulo), frontera `modulePath + sep` |
| [**07.05 Volatilidad Histórica Git (Churn)**](07-estructura/05-volatilidad-git-churn.md) | `churn.ts`, `churn.test.ts` | Frecuencia de modificación de archivos en el historial de commits de Git. | `git -c core.quotepath=false` (UTF-8 puro en español), frontera estricta |
| [**07.06 Brecha de Cobertura de Pruebas (Test Gap)**](07-estructura/06-brecha-cobertura-pruebas.md) | `test-coverage-gap.ts`, `test-coverage-gap.test.ts` | Detección de archivos productivos sin pruebas unitarias hermanas (*sibling tests*). | Fórmula $1 - (|withTests| / |sourceFiles|)$, multiplicador $+20\%$ |
| [**07.07 Puntuación Compuesta Normalizada**](07-estructura/07-puntuacion-compuesta.md) | `composite-score.ts`, `composite-score.test.ts` | Integración balanceada de las tres señales cuantitativas y modificador de riesgo. | Normalización Min-Max, pesos 35/35/30, protección de varianza cero |
| [**07.08 Asignación de Niveles de Presupuesto (Tiers)**](07-estructura/08-asignacion-niveles-tiers.md) | `tiers.ts`, `tiers.test.ts` | Asignación percentil de módulos a niveles de profundidad de contexto. | Top 15% Profundo (`Math.max(1, ...)`), 35% Estándar, 50% Ligero |
| [**07.09 Arnés de Pruebas y Sanidad (Scaffold)**](07-estructura/09-arnes-pruebas-sanidad.md) | `scaffold.test.ts` | Verificación de operatividad del arnés de pruebas de Bun. | Verificación elemental `1 + 1 === 2`, validación de runtime Bun |

---

## 2. Árbol Integral de Archivos del Proyecto

```text
forge614-atlas/
├── package.json                         # Manifiesto npm y configuración de scripts
├── tsconfig.json                        # Configuración del compilador TypeScript para Bun
├── .gitignore                           # Exclusiones de Git
├── src/
│   ├── index.ts                         # Barril de exportación pública de la librería
│   └── modules/
│       └── scoring/                     # Motor modular determinista de puntuación
│           ├── discovery.ts             # Descubrimiento y filtrado de módulos en disco
│           ├── discovery.test.ts        # Batería de pruebas de descubrimiento y orden
│           ├── cyclomatic.ts            # Complejidad ciclomática mediante AST de TypeScript
│           ├── cyclomatic.test.ts       # Batería de pruebas de AST y exclusión de tests
│           ├── fan-in.ts                # Centralidad de dependencias entre módulos distintos
│           ├── fan-in.test.ts           # Batería de pruebas de imports relativos y unicidad
│           ├── churn.ts                 # Volatilidad histórica de cambios en Git (UTF-8)
│           ├── churn.test.ts            # Batería de pruebas de Git log y nombres en español
│           ├── test-coverage-gap.ts     # Cálculo de brecha de pruebas unitarias hermanas
│           ├── test-coverage-gap.test.ts# Batería de pruebas de detección de archivos .test
│           ├── composite-score.ts       # Normalización Min-Max, pesos y modificador
│           ├── composite-score.test.ts  # Batería de pruebas de balance y no distorsión
│           ├── tiers.ts                 # Clasificación en niveles por percentiles
│           ├── tiers.test.ts            # Batería de pruebas de percentiles y desempate
│           └── scaffold.test.ts         # Prueba de sanidad del arnés de pruebas Bun
```

---

## 3. Matriz de Cobertura y Métricas de Calidad

| Módulo | Líneas Fuente | Líneas Tests | Aserciones | Cobertura de Ramas | Estado de Verificación |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `discovery.ts` | ~110 | ~80 | 5 tests | 100% | Pasando (Verificado con Bun) |
| `cyclomatic.ts` | ~120 | ~90 | 4 tests | 100% | Pasando (Verificado con Bun) |
| `fan-in.ts` | ~150 | ~150 | 5 tests | 100% | Pasando (Verificado con Bun) |
| `churn.ts` | ~85 | ~110 | 3 tests | 100% | Pasando (Verificado con Bun) |
| `test-coverage-gap.ts` | ~75 | ~60 | 3 tests | 100% | Pasando (Verificado con Bun) |
| `composite-score.ts` | ~85 | ~30 | 2 tests | 100% | Pasando (Verificado con Bun) |
| `tiers.ts` | ~75 | ~65 | 3 tests | 100% | Pasando (Verificado con Bun) |
| `scaffold.test.ts` | — | ~15 | 1 test | 100% | Pasando (Verificado con Bun) |
| **Total Acumulado** | **~700** | **~600** | **26 tests (46 aserciones)** | **100%** | **Suite Completa Pasando (0 fallos)** |
