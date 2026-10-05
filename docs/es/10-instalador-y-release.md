# 10. Instalador Público y Pipeline de Release

> **Estado:** Plan 5/5 completado y fusionado en `main` — el último plan del roadmap de Atlas.
> **Versión del producto:** `package.json`: versión `1.1.1`
> **Traducción hermana:** [10 (EN). Public Installer and Release Pipeline](../en/10-installer-and-release.md)

## Propósito

Los Planes 1-4 construyeron todo lo que Atlas *hace*. El Plan 5 construye cómo una persona realmente instala Atlas en su máquina: un instalador público `curl | bash`, un binario compilado autocontenido (sin Bun/Node en tiempo de ejecución — mismo patrón que `forge614-engram` y `forge614-engines`), y el pipeline de GitHub Actions que lo compila y publica.

Atlas 1.1.0 agregó después `--help`, `update` y `uninstall`, y hizo que `--version` imprima el nombre del producto (`forge614-atlas X.Y.Z`); ver el capítulo 08. `init` sigue siendo el único comando que analiza un proyecto.

## Alcance: qué NO hace el instalador a propósito

- **Cero registro de MCP.** El instalador nunca detecta asistentes de IA y nunca escribe configuración de MCP — esa regla ya estaba fija en `STATE.md` ("Atlas nunca registra el MCP por su cuenta") y se mantiene igual en tiempo de instalación que en tiempo de ejecución. Cualquier integración con asistentes la resuelve después el propio `forge614-atlas init`, vía `forge614-engines` — nunca este script.
- **Solo macOS y Linux** (x64/arm64). **Windows es una deuda declarada de 1.1.0**: el contrato del ecosistema pide que todo nodo publique binarios e instalador para macOS, Linux y Windows (regla 8 de su sección 8), y Atlas no lo hace — no hay `install.ps1` ni binario de Windows. Se dice aquí y en `CONTRACT.md` en vez de esconderlo, y no forma parte de esta versión.
- **Sin distribución por gestor de paquetes** (npm/Homebrew/Scoop) y sin variante de "instalación desde código fuente" — ambas explícitamente fuera de alcance de este plan.

## Qué asegura el instalador antes de crear nada

Atlas necesita tres componentes además de sí mismo: Engram (una copia de su código va compilada dentro del binario de Atlas, y Atlas comparte la base de memoria con el Engram instalado), Workers (que despacha los ayudantes) y Engines (que arma el comando de cada motor). Antes de crear nada de Atlas, el instalador comprueba los tres, en este orden, siempre dentro de la carpeta Forge614 (`$FORGE614_HOME` cuando la variable está definida, `$HOME/.forge614` si no — ver abajo):

1. **Engram, al menos 1.8.7** — la versión contra la que se compila Atlas 1.1.1, guardada en una sola variable del script (`engram_min_version`). `<carpeta forge614>/engram/bin/forge614-engram --version` (con la entrada cerrada) debe imprimir `forge614-engram X.Y.Z` con X.Y.Z de esa versión en adelante. Si no, el instalador descarga el instalador publicado de Engram (`https://github.com/jotredev/forge614-engram/releases/latest/download/install.sh`) y lo corre con `FORGE614_HOME` definida y la entrada cerrada — con `--force` cuando ya había un Engram (como hace el propio comando `update` de Engram) y sin él cuando no había ninguno — y vuelve a comprobar. Ese instalador necesita Node.js 22.19 o más nuevo y `tar`, e instala Shell y Engines por su cuenta cuando faltan.
2. **Workers, al menos 1.0.0.** `<carpeta forge614>/workers/bin/forge614-workers --version` debe imprimir `forge614-workers X.Y.Z` con X.Y.Z de 1.0.0 en adelante; un Workers que no responde a `--version` (como 0.1.0) cuenta como demasiado viejo, porque un Workers anterior ignora `readOnly` sin avisar. Si no, el instalador descarga el instalador publicado de Workers (`https://github.com/jotredev/forge614-workers/releases/latest/download/install.sh`) y lo corre **sin** `--force` (si en el lugar del comando de Workers hay algo que no es un enlace, Workers se niega y Atlas no instala nada, en vez de pisarlo), con `FORGE614_HOME` definida y la entrada cerrada, y vuelve a comprobar. El instalador de Workers mantiene Engines al día cuando instala.
3. **Engines, al menos 1.17.0 con el candado de solo lectura.** Este solo se comprueba, nunca se instala aquí: `<carpeta forge614>/engines/bin/forge614-engines --version` debe imprimir `forge614-engines X.Y.Z` con X.Y.Z de 1.17.0 en adelante y `capabilities --agent claude-code` debe decir `"supportsReadOnly": true`. Se comprueba al final porque un Workers que ya estaba bien se salta su propio paso de Engines.

Cada falla dice qué falta y termina con `Atlas was not changed.`, con salida 1, y después no existe nada de Atlas: ni carpeta, ni binario, ni línea de PATH.

### Dónde cae todo: `FORGE614_HOME`

El instalador aplica la misma regla que el código de Atlas (`src/modules/forge-home`): sin la variable, la carpeta Forge614 es `$HOME/.forge614`; con ella, debe ser una ruta absoluta no vacía, y si no el instalador se detiene con `INVALID_FORGE614_HOME: FORGE614_HOME must be a non-empty absolute path.` antes de crear o descargar nada. Las comprobaciones de dependencias, los instaladores de las dependencias (que reciben la variable) y el destino por defecto (`<carpeta forge614>/atlas/bin/forge614-atlas`) usan todos esa carpeta. `--bin-dir` sigue cambiando solo el destino del binario de Atlas.

## El flujo de `install.sh`

Al correr `curl -fsSL https://raw.githubusercontent.com/jotredev/forge614-atlas/main/scripts/install.sh | bash`:

1. Parsea `--version TAG`, `--bin-dir PATH`, `--force`, `--help`, y resuelve la carpeta Forge614 (`FORGE614_HOME`, ver arriba).
2. Detecta plataforma/arquitectura (`Darwin/arm64`, `Darwin/x86_64`, `Linux/x86_64`, `Linux/aarch64`) — cualquier otra combinación falla de inmediato, antes de tocar la red.
3. Resuelve el release de GitHub (`latest` por defecto, o un tag fijo), descarga `SHA256SUMS` y el binario correspondiente solo por HTTPS.
4. **Verifica el checksum SHA-256 antes de crear cualquier otra cosa.** Ningún archivo bajo el directorio destino existe hasta que esto pasa — confirmado por una prueba explícita ("rejects a checksum mismatch before creating the destination").
5. Asegura Engram, Workers y Engines (ver arriba). Si alguno no se puede cumplir, toda la instalación se detiene — el binario propio de Atlas nunca se coloca sin sus dependencias satisfechas.
6. Publica el binario verificado de forma atómica en `<FORGE614_HOME>/atlas/bin/forge614-atlas` (`$HOME/.forge614/atlas/bin/forge614-atlas` si `FORGE614_HOME` no está definida) (`mktemp` + `mv`/`ln`, nunca un archivo a medio escribir).
7. Publica esa carpeta en el PATH de la *siguiente* sesión de terminal (un bloque marcado e idempotente en `.zshrc`/`.bashrc`/`.bash_profile`/`conf.d` de fish). Una shell no reconocida no hace fallar la instalación — imprime la línea exacta `export PATH=...` para correr a mano y de todos modos sale con código 0.
8. Imprime `forge614-atlas init` como el siguiente comando a correr.

Ninguna falla después del paso 5 puede revertir o borrar un binario de Atlas ya verificado — una falla al publicar el PATH solo imprime instrucciones manuales.

## El pipeline de release (`.github/workflows/release.yml`)

Cuatro jobs, disparados al empujar un tag `v*`, manualmente vía `workflow_dispatch`, o por un pull request que toque `.github/workflows/release.yml`, la acción de dependencias `.github/actions/install-forge614-dependencies/action.yml` o `scripts/install.sh` (un pull request corre `verify`, `build` y `assemble`, nunca `publish`):

- **`verify`** — instala dependencias, instala Engines 1.17.0 y Workers 1.0.0 en esas versiones exactas (cada uno comprobado contra su checksum publicado) en un `FORGE614_HOME` desechable, corre la suite de pruebas salvo `init.test.ts` (el único archivo que necesita un Claude Code real y autenticado: resuelve `claude-code` y sus pruebas «completed» lo lanzan; `run-batch.test.ts` y `dispatch-modules.test.ts` sí corren, porque solo necesitan Workers y Engines y usan un script de prueba como motor de IA), corre el typecheck, `git diff --check` y `bash -n scripts/install.sh`, comprueba que `CHANGELOG.md` tenga una entrada `## <versión de package.json>`, y (al empujar un tag) verifica que el tag coincida con la versión de `package.json`, para que un binario publicado nunca pueda reportar mal su propio `--version` en silencio.
- **`build`** — una matriz de 4 (`macos-14`/`macos-15-intel`/`ubuntu-latest`/`ubuntu-24.04-arm`) compila el binario de cada plataforma con `bun build --compile`, lo prueba comprobando que `--version` imprime exactamente `forge614-atlas <versión de package.json>`, y lo sube.
- **`assemble`** — junta los 4 binarios, genera `SHA256SUMS`, y valida cruzadamente cada checksum antes de que se publique nada.
- **`publish`** — crea el GitHub Release real con los 4 binarios, `SHA256SUMS`, y `scripts/install.sh` adjuntos, solo cuando el workflow corrió a partir de un push de tag real.

**Un hueco real que la revisión final de toda la rama encontró y corrigió:** como la dependencia propia de Atlas hacia `forge614-engram` es una ruta local (`file:../forge614-engram`, una decisión deliberada del Plan 2 para desarrollo local), un simple `actions/checkout` que solo trajera el repo de Atlas dejaba esa ruta sin resolver en cualquier runner real de GitHub Actions — `bun install --frozen-lockfile` habría fallado en la primerísima corrida real del pipeline. La corrección hace un checkout de `jotredev/forge614-engram` como carpeta hermana dentro del mismo job, fijado a un único tag de release guardado en una sola variable del workflow (`ENGRAM_REF`, hoy `v1.8.7`), e instala las dependencias propias de esa copia (`bun install --frozen-lockfile` dentro de ella) antes de instalar o compilar Atlas, calcando la estructura de desarrollo local, sin reabrir la decisión del Plan 2 sobre `file:../`. Sin ese segundo paso la copia de Engram falla con `Could not resolve: "zod"`.

### El workflow `Verify` (`.github/workflows/verify.yml`)

Separado del pipeline de release, corre en cada push y en cada pull request, en `ubuntu-latest` y `macos-latest`, con Bun 1.4.2. Hace la misma preparación que `verify` de arriba (la copia de Engram en `ENGRAM_REF`, con su propio `bun install --frozen-lockfile`, y luego el de Atlas; Engines y Workers fijos en un `FORGE614_HOME` desechable) y luego corre la misma suite de pruebas (todas salvo `init.test.ts`), el typecheck, `git diff --check` y `bash -n scripts/install.sh`. `main` no tiene protección de rama en 1.1.0; este workflow es la forma de notar un cambio roto antes de un tag.

## Cómo se prueba el instalador sin tocar la API real de GitHub

Mismo patrón ya probado del propio instalador real y publicado de Engram — ninguna prueba toca jamás `api.github.com` ni descarga nada real:

- Un conjunto de variables de entorno con doble guarda (`FORGE614_ATLAS_INSTALLER_TEST=1` debe estar presente antes de que se respete `FORGE614_ATLAS_TEST_RELEASE_BASE_URL`, `FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL` o `FORGE614_ATLAS_WORKERS_INSTALLER_TEST_URL`) redirige la API de release y los instaladores de Engram y de Workers hacia fixtures locales.
- `FORGE614_ATLAS_TEST_RELEASE_BASE_URL` además debe ser una URL HTTP de loopback con puerto numérico explícito; `FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL` y `FORGE614_ATLAS_WORKERS_INSTALLER_TEST_URL` deben ser URL `file:///`. Todas se validan antes de usarse, y cada URL de asset de release que devuelve el servidor de prueba se revalida contra el mismo chequeo de loopback — cerrando la vía por la cual el propio JSON de un fixture de prueba pudiera redirigir una descarga real a un host que no sea loopback.
- Cada prueba levanta un servidor HTTP local desechable (`Bun.serve`) con un binario ficticio y un checksum calculado al vuelo, más instaladores FALSOS de Engram y de Workers y un binario FALSO de Engines que anotan cómo se les llamó — todo creado dentro de directorios temporales en el momento de la prueba, nunca commiteado como archivo estático, y siempre con un `HOME` y un `FORGE614_HOME` temporales, nunca los reales. Las pruebas cubren: una instalación limpia que corre los dos instaladores; Engram 1.8.7 y Workers 1.0.0 que ya estaban bien (ninguno de los dos instaladores corre); Engram 1.5.0 actualizado con `--force`; Workers 0.1.0 o sin `--version` instalado; un instalador de Workers que falla, un Engram que sigue viejo y un Engines sin `supportsReadOnly` (no se crea nada de Atlas y la salida es 1); un `FORGE614_HOME` absoluto que recibe todo; y uno vacío o relativo que responde `INVALID_FORGE614_HOME` sin crear nada.

## Riesgo de diseño aceptado: el límite de confianza de los instaladores encadenados

El propio binario de Atlas se verifica por checksum antes de instalarse. Los instaladores de Engram y de Workers que corre no — cada uno se descarga por HTTPS y se ejecuta directamente, a propósito (calcando exactamente cómo el propio instalador de Engram encadena a Shell y a Engines). Esto significa que la cadena de confianza completa del ecosistema vía `curl | bash` queda acotada por quien controle los assets de release de Engram y de Workers. Es un riesgo deliberado y aceptado del spec, no un descuido — documentado aquí y en `STATE.md` para que un lector futuro no lo confunda con un bug.

## Publicar los releases

`v1.0.0` fue el primer release público de `forge614-atlas`; la versión de `package.json` se subió de `0.1.0` a `1.0.0` para él. La versión 1.1.0 queda preparada en el repositorio (changelog, README en los dos idiomas, `LICENSE`, `SECURITY.md`) y se publica aparte, empujando el tag `v1.1.0`, lo cual dispara el pipeline de arriba. Una prueba (`test/versions.test.ts`) mantiene iguales `package.json`, `CHANGELOG.md` y la línea de versión de este capítulo en los dos idiomas.
