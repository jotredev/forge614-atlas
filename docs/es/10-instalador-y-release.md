# 10. Instalador Público y Pipeline de Release

> **Estado:** Plan 5/5 completado y fusionado en `main` — el último plan del roadmap de Atlas.
> **Traducción hermana:** [10 (EN). Public Installer and Release Pipeline](../en/10-installer-and-release.md)

## Propósito

Los Planes 1-4 construyeron todo lo que Atlas *hace*. El Plan 5 construye cómo una persona realmente instala Atlas en su máquina: un instalador público `curl | bash`, un binario compilado autocontenido (sin Bun/Node en tiempo de ejecución — mismo patrón que `forge614-engram` y `forge614-engines`), y el pipeline de GitHub Actions que lo compila y publica.

No se agregó ningún comando nuevo a Atlas más allá de un `--version` mínimo en el CLI (usado por el propio smoke test del pipeline de release). `init` sigue siendo el único comando funcional, sin cambios.

## Alcance: qué NO hace el instalador a propósito

- **Cero registro de MCP.** El instalador nunca detecta asistentes de IA y nunca escribe configuración de MCP — esa regla ya estaba fija en `STATE.md` ("Atlas nunca registra el MCP por su cuenta") y se mantiene igual en tiempo de instalación que en tiempo de ejecución. Cualquier integración con asistentes la resuelve después el propio `forge614-atlas init`, vía `forge614-engines` — nunca este script.
- **Solo macOS y Linux** (x64/arm64), igual al alcance real y publicado de Engram hoy — no al spec de Engram, que menciona un `install.ps1` de Windows que nunca se llegó a construir. Windows queda completamente fuera de alcance para Atlas también.
- **Sin distribución por gestor de paquetes** (npm/Homebrew/Scoop) y sin variante de "instalación desde código fuente" — ambas explícitamente fuera de alcance de este plan.

## Encadenar solo a Engram — Engines llega gratis

Instalar Atlas completamente requiere tres componentes: Atlas, Engram y Engines (según el árbol de directorios del contrato del ecosistema bajo `~/.forge614/`). El instalador real y publicado de `forge614-engram` ya encadena e instala `forge614-engines` por su cuenta. Así que el instalador de Atlas encadena **solo** a Engram:

```bash
https://github.com/jotredev/forge614-engram/releases/latest/download/install.sh
```

Si `$HOME/.forge614/engram/bin/forge614-engram` ya existe y es ejecutable, no pasa nada. Si falta, se descarga y corre ese script real, que a su vez resuelve Engines por su cuenta. Esto mantiene la lógica de "cómo consigo Engines" viviendo en un solo lugar (el propio script de Engram) en vez de duplicarla en el de Atlas.

## El flujo de `install.sh`

Al correr `curl -fsSL https://raw.githubusercontent.com/jotredev/forge614-atlas/main/scripts/install.sh | bash`:

1. Parsea `--version TAG`, `--bin-dir PATH`, `--force`, `--help`.
2. Detecta plataforma/arquitectura (`Darwin/arm64`, `Darwin/x86_64`, `Linux/x86_64`, `Linux/aarch64`) — cualquier otra combinación falla de inmediato, antes de tocar la red.
3. Resuelve el release de GitHub (`latest` por defecto, o un tag fijo), descarga `SHA256SUMS` y el binario correspondiente solo por HTTPS.
4. **Verifica el checksum SHA-256 antes de crear cualquier otra cosa.** Ningún archivo bajo el directorio destino existe hasta que esto pasa — confirmado por una prueba explícita ("rejects a checksum mismatch before creating the destination").
5. Encadena el instalador de Engram (ver arriba). Si falla, toda la instalación se detiene — el binario propio de Atlas nunca se coloca sin su dependencia satisfecha.
6. Publica el binario verificado de forma atómica en `$HOME/.forge614/atlas/bin/forge614-atlas` (`mktemp` + `mv`/`ln`, nunca un archivo a medio escribir).
7. Publica esa carpeta en el PATH de la *siguiente* sesión de terminal (un bloque marcado e idempotente en `.zshrc`/`.bashrc`/`.bash_profile`/`conf.d` de fish). Una shell no reconocida no hace fallar la instalación — imprime la línea exacta `export PATH=...` para correr a mano y de todos modos sale con código 0.
8. Imprime `forge614-atlas init` como el siguiente comando a correr.

Ninguna falla después del paso 5 puede revertir o borrar un binario de Atlas ya verificado — una falla al publicar el PATH solo imprime instrucciones manuales.

## El pipeline de release (`.github/workflows/release.yml`)

Cuatro jobs, disparados al empujar un tag `v*` (o manualmente vía `workflow_dispatch`):

- **`verify`** — instala dependencias, corre la suite completa de pruebas y el typecheck, y (al empujar un tag) verifica que el tag coincida con la versión de `package.json`, para que un binario publicado nunca pueda reportar mal su propio `--version` en silencio.
- **`build`** — una matriz de 4 (`macos-14`/`macos-15-intel`/`ubuntu-latest`/`ubuntu-24.04-arm`) compila el binario de cada plataforma con `bun build --compile`, lo prueba con un smoke test de `--version`, y lo sube.
- **`assemble`** — junta los 4 binarios, genera `SHA256SUMS`, y valida cruzadamente cada checksum antes de que se publique nada.
- **`publish`** — crea el GitHub Release real con los 4 binarios, `SHA256SUMS`, y `scripts/install.sh` adjuntos, solo cuando el workflow corrió a partir de un push de tag real.

**Un hueco real que la revisión final de toda la rama encontró y corrigió:** como la dependencia propia de Atlas hacia `forge614-engram` es una ruta local (`file:../forge614-engram`, una decisión deliberada del Plan 2 para desarrollo local), un simple `actions/checkout` que solo trajera el repo de Atlas dejaba esa ruta sin resolver en cualquier runner real de GitHub Actions — `bun install --frozen-lockfile` habría fallado en la primerísima corrida real del pipeline. La corrección hace un checkout de `jotredev/forge614-engram` (fijado a su tag real y publicado `v1.5.0`) como carpeta hermana dentro del mismo job, calcando exactamente la estructura de desarrollo local, sin reabrir la decisión del Plan 2 sobre `file:../`.

## Cómo se prueba el instalador sin tocar la API real de GitHub

Mismo patrón ya probado del propio instalador real y publicado de Engram — ninguna prueba toca jamás `api.github.com` ni descarga nada real:

- Un conjunto de variables de entorno con doble guarda (`FORGE614_ATLAS_INSTALLER_TEST=1` debe estar presente antes de que se respete `FORGE614_ATLAS_TEST_RELEASE_BASE_URL` o `FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL`) redirige la API de release y el instalador de Engram encadenado hacia fixtures locales.
- `FORGE614_ATLAS_TEST_RELEASE_BASE_URL` además debe ser una URL HTTP de loopback con puerto numérico explícito; `FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL` debe ser una URL `file:///`. Ambas se validan antes de usarse, y cada URL de asset de release que devuelve el servidor de prueba se revalida contra el mismo chequeo de loopback — cerrando la vía por la cual el propio JSON de un fixture de prueba pudiera redirigir una descarga real a un host que no sea loopback.
- Cada prueba levanta un servidor HTTP local desechable (`Bun.serve`) con un binario ficticio y un checksum calculado al vuelo, y un stub de una sola línea del instalador de Engram — todo creado dentro de directorios `mktemp` en el momento de la prueba, nunca commiteado como archivo estático.

## Riesgo de diseño aceptado: el límite de confianza del instalador encadenado

El propio binario de Atlas se verifica por checksum antes de instalarse. El instalador de Engram que se encadena no — se descarga por HTTPS y se ejecuta directamente, a propósito (calcando exactamente cómo el propio instalador de Engram encadena a Engines). Esto significa que la cadena de confianza completa del ecosistema vía `curl | bash` queda acotada por quien controle los assets de release de Engram. Es un riesgo deliberado y aceptado del spec, no un descuido — documentado aquí y en `STATE.md` para que un lector futuro no lo confunda con un bug.

## Publicar el release real `v1.0.0`

Cerrar este plan incluye etiquetar y empujar `v1.0.0` — el primer release público de `forge614-atlas` — lo cual dispara el pipeline de arriba de verdad. La versión de `package.json` se subió de `0.1.0` a `1.0.0` como parte de este plan específicamente para ese primer release.
