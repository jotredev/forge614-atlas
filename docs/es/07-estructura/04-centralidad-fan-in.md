# 07.04 Centralidad de Dependencias (Fan-In)

[Traducción hermana: 07.04 (EN) Fan-In Centrality](../../en/07-structure/04-fan-in-centrality.md)

## Para qué sirve

Mide cuántos otros módulos dependen de uno (lo importan). Un módulo con alto "fan-in" es un componente central o núcleo, por lo que sube su puntuación compuesta y, con ella, su nivel de análisis. En la vida real, es como contar cuántas calles desembocan en una rotonda: si muchas calles llevan ahí, la rotonda es un punto central y crítico del tráfico.

## Archivos

- `src/modules/scoring/fan-in.ts`: Inspecciona los imports relativos de cada archivo y calcula el grado de entrada entre módulos ([Ficha en el Capítulo 06](../06-referencia-api-typescript.md)).

## Cómo funciona

1. `computeFanIn` inicializa en `0` el contador de todos los módulos recibidos (`src/modules/scoring/fan-in.ts:146`).
2. Itera sobre cada archivo del módulo emisor, descartando los que son de prueba (`src/modules/scoring/fan-in.ts:156`).
3. Lee el código de los archivos válidos y usa `extractRelativeImportSpecifiers` para encontrar las rutas relativas de sus `import`, de sus `export … from` y de sus `require` (`src/modules/scoring/fan-in.ts:160-163`).
4. Delega a `resolveImportPath` la resolución de cada ruta relativa hacia un archivo o carpeta real, probando en este orden la ruta tal cual (si es una carpeta, la carpeta misma cuenta), la ruta con `.ts`, `.tsx`, `.js` y `.jsx`, y `index.ts`, `index.tsx` e `index.js` dentro de ella. Si ninguna existe, el import se ignora (`src/modules/scoring/fan-in.ts:164-168`).
5. Determina a qué módulo pertenece la ruta resuelta: la ruta debe ser igual a la del módulo o empezar con su ruta y un separador de directorio (`src/modules/scoring/fan-in.ts:171-175`).
6. Si varios módulos encajan (ej. una carpeta mixta da un padre y subcarpetas), se elige el más específico: el que tiene la ruta más larga (`src/modules/scoring/fan-in.ts:177-183`).
7. Si el módulo destino es diferente al emisor, lo añade a un conjunto (`Set`) de dependencias de ese emisor (`src/modules/scoring/fan-in.ts:186-188`).
8. Por último, incrementa en `1` el contador Fan-In de cada módulo destino registrado en el conjunto (`src/modules/scoring/fan-in.ts:193-195`).

## Casos borde y decisiones

- Exclusión de auto-dependencias: Los imports entre archivos del mismo módulo se consideran cohesión interna y no suman al fan-in (`src/modules/scoring/fan-in.ts:186`).
- Unicidad de arista: Si un módulo importa otro 5 veces en 5 archivos distintos, el Fan-In sólo suma 1 gracias al uso de un `Set` por módulo emisor (`src/modules/scoring/fan-in.ts:151`).
- Colisión por prefijo y especificidad: El uso del separador `sep` evita que `auth` coincida erróneamente con `auth-legacy` (`src/modules/scoring/fan-in.ts:174`); ninguna de las seis pruebas lo comprueba. La elección de la ruta más larga asegura que los archivos en subcarpetas de una carpeta mixta pertenezcan a la subcarpeta, no al padre (`src/modules/scoring/fan-in.ts:177-183`).

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| `counts how many other modules import from this one` | Verifica que el contador refleje el número de módulos distintos que importan de éste. |
| `does not count a module importing from itself` | Asegura que la cohesión interna (archivos importándose en el mismo módulo) suma cero al fan-in. |
| `handles sibling modules with overlapping names correctly (path-prefix collision)` | Comprueba que `auth-legacy`, al importar `../auth`, suma 1 al fan-in de `auth` y deja el suyo en 0. No prueba la frontera del prefijo (`modulePath + sep`): la ruta importada nunca empieza con la carpeta `auth-legacy`. |
| `counts distinct importing modules, not import statements or files` | Garantiza que múltiples importaciones desde varios archivos de un mismo módulo hacia otro módulo cuenten sólo como una dependencia. |
| `does not count imports from a module's own test files` | Revisa que los imports realizados desde archivos de prueba no se contabilicen para el fan-in de producción. |
| `attributes an import to the most specific module in a mixed folder` | Verifica que las importaciones a archivos en una carpeta mixta se atribuyan al módulo más específico (la subcarpeta en lugar del contenedor padre). |

## Dónde se usa

- `computeFanIn`: Llamado por `buildRunPlan` en `src/modules/cli/build-run-plan.ts:62` y reexportado en `src/index.ts:17`.
