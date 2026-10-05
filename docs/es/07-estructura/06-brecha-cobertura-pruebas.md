# 07.06 Brecha de Cobertura de Pruebas (Test Gap)

[Traducción hermana: 07.06 (EN) Test Coverage Gap](../../en/07-structure/06-test-coverage-gap.md)

## Para qué sirve

Mide qué proporción de los archivos de un módulo no tiene un archivo de pruebas asociado, devolviendo un valor de 0 (todo cubierto) a 1 (nada cubierto). Esta señal se usa para penalizar los módulos complejos que, además, no están probados. En la vida real, es como contar qué porcentaje de los empleados de una fábrica de químicos no lleva equipo de protección; a mayor porcentaje, mayor es el riesgo de accidentes.

## Archivos

- `src/modules/scoring/test-coverage-gap.ts`: Examina el sistema de archivos buscando pruebas "hermanas" por cada archivo fuente y calcula la proporción sin cubrir ([Ficha en el Capítulo 06](../06-referencia-api-typescript.md)).

## Cómo funciona

1. `computeTestCoverageGap` recibe los módulos detectados (`src/modules/scoring/test-coverage-gap.ts:67`).
2. Para cada módulo, filtra y se queda sólo con sus archivos productivos, dejando fuera los propios archivos de pruebas usando la función `isTestFile` de descubrimiento (`src/modules/scoring/test-coverage-gap.ts:71-72`).
3. Si un módulo carece de archivos productivos, le asigna inmediatamente una brecha de 0 para no penalizarlo (`src/modules/scoring/test-coverage-gap.ts:75-78`).
4. Usa la función `hasSiblingTest` sobre cada archivo productivo para contar cuántos tienen prueba (`src/modules/scoring/test-coverage-gap.ts:81`).
5. En `hasSiblingTest`, separa la ruta base de la extensión, y comprueba con `existsSync` si existe un archivo con `.test` o `.spec` y la misma extensión original en esa misma carpeta (`src/modules/scoring/test-coverage-gap.ts:31-36`).
6. La brecha se calcula restando a `1` la división entre los archivos que sí tienen prueba y el total de archivos productivos (`src/modules/scoring/test-coverage-gap.ts:84`).
7. El resultado se guarda en el mapa que devuelve la función (`src/modules/scoring/test-coverage-gap.ts:87`).

## Casos borde y decisiones

- Convención de pruebas hermanas: Atlas asume estrictamente que las pruebas viven al lado del código, en la misma carpeta (`ej. src/auth/jwt.test.ts` para `src/auth/jwt.ts`). Una arquitectura con pruebas en una carpeta separada `tests/` dará un test gap de 1.0 (brecha total) (`src/modules/scoring/test-coverage-gap.ts:35-36`).
- Penalizador, no suma directa: El resultado `[0, 1]` no se suma al puntaje de complejidad, sino que se usa después en `composite-score.ts` como un multiplicador de riesgo de hasta un 20% más si no hay pruebas (`src/modules/scoring/test-coverage-gap.ts:60-61`).
- Módulos vacíos o de solo tests: Un módulo sin archivos productivos recibe brecha 0 (ningún riesgo de falta de pruebas), evitando la división entre cero (`src/modules/scoring/test-coverage-gap.ts:75-76`).

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| `returns 0 when every source file has a sibling .test file` | Confirma que si todos los archivos tienen su prueba al lado, la brecha reportada es 0. |
| `returns 1 when no source file has a sibling test` | Asegura que un módulo completamente sin pruebas obtenga un puntaje de brecha máxima de 1. |
| `returns a fractional gap when only some files are covered` | Verifica que el cálculo proporcional sea correcto (ej. 1 protegido de 2 da un gap de 0.5). |

## Dónde se usa

- `computeTestCoverageGap`: Llamado por `buildRunPlan` en `src/modules/cli/build-run-plan.ts:64` y reexportado en `src/index.ts:23`.
