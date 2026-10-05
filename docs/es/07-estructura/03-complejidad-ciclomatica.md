# 07.03 Complejidad Ciclomática (McCabe AST)

[Traducción hermana: 07.03 (EN) Cyclomatic Complexity](../../en/07-structure/03-cyclomatic-complexity.md)

## Para qué sirve

Calcula cuántas rutas posibles puede tomar la ejecución de un código (complejidad de McCabe). Un código con muchos `if`, bucles y operadores lógicos recibe mayor puntuación, indicando que es más difícil de entender y necesita más presupuesto de tokens del modelo. En la vida real, es como contar cuántas bifurcaciones tiene un laberinto: a más desvíos, más difícil es cruzarlo.

## Archivos

- `src/modules/scoring/cyclomatic.ts`: Analiza el AST de cada archivo para contar nodos de bifurcación y suma los totales por módulo ([Ficha en el Capítulo 06](../06-referencia-api-typescript.md)).

## Cómo funciona

1. `computeCyclomaticComplexity` recorre cada módulo del repositorio (`src/modules/scoring/cyclomatic.ts:113`).
2. Para cada archivo del módulo, si no es una prueba unitaria, lee su código fuente (`src/modules/scoring/cyclomatic.ts:117-125`).
3. Llama a `fileCyclomaticComplexity` pasando el código y la ruta (`src/modules/scoring/cyclomatic.ts:128`).
4. `fileCyclomaticComplexity` convierte el código en un AST de TypeScript (`src/modules/scoring/cyclomatic.ts:45`).
5. Empieza con una complejidad base de `1` (el camino lineal del archivo) (`src/modules/scoring/cyclomatic.ts:52`).
6. La función `visit` recorre cada nodo del árbol. Suma `1` por cada: `if`, ternario, `while`, `do...while`, `for`, `for...in`, `for...of`, bloque `catch` y cláusula `case` de un `switch` (`src/modules/scoring/cyclomatic.ts:57-70`).
7. También suma `1` por cada operador lógico de cortocircuito (`&&`, `||`, `??`) porque bifurcan la evaluación implícitamente (`src/modules/scoring/cyclomatic.ts:76-80`).
8. `ts.forEachChild` continúa la visita hacia los nodos hijos, recursivamente (`src/modules/scoring/cyclomatic.ts:86`).
9. Devuelve el total acumulado en el mapa de resultados por módulo (`src/modules/scoring/cyclomatic.ts:132`).

## Casos borde y decisiones

- Exclusión de pruebas: Todos los archivos de prueba (`.test` o `.spec`) son excluidos estrictamente para evitar que sus aserciones inflen la complejidad irrealmente (`src/modules/scoring/cyclomatic.ts:119`).
- Omisión de `default`: Dentro de un `switch`, las cláusulas `default` no suman puntos porque no son una condición extra, sino el camino por omisión (`src/modules/scoring/cyclomatic.ts:67`).

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| `a function with no branching has the baseline complexity of 1` | Asegura que un código lineal sin condicionales devuelva un mínimo de 1. |
| `counts if/else-if, loops, switch cases, and logical operators (never default)` | Verifica la suma correcta en todos los tipos de bifurcaciones, y que `default` se ignora. |
| `sums complexity across every file in a module` | Comprueba que la complejidad total de un módulo es la suma de sus archivos. |
| `excludes *.test.ts files from the module's complexity total` | Garantiza que el código de las pruebas no suma a la puntuación del módulo. |

## Dónde se usa

- `computeCyclomaticComplexity`: Llamado por `buildRunPlan` en `src/modules/cli/build-run-plan.ts:61`.
- `fileCyclomaticComplexity`: Llamado localmente por `computeCyclomaticComplexity` en `src/modules/scoring/cyclomatic.ts:128` y reexportado en `src/index.ts:14`.
