# 07.02 Descubrimiento e Inspección del Sistema de Archivos

[Traducción hermana: 07.02 (EN) Module Discovery](../../en/07-structure/02-module-discovery.md)

## Para qué sirve

Identifica las carpetas que componen el código de un proyecto para analizarlas como "módulos". En la vida real, es como el censo de una ciudad, donde los encuestadores recorren todas las calles y edificios (carpetas) para registrar qué casas (archivos de código) pertenecen a cada vecindario (módulo).

## Archivos

- `src/modules/scoring/discovery.ts`: Algoritmo de exploración recursiva que encuentra módulos y archivos de prueba ([Ficha en el Capítulo 06](../06-referencia-api-typescript.md)).

## Cómo funciona

1. `discoverModules` inicia el proceso de descubrimiento desde la raíz del repositorio, leyendo las carpetas (ignorando archivos sueltos en la raíz) (`src/modules/scoring/discovery.ts:74`).
2. Delega a `collectModules` para analizar recursivamente cada carpeta (`src/modules/scoring/discovery.ts:80`).
3. En `collectModules`, si una carpeta no tiene subcarpetas pero sí archivos de código, la considera un módulo y la registra (`src/modules/scoring/discovery.ts:103`).
4. Si la carpeta es mixta (tiene archivos de código propios y además subcarpetas), los archivos sueltos forman un módulo con el nombre de la carpeta, y sigue bajando hacia las subcarpetas (`src/modules/scoring/discovery.ts:109-111`).
5. Si la carpeta solo tiene subcarpetas (es un contenedor puro), simplemente la atraviesa e inspecciona cada subcarpeta (`src/modules/scoring/discovery.ts:114-116`).
6. Se usa `relativeModuleName` para generar un nombre uniforme basado en la ruta relativa, con barras diagonales `/` para estabilidad entre sistemas operativos (`src/modules/scoring/discovery.ts:126-128`).
7. Se usa `listDirectSourceFiles` con un `Glob` para listar solo archivos `.ts, .tsx, .js, .jsx` directos en la carpeta, ordenados alfabéticamente (`src/modules/scoring/discovery.ts:138-144`).

## Casos borde y decisiones

- Carpetas excluidas: Omite explícitamente `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `out`, `.forge614` y cualquier carpeta que empiece por punto, para evitar procesar dependencias o salidas de compilación (`src/modules/scoring/discovery.ts:19`).
- Colisión de nombres: Como el nombre del módulo es su ruta relativa (`src/auth` en vez de solo `auth`), dos carpetas con el mismo nombre en diferentes ramas no chocan (`src/modules/scoring/discovery.ts:65`).
- Archivos sueltos en raíz: Los archivos que están directamente en la raíz no forman parte de ningún módulo; la función `discoverModules` sólo baja por las carpetas directas hijas de la raíz (`src/modules/scoring/discovery.ts:68-75`).

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| `finds top-level folders that contain source files` | Encuentra carpetas de nivel superior que tienen archivos de código sueltos. |
| `excludes folders with no ts/tsx/js/jsx files` | Omite carpetas que no contienen archivos con las extensiones de código soportadas. |
| `ignores node_modules even when scanning from the repo root` | Verifica que el directorio `node_modules` es excluido de la búsqueda. |
| `excludes nested dot-directories from file scanning` | Asegura que los subdirectorios que empiezan por punto (ej. `.hidden`) no se escanean. |
| `descends into a purely-nested container folder instead of collapsing it into one module` | Asegura que un contenedor de carpetas puras se recorre internamente para crear un módulo por cada subcarpeta, en vez de unificarlos. |
| `splits a mixed folder (loose files + subfolders) into a loose-files module plus one module per subfolder` | Comprueba que las carpetas mixtas registran sus archivos como un módulo propio y separan sus subcarpetas. |
| `keeps flat top-level modules working exactly as before (no regression)` | Garantiza que las carpetas de primer nivel planas se sigan evaluando y tratando igual que siempre. |
| `returns modules and files in stable, alphabetically sorted order regardless of creation order` | Devuelve los módulos y sus archivos ordenados alfabéticamente para asegurar un comportamiento determinista. |

## Dónde se usa

- `discoverModules`: Llamado por `resolveModuleFiles` en `src/modules/cli/module-files.ts:16` y `buildRunPlan` en `src/modules/cli/build-run-plan.ts:54`.
- `isTestFile`: Llamado por `test-coverage-gap.ts:72`, `fan-in.ts:156`, y `cyclomatic.ts:120`.
