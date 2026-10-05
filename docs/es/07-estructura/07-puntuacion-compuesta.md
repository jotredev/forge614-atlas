# 07.07 Puntuación Compuesta Normalizada

[Traducción hermana: 07.07 (EN) Composite Scoring](../../en/07-structure/07-composite-scoring.md)

## Para qué sirve

Convierte las distintas señales de un módulo (complejidad, fan-in, churn y brecha de pruebas) en una única puntuación de riesgo y necesidad de contexto. Como cada métrica usa escalas distintas (el churn puede llegar a miles, el fan-in rara vez pasa de unas decenas), este paso las estandariza y las pesa. En la vida real, es como calcular la calificación final de un estudiante donde el examen final, los trabajos prácticos y la participación tienen distinta escala y peso en la nota.

## Archivos

- `src/modules/scoring/composite-score.ts`: Normaliza los valores mediante una fórmula Min-Max, los combina con porcentajes y aplica el recargo por falta de pruebas ([Ficha en el Capítulo 06](../06-referencia-api-typescript.md)).

## Cómo funciona

1. `computeCompositeScores` recibe una lista de objetos `ModuleSignals` (que agrupan los valores de cada módulo) (`src/modules/scoring/composite-score.ts:67`).
2. Extrae las listas de valores de `cyclomatic`, `fanIn` y `churn` y las pasa por la función `normalize` de forma independiente (`src/modules/scoring/composite-score.ts:69-71`).
3. La función `normalize` aplica una escala Min-Max clásica: `(valor - min) / (max - min)`, devolviendo valores entre `0.0` y `1.0` (`src/modules/scoring/composite-score.ts:101-104`).
4. Iterando por cada módulo, calcula una puntuación `base` sumando un `35%` de la complejidad ciclomática normalizada, `35%` del fan-in y `30%` del churn (`src/modules/scoring/composite-score.ts:76-79`).
5. Multiplica el resultado por el factor de riesgo de las pruebas (`testGap`): `base * (1 + 0.2 * signal.testGap)`, agregando hasta un 20% más si no hay pruebas (`src/modules/scoring/composite-score.ts:82`).
6. Devuelve la lista de módulos con su puntuación final, respetando el orden original (`src/modules/scoring/composite-score.ts:84-87`).

## Casos borde y decisiones

- División entre cero: Si todos los módulos tienen exactamente el mismo valor para una señal (el máximo es igual al mínimo), la fórmula Min-Max dividiría entre cero (`0/0`); la función `normalize` detecta esto y devuelve un vector de ceros (`src/modules/scoring/composite-score.ts:98-99`).
- Ponderación de señales: La complejidad y el fan-in valen más (35% cada uno) que el churn (30%) porque indican dificultad estructural intrínseca, mientras que el churn es solo un indicador histórico que no siempre implica código denso o crítico (`src/modules/scoring/composite-score.ts:77-79`).

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| `weights cyclomatic and fan-in higher than churn, and never lets testGap fully decide` | Verifica que las señales se ponderen con los porcentajes correctos y que la falta de pruebas solo actúe como un multiplicador moderado. |
| `a module that is complex but well-tested still outranks a trivial one, without the test gap inflating it` | Comprueba que la brecha de pruebas de un módulo trivial no le dé más puntuación que a uno inherentemente complejo que sí está bien probado. |

## Dónde se usa

- `computeCompositeScores`: Llamado por `buildRunPlan` en `src/modules/cli/build-run-plan.ts:76` y reexportado en `src/index.ts:26`.
