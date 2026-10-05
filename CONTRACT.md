# Contrato de Atlas (`forge614-atlas`)

> Analogía en una frase: Atlas es el cartógrafo que recorre un proyecto, decide cuánto esfuerzo merece cada zona y archiva el mapa en la memoria; no es el jefe de obra que reparte los trabajos.

Versión de este contrato: la del producto (`package.json`). Traducción: [CONTRACT.en.md](CONTRACT.en.md).

## Propósito
Atlas contextualiza un proyecto de código a fondo y guarda el resultado en Engram; no es el orquestador de trabajos.

## Qué hace
- Puntúa los módulos del proyecto sin IA (complejidad ciclomática, *fan-in*, *churn* de Git y brecha de pruebas) y los reparte en tres niveles por percentil: Ligero, Estándar y Profundo.
- Elige el modelo y el nivel de razonamiento de cada módulo con una tabla fija (`MODEL_TABLE` en `src/modules/cli/task-config.ts`); el razonamiento nunca pasa de `medium`.
- Manda a Workers un solo lote por corrida, con `readOnly: true` en cada tarea (ver «Ayudantes de solo lectura»).
- Guarda en Engram un reporte por módulo en cuanto llega, y cierra la sesión con un resumen. Una corrida interrumpida por cuota se retoma con el siguiente `init`.
- Ofrece los comandos `init`, `update`, `uninstall`, `--version` y `--help`.
- Se ubica en la carpeta Forge614 con `FORGE614_HOME` (ruta absoluta; sin la variable, `~/.forge614`), con la misma regla estricta que Engram.

## Qué no hace
- No detecta motores de IA: eso es de Engines. Si hay más de un motor posible y no se dio `--engine`, responde `engine-ambiguous` y deja la elección a Shell.
- No ejecuta procesos de IA por su cuenta: eso es de Workers.
- No deja que los ayudantes escriban en la memoria: solo Atlas guarda en Engram.
- No tiene interfaz de texto propia: la única experiencia visual es Shell.
- No registra MCP ni toca la configuración de ningún asistente de IA, ni al instalarse ni al correr.
- No instala, actualiza ni desinstala a otros productos; su `uninstall` quita solo su propia carpeta y su propio bloque de PATH.

## Dependencias
| Nodo o binario | Cómo se consume | Versión mínima |
| --- | --- | --- |
| Engram | SDK de TypeScript compilado dentro del binario de Atlas; la base de memoria se comparte con el Engram instalado (`<FORGE614_HOME>/engram`) | 1.8.7 |
| Engines | Binario `<FORGE614_HOME>/engines/bin/forge614-engines`: `detect` y `capabilities --agent <id>`; debe informar `supportsReadOnly: true` | 1.17.0 |
| Workers | Binario `<FORGE614_HOME>/workers/bin/forge614-workers`: recibe el lote por `stdin` y emite eventos NDJSON; `--version` debe imprimir `forge614-workers X.Y.Z` | 1.0.0 |
| Shell | No lo llama; lo instala el instalador de Engram y decide las elecciones ambiguas de motor | — |

El instalador de Atlas asegura Engram, Workers y Engines antes de crear nada de Atlas (ver el capítulo 10 de los manuales).

## Comandos públicos
| Comando | Entrada (esquema) | Salida (esquema) | `schemaVersion` | Códigos de salida |
| --- | --- | --- | --- | --- |
| `init [--engine <id>] [--force]` | La carpeta actual como proyecto | JSON: `completed`, `paused`, `already-complete`, `engine-ambiguous`, `engine-unavailable`, `engine-invalid` o el sobre de error (capítulos 08 y 09 de los manuales) | 1 | 0; 1 si responde un error |
| `update` | Ninguna | JSON `{ status: "updated", updated, previousVersion, installedVersion }` | 1 | 0; 1 si falla |
| `uninstall [--from forge614-engram] [--confirmed]` | Ninguna; `--confirmed` evita la pregunta | JSON `{ status: "uninstalled", removed, pathPublications }` | 1 | 0; 1 si falla; 130 si la persona cancela |
| `--version`, `-v` | Primer argumento | Texto `forge614-atlas X.Y.Z` | — | 0 |
| `--help`, `-h` | En cualquier posición de los argumentos | Texto de ayuda | — | 0 |

## Códigos de error
| Código | Significado |
| --- | --- |
| `INVALID_FORGE614_HOME` | `FORGE614_HOME` está definida pero vacía, es relativa o contiene un carácter nulo; lo responden `init`, `update` y `uninstall` antes de hacer cualquier otra cosa |
| `ENGINES_UNREACHABLE` | El binario de Engines no responde o su respuesta falló |
| `ANALYSIS_FAILED` | No se pudo puntuar el proyecto (por ejemplo, sin Git o sin commits) |
| `READ_ONLY_UNSUPPORTED` | Engines no declara `supportsReadOnly: true` para el motor elegido (un Engines anterior a 1.17.0 no trae ese campo y cuenta como no declarado), o Workers se negó a correr las tareas por la misma razón |
| `WORKERS_UNREACHABLE` | El binario de Workers no existe o no es ejecutable |
| `WORKERS_OUTDATED` | Workers es anterior a 1.0.0 o `--version` no responde `forge614-workers X.Y.Z` |
| `WORKERS_FATAL_ERROR` | Workers no pudo correr el lote |
| `UNEXPECTED_ERROR` | Fallo no previsto, con el mensaje de origen |
| `UPDATE_FAILED` | `update`: falló la descarga, el instalador o la versión instalada no es válida |
| `INVALID_ARGUMENT` | `update` o `uninstall` recibieron un argumento que no aceptan |
| `CONFIRMATION_REQUIRED` | `uninstall` sin `--confirmed` y sin terminal; no se borra nada |
| `UNINSTALL_CANCELLED` | `uninstall`: la frase escrita no coincidió (salida 130); no se borra nada |
| `UNINSTALL_UNSAFE` | La carpeta de Atlas o la carpeta Forge614 no es una carpeta real; no se borra nada |
| `PATH_REMOVE_FAILED` | Un perfil de la terminal no se puede cambiar con seguridad o no se pudo reescribir |
| `UNINSTALL_FAILED` | La carpeta de Atlas no se pudo borrar; los bloques de PATH ya se habían quitado |
| `UNKNOWN_COMMAND` | Comando que Atlas no conoce |

## Requisitos obligatorios para asistentes de IA soportados
Sección `atlas` de `standard/procedures/new-agent-checklist.md` (estándar 1.1.2). Cada motor nuevo agrega su fila en `MODEL_TABLE` de `src/modules/cli/task-config.ts` (y en el tipo `EngineId`), y en las tablas de los capítulos 01, 04 y 09 de los manuales y de `STATE.md`.

## Compatibilidad
Cambios incompatibles suben `schemaVersion`; se mantiene una versión de compatibilidad. `schemaVersion` sube con cualquier cambio incompatible de la salida de `init`, `update` o `uninstall`.

## Ayudantes de solo lectura
Cada tarea que Atlas manda a Workers lleva `readOnly: true`, siempre y sin opción de apagarlo. Atlas se niega a empezar (`READ_ONLY_UNSUPPORTED`, `WORKERS_OUTDATED`) cuando Engines 1.17.0 o Workers 1.0.0 no pueden garantizarlo, y lo comprueba antes de abrir o reanudar cualquier sesión de Engram.

## Contrato de desinstalación con Engram
Engram desinstala a Atlas con `forge614-atlas uninstall --from forge614-engram --confirmed`: sin terminal, ignorando la salida y mirando solo el código. El código 0 significa que Atlas quitó únicamente `<FORGE614_HOME>/atlas/` y su propio bloque de PATH (nunca Engram, Engines, Shell, Workers ni las memorias guardadas); cualquier otro código significa que Atlas no pudo desinstalarse y Engram no se modifica.

## Sobre de error propio
Todo error de Atlas usa `{ "schemaVersion": 1, "status": "error", "error": { "code": "...", "message": "..." } }`. Difiere del sobre de error estándar del ecosistema (`{ schemaVersion, code, error }`) a propósito: Shell ya lee este, y cambiarlo rompería a su consumidor. `UNKNOWN_COMMAND` lleva el `argv` recibido en vez de `message`.

## Windows
Deuda declarada de la versión 1.1.0: el contrato del ecosistema pide macOS, Linux y Windows, y Atlas publica solo macOS y Linux (x64 y arm64); no hay `install.ps1` ni binario de Windows.
