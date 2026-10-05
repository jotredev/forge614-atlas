# 07.02 Descubrimiento de Módulos

[Traducción hermana: 07.02 (EN) Module Discovery](../../en/07-structure/02-module-discovery.md)

## Para qué sirve

Identifica las carpetas que componen el código de un proyecto para analizarlas como "módulos". En la vida real, es como el censo de una ciudad: el encuestador recorre cada manzana (carpeta) y anota solo las que tienen casas (archivos de código); cada manzana anotada es un módulo y se identifica por su dirección completa (`src/auth`), no solo por su nombre.

## Archivos

- `src/modules/scoring/discovery.ts`: Recorre las carpetas de forma recursiva para encontrar los módulos (`discoverModules`) y ofrece `isTestFile`, que reconoce por el nombre si un archivo es de prueba ([Ficha en el Capítulo 06](../06-referencia-api-typescript.md)).

## Cómo funciona

1. `discoverModules` inicia el proceso de descubrimiento desde la raíz del repositorio, leyendo las carpetas (ignorando archivos sueltos en la raíz) (`src/modules/scoring/discovery.ts:79-83`).
2. Delega a `collectModules` para analizar recursivamente cada carpeta (`src/modules/scoring/discovery.ts:86-88`).
3. En `collectModules`, si una carpeta no tiene subcarpetas que cuenten (las excluidas y las que empiezan por punto no cuentan) pero sí archivos de código, la considera un módulo y la registra (`src/modules/scoring/discovery.ts:112-117`).
4. Si la carpeta es mixta (tiene archivos de código propios y además subcarpetas), los archivos sueltos forman un módulo con el nombre de la carpeta, y sigue bajando hacia las subcarpetas (`src/modules/scoring/discovery.ts:119-122`).
5. Si la carpeta solo tiene subcarpetas (es un contenedor puro), simplemente la atraviesa e inspecciona cada subcarpeta (`src/modules/scoring/discovery.ts:124-127`).
6. Se usa `relativeModuleName` para generar un nombre uniforme basado en la ruta relativa, con barras diagonales `/` para estabilidad entre sistemas operativos (`src/modules/scoring/discovery.ts:139-141`).
7. Se usa `listDirectSourceFiles` con un `Glob` para listar solo archivos `.ts, .tsx, .js, .jsx` directos en la carpeta, ordenados alfabéticamente (`src/modules/scoring/discovery.ts:150-159`).

## Casos borde y decisiones

- Carpetas excluidas: Omite explícitamente `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `out`, `.forge614` y cualquier carpeta que empiece por punto, para evitar procesar dependencias o salidas de compilación (`src/modules/scoring/discovery.ts:19-28`; los filtros de `:81` y `:105` descartan además toda carpeta que empiece por punto).
- Colisión de nombres: Como el nombre del módulo es su ruta relativa (`src/auth` en vez de solo `auth`), dos carpetas con el mismo nombre en diferentes ramas no chocan (`src/modules/scoring/discovery.ts:69-71` y `:139-141`).
- Archivos sueltos en raíz: Los archivos que están directamente en la raíz no forman parte de ningún módulo; la función `discoverModules` sólo baja por las carpetas directas hijas de la raíz (`src/modules/scoring/discovery.ts:73` y `:80-83`).
- Archivos de prueba: `files` incluye también los `.test.*` y `.spec.*`; quien cuenta (complejidad, fan-in, brecha de pruebas) los separa con `isTestFile`.
- Carpeta que no existe: si `root` no existe o no se puede leer, `discoverModules` lanza el error del sistema de archivos (por ejemplo `ENOENT`) y no lo atrapa.

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| `finds top-level folders that contain source files` | Comprueba que al escanear `src` sale un solo módulo, `auth`, con su archivo `login.ts`. |
| `excludes folders with no ts/tsx/js/jsx files` | Omite carpetas que no contienen archivos con las extensiones de código soportadas (la prueba usa `styles`, que solo tiene un CSS). |
| `ignores node_modules even when scanning from the repo root` | Comprueba que, al escanear desde la raíz, ningún módulo se llama `node_modules` (compara nombres exactos: un módulo `node_modules/some-package` no la haría fallar). |
| `excludes nested dot-directories from file scanning` | Asegura que una subcarpeta que empieza por punto dentro de un módulo (la prueba crea `auth/.cache/generated.ts`) no se escanea: el módulo `auth` queda solo con `login.ts`. |
| `descends into a purely-nested container folder instead of collapsing it into one module` | Comprueba que `src`, que solo tiene subcarpetas, no se vuelve un módulo: el resultado es únicamente `src/auth` (con `login.ts`), nombrado con su ruta relativa; `src/styles` no cuenta porque solo tiene un CSS. |
| `splits a mixed folder (loose files + subfolders) into a loose-files module plus one module per subfolder` | Comprueba que `src` (con `index.ts` suelto y las subcarpetas `auth` y `billing`) da tres módulos: `src` (solo `index.ts`), `src/auth` y `src/billing`. |
| `keeps flat top-level modules working exactly as before (no regression)` | Comprueba que una carpeta de primer nivel con código directo (`auth/login.ts`) da el módulo `auth`. |
| `returns modules and files in stable, alphabetically sorted order regardless of creation order` | Devuelve los módulos y sus archivos ordenados alfabéticamente para asegurar un comportamiento determinista. |

## Dónde se usa

- `discoverModules`: Llamado por `resolveModuleFiles` en `src/modules/cli/module-files.ts:16` y `buildRunPlan` en `src/modules/cli/build-run-plan.ts:54`.
- `isTestFile`: Llamado por `test-coverage-gap.ts:72`, `fan-in.ts:156`, y `cyclomatic.ts:120`.
- `discoverModules` e `isTestFile` están reexportados en `src/index.ts:10`.
