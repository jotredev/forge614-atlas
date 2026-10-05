# 07.05 Volatilidad Histórica de Git (Churn)

[Traducción hermana: 07.05 (EN) Git Churn Volatility](../../en/07-structure/05-git-churn-volatility.md)

## Para qué sirve

Cuenta cuántas veces han sido modificados los archivos de un módulo en todo el historial de Git. Un módulo que cambia mucho ("alto churn") es una zona inestable propensa a deuda técnica (arreglos pendientes que se acumulan) y errores, por lo que sube su puntuación y, con ella, su nivel de análisis. En la vida real, es como revisar el historial completo de reparaciones de los coches de una flota: el coche que ha entrado al taller más veces desde que existe necesita una revisión más profunda.

## Archivos

- `src/modules/scoring/churn.ts`: Invoca a Git para obtener los archivos modificados en cada commit y los asigna a sus respectivos módulos ([Ficha en el Capítulo 06](../06-referencia-api-typescript.md)).

## Cómo funciona

1. `computeChurn` ejecuta el comando de terminal `git -c core.quotepath=false log --format= --name-only` de forma síncrona en la raíz del repositorio (`src/modules/scoring/churn.ts:48-51`).
2. Verifica si el comando falló; si el código de salida no es cero, lanza un error de inmediato (`src/modules/scoring/churn.ts:54-56`).
3. Inicializa el mapa de resultados con `0` para cada módulo recibido (`src/modules/scoring/churn.ts:59`).
4. Divide la salida de texto en líneas (archivos individuales modificados), limpiando espacios en blanco y descartando líneas vacías (`src/modules/scoring/churn.ts:62-65`).
5. Para cada ruta de archivo de la salida, la convierte en absoluta basándose en la raíz del repositorio (`src/modules/scoring/churn.ts:70`).
6. Filtra qué módulos contienen la ruta de ese archivo en su directorio. La ruta absoluta debe igualar a la del módulo o empezar con la del módulo seguida de un separador de directorio (`src/modules/scoring/churn.ts:73-77`).
7. Para resolver carpetas mixtas (que producen un módulo padre y otros módulos por cada subcarpeta), selecciona el módulo más específico, que es el que tiene la ruta base más larga (`src/modules/scoring/churn.ts:81-85`).
8. Si encuentra el módulo, incrementa su contador de "churn" en 1 por cada aparición en el historial (`src/modules/scoring/churn.ts:88-90`).

## Casos borde y decisiones

- Codificación UTF-8 en Git: Git escapa de forma predeterminada caracteres no ASCII (como la eñe o tildes) en su salida, lo que impediría relacionarlos con las rutas de los archivos; usar `-c core.quotepath=false` fuerza la salida UTF-8 cruda (`src/modules/scoring/churn.ts:48`).
- Archivos fuera de los módulos detectados: Se ignoran las rutas de la salida de Git que no caen dentro de la carpeta de ningún módulo (ej. archivos en `dist/` o sueltos en la raíz) (`src/modules/scoring/churn.ts:88`). En cambio, un archivo que ya no existe, que se renombró, que no es de código o que es de prueba SÍ cuenta si su ruta quedó dentro de la carpeta de un módulo, porque `computeChurn` usa solo la ruta de la carpeta y no `module.files` (`src/modules/scoring/churn.ts:73-77`).
- Raíz del repositorio: `repoRoot` debe ser la raíz del repositorio de Git; si es una subcarpeta, Git no falla, pero las rutas no coinciden con las carpetas de los módulos y el churn de todos sale en 0 (`src/modules/scoring/churn.ts:70`).
- Error del comando: Si el directorio no es un repositorio Git, no está instalado Git, o el repo no tiene ningún commit (HEAD huérfano: todavía sin ningún commit), el comando fallará y la función lanzará un error que abortará el proceso de cálculo completo (`src/modules/scoring/churn.ts:55`).

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| `counts changed-file entries per module across commit history` | Verifica el conteo en un repositorio de Git real creado en una carpeta temporal: `auth` (un archivo cambiado en 2 commits) cuenta 2 y `billing` (1 commit) cuenta 1. |
| `correctly attributes files to modules with prefix-overlapping names` | Asegura que `auth/login.ts` suma solo a `auth` y `auth-legacy/old-login.ts` solo a `auth-legacy` (1 cada uno), sin mezclarse. |
| `correctly attributes churn for modules with non-ASCII names` | Comprueba que el módulo `señales` (con ñ) cuenta su cambio (1); sin `core.quotepath=false` Git escribiría la ruta con códigos octales y no coincidiría con la carpeta. |
| `attributes each changed file to the most specific module in a mixed folder` | Garantiza que un archivo modificado dentro de una carpeta mixta suma al módulo de su subcarpeta, no al del directorio contenedor: `src` = 1, `src/auth` = 2 y `src/billing` = 1. |

## Dónde se usa

- `computeChurn`: Llamado por `buildRunPlan` en `src/modules/cli/build-run-plan.ts:63` y reexportado en `src/index.ts:20`.
