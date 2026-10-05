# Changelog

## 1.1.1

Atlas reparte bien lo que pasa en las subcarpetas de una carpeta mixta, su instalador dice cuando Forge614 Engines ya es compatible, y el código, las pruebas y los manuales quedan documentados por completo en español.

- **Corrección:** con una carpeta que tiene archivos sueltos y subcarpetas (por ejemplo `src/index.ts` y `src/auth/`), el churn y el fan-in de lo que está en `src/auth` se sumaban al módulo `src` y `src/auth` quedaba siempre en 0; ahora cada archivo cuenta en el módulo más específico que lo contiene (el de ruta más larga).
- **Instalador:** cuando Forge614 Engines ya es compatible, `install.sh` lo dice (`Forge614 Engines is compatible: <ruta del binario>`) en lugar de no imprimir nada.
- **Manuales:** capítulos nuevos 11 (resolución de errores), 12 (glosario) y 13 (archivos de datos); el capítulo 06 cubre toda la API que exporta `src/index.ts`; el capítulo 07 explica cada parte del motor de puntuación con su archivo y línea en lugar de copiar código; los capítulos 00, 02, 03 y 08 describen el descubrimiento de módulos como es hoy.
- **Código y pruebas documentados:** todo `src/`, `scripts/` y `test/` lleva comentarios en español: cada función con lo que hace, devuelve y lanza, y cada prueba con lo que comprueba.

## 1.1.0

Atlas ahora envía solo ayudantes de solo lectura, responde `--help`, `update` y `uninstall`, encuentra cada producto de Forge614 mediante `FORGE614_HOME`, y su instalador trae Workers y comprueba Engram y Engines antes de crear nada.

- **Ayudantes de solo lectura:** cada tarea enviada a Workers lleva `readOnly: true`, sin opción para desactivarlo. Atlas comprueba al inicio, antes de abrir o reanudar cualquier sesión de Engram, que Engines informa `supportsReadOnly: true` para el asistente elegido (`READ_ONLY_UNSUPPORTED`), que existe el binario de Workers (`WORKERS_UNREACHABLE`) y que `forge614-workers --version` imprime 1.0.0 o posterior (`WORKERS_OUTDATED`); si Workers aún rechaza las tareas por falta del candado, la ejecución termina con `READ_ONLY_UNSUPPORTED` en lugar de parecer completa sin ningún módulo analizado.
- **Informes que Engram rechaza:** un informe que Engram se niega a guardar porque su texto parece un secreto (`SECRET_REJECTED`) ya no derriba toda la ejecución; ese módulo se omite y queda listado en el nuevo campo `rejectedReportModuleNames` del informe final.
- **Órdenes nuevas:** `--help` (también `-h`, respondido en cualquier posición, así que `init --help` nunca inicia un análisis), `update` (ejecuta el instalador de la última versión publicada) y `uninstall` (elimina solo `<FORGE614_HOME>/atlas/` y el bloque de PATH propio de Atlas; es la orden que Engram llama cuando se desinstala a sí mismo, así que Engram puede desinstalarse de nuevo mientras Atlas está instalado). `uninstall` borra la carpeta antes de responder: nunca imprime `uninstalled` cuando el borrado falló (`UNINSTALL_FAILED`).
- **Salida de versión:** `--version` imprime `forge614-atlas X.Y.Z` en lugar del número solo, el formato en el que se apoyan `update` y los demás productos de Forge614.
- **`FORGE614_HOME`:** Atlas, `update`, `uninstall` y el instalador localizan Engram, Engines, Workers y su propia carpeta mediante `FORGE614_HOME` (ruta absoluta; `~/.forge614` si no está definida); un valor vacío o relativo responde `INVALID_FORGE614_HOME`.
- **Engram 1.8.7:** Atlas se compila contra Engram 1.8.7 (se requiere Bun 1.3.9 o posterior) y el proyecto entra al grupo `forge614` con su identidad portátil en `.forge614/project.json`.
- **Instalador:** antes de crear nada de Atlas, `install.sh` se asegura de tener Engram 1.8.7 o posterior (lo actualiza con `--force` si es anterior), Workers 1.0.0 o posterior (con el instalador publicado, sin `--force`) y un Engines 1.17.0 o posterior con el candado de solo lectura; cualquier fallo dice qué falta, termina con `Atlas was not changed.` y no deja ninguna carpeta ni línea de PATH.
- **Verificación:** el nuevo flujo `Verify` se ejecuta en cada push y cada pull request (Ubuntu y macOS) con Engines 1.17.0 y Workers 1.0.0 fijos; `release.yml` también se ejecuta en los pull requests que tocan la maquinaria de publicación, instala las dependencias propias de la copia de Engram y comprueba que este archivo tenga una entrada para la versión de `package.json`.
- **Documentación:** manuales, estado y un contrato de producto (`CONTRACT.md`, `CONTRACT.en.md`) actualizados para todo lo anterior; `README.md` y `README.en.md` separados, `SECURITY.md`, `LICENSE` y este changelog; una prueba mantiene iguales la versión de `package.json`, este archivo y el capítulo 10. Windows sigue siendo una deuda declarada.

## 1.0.0

Primera versión publicada de Forge614 Atlas: puntuación determinista de módulos, envío real de subagentes mediante Workers, sesiones progresivas de Engram y el instalador `curl | bash`.
