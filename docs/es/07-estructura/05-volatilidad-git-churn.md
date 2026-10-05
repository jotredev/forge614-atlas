# 07.05 Volatilidad Histórica de Git (Churn)

[Traducción hermana: 07.05 (EN) Git Churn Volatility](../../en/07-structure/05-git-churn-volatility.md)

## Para qué sirve

Cuenta cuántas veces han sido modificados los archivos de un módulo en el historial de Git. Un módulo que cambia mucho ("alto churn") es una zona inestable propensa a deuda técnica y errores, por lo que requiere más atención y presupuesto. En la vida real, es como revisar el historial de reparaciones de los coches de una flota: el coche que ha entrado al taller más veces en el último año necesita una revisión más profunda.

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
- Archivos fuera de los módulos detectados: Si la salida de Git incluye archivos que ya no existen, han sido renombrados, o no pertenecen a ningún módulo conocido (ej. archivos en `dist/` o sueltos en la raíz), simplemente se ignoran (`src/modules/scoring/churn.ts:88`).
- Error del comando: Si el directorio no es un repositorio Git, no está instalado Git, o el repo no tiene ningún commit (HEAD huérfano), el comando fallará y la función lanzará un error que abortará el proceso de cálculo completo (`src/modules/scoring/churn.ts:55`).

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| `counts changed-file entries per module across commit history` | Verifica el conteo total de apariciones por módulo en el historial simulado de git. |
| `correctly attributes files to modules with prefix-overlapping names` | Asegura que `auth/index.ts` suma a `auth`, pero no a `auth-legacy`. |
| `correctly attributes churn for modules with non-ASCII names` | Comprueba que los módulos con nombres que incluyen caracteres especiales o tildes en UTF-8 sumen correctamente. |
| `attributes each changed file to the most specific module in a mixed folder` | Garantiza que un archivo modificado dentro de una carpeta mixta suma al módulo de su subcarpeta, no al del directorio contenedor. |

## Dónde se usa

- `computeChurn`: Llamado por `buildRunPlan` en `src/modules/cli/build-run-plan.ts:63` y reexportado en `src/index.ts:20`.
