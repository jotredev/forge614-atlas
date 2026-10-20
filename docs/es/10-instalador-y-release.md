# 10. Instalador Público y Pipeline de Release

> **Estado:** Instalador único adoptado para Atlas 1.2.0.
> **Versión del producto:** `package.json`: versión `1.2.0`
> **Traducción hermana:** [10 (EN). Public Installer and Release Pipeline](../en/10-installer-and-release.md)

## Propósito

Los Planes 1-4 construyeron la lógica de análisis y despacho de Atlas. El Plan 5 construyó el instalador público inicial, y en la versión 1.2.0 Atlas adoptó el estándar del instalador único de Forge614 (`forge614-ai`), basado en porteros nativos (`install.sh`, `install.ps1`), el motor universal `install.mjs` y el puntero declarativo de nodo `forge614.node.json`. El binario compilado sigue siendo autocontenido y no requiere Node.js ni Bun en tiempo de ejecución.

## Alcance: qué NO hace el instalador a propósito

- **Cero registro de MCP.** El instalador nunca detecta asistentes de IA y nunca escribe configuración de MCP. Cualquier integración con asistentes la resuelve después el propio `forge614-atlas init`, vía `forge614-engines`.
- **Solo macOS y Linux** (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`). **Windows queda excluido formalmente en 1.2.0** conforme a la Decisión 2 de arquitectura (`docs/decisions/0002-windows-omitted-1-2-0.md`). Los instaladores detectan Windows y se detienen limpiamente sin alterar el sistema.
- **Sin distribución por gestor de paquetes** (npm/Homebrew/Scoop) y sin variante de "instalación desde código fuente".

## Requisitos y dependencias del ecosistema

El instalador y el portero requieren **Node.js 22.19.0 o posterior** para ejecutarse en la máquina local.

Atlas declara sus dependencias en `forge614.node.json`:
1. **Engram, al menos 1.10.0** — la versión contra la que se compila Atlas 1.2.0. Si Engram falta o es anterior (como 1.9.0), el instalador descarga y ejecuta el instalador oficial de Engram para actualizarlo a 1.10.0.
2. **Workers, al menos 1.0.0** — requerido para despachar tareas con el candado de solo lectura. Si falta, el instalador lo descarga y lo instala.
3. **Engines, al menos 1.17.0** — requerido con soporte de solo lectura (`supportsReadOnly: true`).

Cualquier falla en los requisitos detiene la instalación con un mensaje explicativo y código de salida no nulo, sin dejar carpetas huérfanas ni líneas residuales en el PATH.

### Dónde cae todo: `FORGE614_HOME`

El instalador aplica la misma regla que el código de Atlas (`src/modules/forge-home`): sin la variable, la carpeta Forge614 es `$HOME/.forge614`; con ella, debe ser una ruta absoluta no vacía, y si no el instalador se detiene con `INVALID_FORGE614_HOME: FORGE614_HOME must be a non-empty absolute path.` antes de crear o descargar nada.

## El flujo de `install.sh` e `install.mjs`

Al correr `curl -fsSL https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh | bash`:

1. El portero `install.sh` comprueba que exista Node.js 22.19.0+.
2. Resuelve el tag (`latest` o `--version X.Y.Z`).
3. Descarga `install.mjs`, `forge614.node.json` y `SHA256SUMS` del release, verificando los checksums criptográficos SHA-256 de forma estricta.
4. Invoca `node install.mjs` pasando las opciones recibidas (`--version`, `--uninstall`, etc.).
5. `install.mjs` resuelve el grafo de dependencias en `FORGE614_HOME`, descarga el binario correspondiente a la arquitectura (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`), valida su checksum GNU SHA-256 y realiza una prueba de humo del ejecutable en staging (`forge614-atlas --version`).
6. Enlaza el binario en `<FORGE614_HOME>/atlas/bin/forge614-atlas` y publica la ruta en el PATH del perfil del usuario (`.zshrc`, `.bashrc`, `.bash_profile`, o fish) entre los marcadores `# >>> forge614-atlas PATH >>>` y `# <<< forge614-atlas PATH <<<`.

## Comandos de ciclo de vida en el CLI

Atlas 1.2.0 ofrece un contrato unificado para mantenimiento del producto:

- `--version` (o `-v`) imprime `forge614-atlas 1.2.0`. Si se añade `--json`, imprime el sobre estructurado `{"schemaVersion":1,"name":"forge614-atlas","version":"1.2.0"}`.
- `--help` (o `-h`) imprime la ayuda en cualquier posición, saliendo con 0 sin tocar nada en el disco.
- `update [--version X.Y.Z] [--json]` descarga el portero de la versión pedida (o la última publicada), verifica su integridad con SHA-256 y corre la actualización; responde en texto o en JSON con `{"schemaVersion":1,"status":"updated","updated":true|false,"previousVersion":"...","installedVersion":"..."}`.
- `uninstall [--from forge614-engram] [--confirmed] [--json] [--self]`:
  - Si el directorio actual de trabajo (`cwd`) está dentro de `<FORGE614_HOME>/atlas`, la desinstalación se rechaza de inmediato con `UNINSTALL_FAILED` (salida 1) para prevenir borrados inseguros.
  - La opción `--self` (usada por `install.mjs --uninstall`) desinstala integraciones locales y retorna `{"schemaVersion":1,"result":{"integrationsRemoved":true}}` con salida 0.
  - La opción `--from forge614-engram` permite que Engram coordine la desinstalación en cascada.
  - La desinstalación retira únicamente la carpeta `<FORGE614_HOME>/atlas/` y el bloque de PATH propio, conservando siempre intactos los recuerdos y la base de datos en `FORGE614_HOME/memory/`.

## Pipeline de CI y Release

- **`verify-platforms.yml`**: ejecuta la suite completa de pruebas unitarias y de integración, las pruebas de ciclo de vida e instalador E2E (`test/e2e-installer.test.ts`), y la compilación y prueba de humo de los 4 binarios nativos en corredores de macOS y Ubuntu (`macos-15`, `macos-15-intel`, `ubuntu-24.04-arm`, `ubuntu-24.04`).
- **`release.yml`**: ensambla los binarios compilados, el conjunto de instaladores (`install.sh`, `install.ps1`, `install.mjs`, `forge614.node.json`), genera el archivo canónico `SHA256SUMS` mediante `scripts/prepare-release-assets.mjs` y publica el release en GitHub al recibir un tag `v*`.

## Pruebas de ciclo de vida e instalador E2E

El conjunto `test/e2e-installer.test.ts` valida el ciclo de vida sin depender de la red pública:
1. Instalación limpia con portero desde un `FORGE614_HOME` vacío.
2. Migración real desde Atlas 1.1.2 a 1.2.0 en un único `update`, usando un proxy TLS local para interceptar peticiones a `github.com` y garantizando un bloque PATH único y limpio.
3. Actualización de Engram 1.9.0 a 1.10.0 y migración automática de recuerdos desde `engram/` a `memory/`.
4. Desinstalación segura con rechazo en cwd, remoción de carpeta y PATH, y preservación de memoria.
5. Desinstalación desde el desinstalador nativo de Engram 1.10.0.
6. Desinstalación mediante `install.mjs --uninstall` invocando `uninstall --self`.
