# 07.03 Complejidad Ciclomática (McCabe AST)

[Traducción hermana: 07.03 (EN) Cyclomatic Complexity](../../en/07-structure/03-cyclomatic-complexity.md)

## Para qué sirve

Calcula cuántas rutas posibles puede tomar la ejecución de un código (complejidad de McCabe). Un código con muchos `if`, bucles y operadores lógicos recibe mayor puntuación, indicando que es más difícil de entender; esa puntuación sube la puntuación compuesta del módulo y con ella su nivel de análisis (ver 07.07 y 07.08). En la vida real, es como contar cuántas bifurcaciones tiene un laberinto: a más desvíos, más difícil es cruzarlo.

## Archivos

- `src/modules/scoring/cyclomatic.ts`: Analiza el AST de cada archivo para contar nodos de bifurcación y suma los totales por módulo ([Ficha en el Capítulo 06](../06-referencia-api-typescript.md)).

## Cómo funciona

1. `computeCyclomaticComplexity` recorre cada módulo que recibe (`src/modules/scoring/cyclomatic.ts:114`).
2. Para cada archivo del módulo, si no es una prueba unitaria, lee su código fuente (`src/modules/scoring/cyclomatic.ts:118-125`).
3. Llama a `fileCyclomaticComplexity` pasando el código y la ruta (`src/modules/scoring/cyclomatic.ts:128`).
4. `fileCyclomaticComplexity` convierte el código en un AST (árbol de sintaxis abstracta: el código ya leído como un árbol) de TypeScript (`src/modules/scoring/cyclomatic.ts:45-50`).
5. Empieza con una complejidad base de `1` (el camino lineal del archivo) (`src/modules/scoring/cyclomatic.ts:53`).
6. La función `visit` recorre cada nodo del árbol. Suma `1` por cada: `if`, ternario, `while`, `do...while`, `for`, `for...in`, `for...of`, bloque `catch` y cláusula `case` de un `switch` (`src/modules/scoring/cyclomatic.ts:58-72`).
7. También suma `1` por cada operador lógico de cortocircuito (`&&`, `||`, `??`) porque bifurcan la evaluación implícitamente (`src/modules/scoring/cyclomatic.ts:75-83`).
8. `ts.forEachChild` continúa la visita hacia los nodos hijos, recursivamente (`src/modules/scoring/cyclomatic.ts:87`).
9. Devuelve el total acumulado en el mapa de resultados por módulo (`src/modules/scoring/cyclomatic.ts:132`).

## Casos borde y decisiones

- Exclusión de pruebas: Todos los archivos de prueba (`.test` o `.spec`) son excluidos estrictamente para evitar que sus aserciones inflen la complejidad irrealmente (`src/modules/scoring/cyclomatic.ts:120-122`).
- Omisión de `default`: Dentro de un `switch`, las cláusulas `default` no suman puntos porque no son una condición extra, sino el camino por omisión (`src/modules/scoring/cyclomatic.ts:67`).
- Módulo sin archivos productivos: si solo tiene pruebas o está vacío, su complejidad es 0 (`src/modules/scoring/cyclomatic.ts:115`, `:132`).

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| `a function with no branching has the baseline complexity of 1` | Asegura que un código lineal sin condicionales devuelva un mínimo de 1. |
| `counts if/else-if, loops, switch cases, and logical operators (never default)` | Verifica un archivo con 3 `if` (uno es `else if`), 1 `for...of`, 1 `&&` y 2 `case` que da 8 (1 base + 7), y que el `default` no suma. No prueba `while`, `do...while`, `for`, `for...in`, `catch`, ternarios, `||` ni `??`. |
| `sums complexity across every file in a module` | Comprueba que la complejidad total de un módulo es la suma de sus archivos. |
| `excludes *.test.ts files from the module's complexity total` | Garantiza que el código de las pruebas no suma a la puntuación del módulo. |

## Dónde se usa

- `computeCyclomaticComplexity`: Llamado por `buildRunPlan` en `src/modules/cli/build-run-plan.ts:61`.
- `fileCyclomaticComplexity`: Llamado localmente por `computeCyclomaticComplexity` en `src/modules/scoring/cyclomatic.ts:128` y reexportado en `src/index.ts:14`.
