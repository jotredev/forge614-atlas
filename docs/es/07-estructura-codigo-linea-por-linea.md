# 07. Estructura del Código: Línea por Línea

[Traducción hermana: 07 (EN). Project Structure: Documented Source Code](../en/07-project-structure-documented-source-code.md)

Este capítulo documenta el motor de puntuación original (Plan 1) evaluando la complejidad, el riesgo y priorizando los módulos. A continuación se presentan los componentes individuales.

## Archivos y Módulos

| Página | Archivos | Para qué sirve |
|--------|----------|----------------|
| [07.01 Configuración y Punto de Entrada](07-estructura/01-configuracion-y-punto-entrada.md) | `tsconfig.json`, `.gitignore`, `src/index.ts` | Configura reglas de compilación, de Git y agrupa la API exportada de la librería. |
| [07.02 Descubrimiento](07-estructura/02-descubrimiento-discovery.md) | `src/modules/scoring/discovery.ts` | Identifica y agrupa los archivos de código del proyecto en módulos analizables. |
| [07.03 Complejidad Ciclomática](07-estructura/03-complejidad-ciclomatica.md) | `src/modules/scoring/cyclomatic.ts` | Mide la complejidad y cantidad de rutas (if, bucles) dentro del código. |
| [07.04 Fan-In](07-estructura/04-centralidad-fan-in.md) | `src/modules/scoring/fan-in.ts` | Cuenta cuántos otros módulos dependen (importan) de cada módulo. |
| [07.05 Git Churn](07-estructura/05-volatilidad-git-churn.md) | `src/modules/scoring/churn.ts` | Mide la frecuencia de cambios históricos de un módulo en Git. |
| [07.06 Brecha de Pruebas](07-estructura/06-brecha-cobertura-pruebas.md) | `src/modules/scoring/test-coverage-gap.ts` | Determina la proporción de archivos sin su archivo de prueba asociado. |
| [07.07 Puntuación Compuesta](07-estructura/07-puntuacion-compuesta.md) | `src/modules/scoring/composite-score.ts` | Normaliza y pondera las métricas anteriores en una calificación única. |
| [07.08 Tiers (Niveles)](07-estructura/08-asignacion-niveles-tiers.md) | `src/modules/scoring/tiers.ts` | Distribuye los módulos en tres niveles de análisis según su criticidad. |
| [07.09 Scaffold (Arnés)](07-estructura/09-arnes-pruebas-sanidad.md) | `src/modules/scoring/scaffold.test.ts` | Asegura que el entorno y ejecutor de pruebas funcionan correctamente. |

## El resto del código

Las demás áreas del proyecto se documentan en otros capítulos de este manual:

| Carpeta (`src/`) | Capítulo donde se explica |
|------------------|---------------------------|
| `interfaces/cli` | [Capítulo 06](06-referencia-api-typescript.md) |
| `modules/cli` | [Capítulo 08](08-nucleo-cli-y-plan-de-corrida.md) |
| `modules/memory` | [Capítulo 06](06-referencia-api-typescript.md) |
| `modules/engines-client` | [Capítulo 06](06-referencia-api-typescript.md) |
| `modules/workers-client` | [Capítulo 09](09-despacho-de-subagentes.md) |
| `modules/uninstall` | [Capítulo 11](11-resolucion-de-errores.md) |
| `modules/updater` | [Capítulo 11](11-resolucion-de-errores.md) |
| `modules/forge-home` | [Capítulo 10](10-instalador-y-release.md) |
