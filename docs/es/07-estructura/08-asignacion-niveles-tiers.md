# 07.08 Asignación de Niveles (Tiers)

[Traducción hermana: 07.08 (EN) Tier Allocation](../../en/07-structure/08-tier-allocation.md)

## Para qué sirve

Divide todos los módulos del proyecto en tres niveles de análisis ("profundo", "estándar" o "ligero") según su puntuación compuesta de riesgo (aproximadamente 15 %, 35 % y 50 %). El nivel decide qué modelo analiza cada módulo y el orden en que se despachan (primero los `profundo`); no cambia el texto del análisis que se le pide (`src/modules/scoring/tiers.ts:12-15`). En la vida real, es como el "triage" (la clasificación por gravedad) de un hospital de emergencias, donde se evalúa a todos los pacientes y se manda a los más graves a la sala de operaciones (profundo), a los regulares a una cama (estándar) y a los demás a la sala de espera (ligero), que también se atiende, con un modelo más barato y al final.

## Archivos

- `src/modules/scoring/tiers.ts`: Ordena los módulos por puntuación de riesgo y los clasifica en tres niveles según su posición en esa lista (aproximadamente 15 %, 35 % y 50 %); no elige el modelo: eso lo hace `resolveTaskConfig` con su tabla (`src/modules/cli/task-config.ts:20-33`) ([Ficha en el Capítulo 06](../06-referencia-api-typescript.md)).

## Cómo funciona

1. `assignTiers` recibe la lista de puntuaciones compuestas (`src/modules/scoring/tiers.ts:53`).
2. Ordena una copia de la lista de mayor a menor puntuación. Si dos módulos tienen el mismo puntaje, desempata alfabéticamente por nombre (`src/modules/scoring/tiers.ts:56-62`).
3. Calcula el número de módulos que caben en el nivel `profundo` redondeando el 15% del total. Usa `Math.max(1, ...)` para asegurar que, si hay código, siempre haya al menos un módulo en este nivel (`src/modules/scoring/tiers.ts:68`).
4. Calcula cuántos módulos van al nivel `estandar` redondeando el 35% del total (`src/modules/scoring/tiers.ts:69`).
5. Itera sobre la lista ya ordenada y asigna `"profundo"` a los primeros módulos (hasta llegar al `deepCount`), luego `"estandar"` (hasta `deepCount + standardCount`), y `"ligero"` al resto (`src/modules/scoring/tiers.ts:72-87`).

## Casos borde y decisiones

- Proyectos pequeños: Con 1, 2 o 3 módulos el 15 % redondeado daría 0 (con 4 ya da 1); la garantía del nivel profundo (`Math.max(1, ...)`) asegura que siempre haya al menos un módulo `profundo`, el de mayor puntuación, al que le toca el modelo más capaz de la tabla (`src/modules/scoring/tiers.ts:68`, `src/modules/cli/task-config.ts:29-32`).
- Estabilidad determinista: El desempate alfabético garantiza que, si las puntuaciones son idénticas, las corridas sucesivas den siempre las mismas asignaciones y el plan no cambie entre una corrida y otra con los mismos datos (`src/modules/scoring/tiers.ts:56-62`).

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| `splits 20 modules into roughly 50/35/15 by descending score` | Verifica que 20 módulos con puntuaciones de 20 a 1 se repartan en 3 `profundo`, 7 `estandar` y 10 `ligero`, y que los `profundo` sean `module-0`, `module-1` y `module-2`; no revisa cuáles son `estandar` ni `ligero`. |
| `a project with a single module still gets a tier, never crashes` | Asegura que un proyecto con un solo módulo (`only`) recibe el nivel `profundo` (el 15 % de 1 redondea a 0 y `Math.max(1, …)` lo corrige) y no se queda sin nivel. |
| `ties on score break deterministically by name, regardless of input order` | Comprueba que el desempate alfabético produce el mismo orden de asignación sin importar el orden en que se recibieron los módulos. |

## Dónde se usa

- `assignTiers`: Llamado por `buildRunPlan` en `src/modules/cli/build-run-plan.ts:76` y reexportado en `src/index.ts:30`.
