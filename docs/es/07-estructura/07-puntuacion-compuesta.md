# 07.07 Puntuación Compuesta Normalizada

[Traducción hermana: 07.07 (EN) Composite Scoring](../../en/07-structure/07-composite-scoring.md)

## Para qué sirve

Convierte las distintas señales de un módulo (complejidad, fan-in, churn y brecha de pruebas) en una única puntuación de riesgo y necesidad de contexto. Como cada métrica usa escalas distintas (el churn puede llegar a miles, el fan-in rara vez pasa de unas decenas), este paso las estandariza y las pesa. En la vida real, es como calificar a un estudiante con examen, trabajos y participación, pero "a la curva": cada nota se mide contra la mejor y la peor del grupo.

## Archivos

- `src/modules/scoring/composite-score.ts`: Normaliza los valores mediante una fórmula Min-Max, los combina con porcentajes y aplica el recargo por falta de pruebas ([Ficha en el Capítulo 06](../06-referencia-api-typescript.md)).

## Cómo funciona

1. `computeCompositeScores` recibe una lista de objetos `ModuleSignals` (que agrupan los valores de cada módulo) (`src/modules/scoring/composite-score.ts:67`).
2. Extrae las listas de valores de `cyclomatic`, `fanIn` y `churn` y las pasa por la función `normalize` de forma independiente (`src/modules/scoring/composite-score.ts:69-71`).
3. La función `normalize` aplica una escala Min-Max clásica: `(valor - min) / (max - min)`, devolviendo valores entre `0.0` y `1.0` (`src/modules/scoring/composite-score.ts:101-110`).
4. Iterando por cada módulo, calcula una puntuación `base` sumando un `35%` de la complejidad ciclomática normalizada, `35%` del fan-in y `30%` del churn (`src/modules/scoring/composite-score.ts:76-79`).
5. Multiplica el resultado por el factor de riesgo de las pruebas (`testGap`): `base * (1 + 0.2 * signal.testGap)`, agregando hasta un 20% más si no hay pruebas (`src/modules/scoring/composite-score.ts:82`).
6. Devuelve la lista de módulos con su puntuación final, respetando el orden original (`src/modules/scoring/composite-score.ts:84-87`).

## Casos borde y decisiones

- División entre cero: Si todos los módulos tienen exactamente el mismo valor para una señal (el máximo es igual al mínimo), la fórmula Min-Max dividiría entre cero (`0/0`); la función `normalize` detecta esto y devuelve un vector de ceros (`src/modules/scoring/composite-score.ts:105-107`).
- Ponderación de señales: La complejidad y el fan-in pesan 35 % cada uno y el churn 30 %. El código describe la complejidad como la dificultad cognitiva del código, el fan-in como el impacto de un cambio sobre otros módulos y el churn como la frecuencia real de edición (`src/modules/scoring/composite-score.ts:55-57`; pesos en `:77-79`).
- Puntuación relativa: Cada señal se normaliza con el mínimo y el máximo de los módulos del propio proyecto, así que la puntuación de un módulo depende de los demás; con un solo módulo, esa señal vale 0. `testGap` no se normaliza: entra tal cual en el recargo (`src/modules/scoring/composite-score.ts:69-71`, `:82`).

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| `weights cyclomatic and fan-in higher than churn, and never lets testGap fully decide` | Comprueba los dos extremos: un módulo con todas las señales en 0 puntúa 0, y otro con todas al máximo y `testGap` = 1 puntúa 1,2 (base 1,0 más el recargo máximo de 20 %). No prueba los pesos 0,35 / 0,35 / 0,30 por separado. |
| `a module that is complex but well-tested still outranks a trivial one, without the test gap inflating it` | Comprueba que un módulo complejo con `testGap` = 0 puntúa 1 (su base, sin recargo) y que el módulo trivial puntúa 0. |

## Dónde se usa

- `computeCompositeScores`: Llamado por `buildRunPlan` en `src/modules/cli/build-run-plan.ts:76` y reexportado en `src/index.ts:26`.
