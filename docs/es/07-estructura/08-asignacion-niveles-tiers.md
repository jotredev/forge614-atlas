# 07.08 Asignación de Niveles de Presupuesto (Tiers)

[Traducción hermana: 07.08 (EN) Tier Allocation](../../en/07-structure/08-tier-allocation.md)

## Para qué sirve

Divide todos los módulos del proyecto en tres niveles de análisis ("profundo", "estándar" o "ligero") según su puntuación compuesta de riesgo, asignando más poder de modelo y más tiempo a los más difíciles. En la vida real, es como el "triage" de un hospital de emergencias, donde se evalúa a todos los pacientes y se manda a los más graves a la sala de operaciones (profundo), a los regulares a una cama (estándar) y a los demás a la sala de espera (ligero).

## Archivos

- `src/modules/scoring/tiers.ts`: Ordena los módulos por puntuación de riesgo y los clasifica en percentiles fijos, determinando qué presupuesto de inteligencia artificial se gastará en ellos ([Ficha en el Capítulo 06](../06-referencia-api-typescript.md)).

## Cómo funciona

1. `assignTiers` recibe la lista de puntuaciones compuestas (`src/modules/scoring/tiers.ts:53`).
2. Ordena una copia de la lista de mayor a menor puntuación. Si dos módulos tienen el mismo puntaje, desempata alfabéticamente por nombre (`src/modules/scoring/tiers.ts:56-62`).
3. Calcula el número de módulos que caben en el nivel `profundo` redondeando el 15% del total. Usa `Math.max(1, ...)` para asegurar que, si hay código, siempre haya al menos un módulo en este nivel (`src/modules/scoring/tiers.ts:68`).
4. Calcula cuántos módulos van al nivel `estandar` redondeando el 35% del total (`src/modules/scoring/tiers.ts:69`).
5. Itera sobre la lista ya ordenada y asigna `"profundo"` a los primeros módulos (hasta llegar al `deepCount`), luego `"estandar"` (hasta `deepCount + standardCount`), y `"ligero"` al resto (`src/modules/scoring/tiers.ts:72-84`).

## Casos borde y decisiones

- Proyectos pequeños: Si un proyecto tiene solo 2 o 3 módulos, el 15% daría 0; la garantía del nivel profundo (`Math.max(1)`) asegura que siempre se elija al menos el módulo más complejo para usar el modelo más avanzado (`src/modules/scoring/tiers.ts:46`).
- Estabilidad determinista: El desempate alfabético garantiza que si las puntuaciones son idénticas, las ejecuciones sucesivas siempre resulten en las mismas asignaciones, evitando fluctuaciones ("flakiness") en el pipeline (`src/modules/scoring/tiers.ts:42-43`).

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| `splits 20 modules into roughly 50/35/15 by descending score` | Verifica que un conjunto de 20 módulos se divida correctamente en los tres niveles de acuerdo a los porcentajes establecidos. |
| `a project with a single module still gets a tier, never crashes` | Asegura que la garantía de módulo profundo asigne un nivel al único módulo y no provoque errores matemáticos (ej. logaritmos sobre cero). |
| `ties on score break deterministically by name, regardless of input order` | Comprueba que el desempate alfabético produce el mismo orden de asignación sin importar el orden en que se recibieron los módulos. |

## Dónde se usa

- `assignTiers`: Llamado por `buildRunPlan` en `src/modules/cli/build-run-plan.ts:76` y reexportado en `src/index.ts:30`.
