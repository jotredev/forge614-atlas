# Plan 5 — Instalador (`curl | bash`, encadena Engram)

Status: Diseño en revisión. Complementa (no reemplaza) `2026-09-18-atlas-orchestrator-design.md` —
este documento cubre exclusivamente el empaquetado/distribución de Atlas; ninguna regla de diseño
ya decidida sobre el motor de análisis, Engram o Workers cambia aquí.

## 1. Qué resuelve este plan

Hasta el Plan 4, `forge614-atlas` solo se ejecuta desde el código fuente (`bun run` / `bun test`)
dentro de este repo. No existe forma de que una persona instale el binario de Atlas en su máquina
sin clonar el repo y tener Bun instalado. Este plan agrega el último eslabón del roadmap de Atlas
(5 de 5): un script de instalación público, un binario compilado autocontenido, y el workflow de
CI que los produce — igual patrón que ya existe y funciona hoy para `forge614-engram` (v1.5.0,
publicado) y `forge614-engines` (v1.11.0, publicado).

No se agrega ningún comando nuevo a `forge614-atlas` más allá de un `--version` mínimo (sección 6).
`init` sigue siendo el único comando funcional (decisión del Plan 3, sin cambios).

## 2. Alcance explícito: qué NO hace este instalador

Estas exclusiones son decisiones de diseño, no pendientes:

- **Cero registro de MCP.** El instalador nunca detecta asistentes de IA, nunca escribe
  configuración de MCP, y nunca invoca a `forge614-engines` ni a Shell. Regla ya vigente en
  `STATE.md`: "Atlas no registra el MCP por su cuenta." Ese trabajo ocurre en tiempo de ejecución
  (`forge614-atlas init`, ya implementado en el Plan 3), nunca en tiempo de instalación. Mismo
  patrón que el `install.sh` real de Engram, que tampoco toca nada de asistentes — eso vive en el
  comando interactivo `setup` de Engram, que Atlas ni siquiera tiene.
- **Solo macOS y Linux** (x64/arm64), igual que el alcance real (no el aspiracional) de Engram hoy.
  El spec de Engram menciona un `install.ps1` de Windows, pero ese archivo nunca se implementó — no
  existe en el repo. Este plan no lo agrega tampoco. Windows queda fuera de alcance por completo.
- **Sin instalador "desde código fuente".** Engram tiene un `scripts/install-from-source.sh`
  adicional (compilar localmente en vez de descargar un release). Fuera de alcance de este plan;
  puede agregarse después si hace falta.
- **Sin gestor de paquetes.** Nada de npm/Homebrew/Scoop en esta entrega — mismo out-of-scope que
  el spec de Engram.

## 3. Dependencia: encadenar solo a Engram, nunca a Engines directamente

Instalar Atlas requiere que existan Atlas, Engram y Engines en la máquina (contrato del
ecosistema, sección 8). El `install.sh` real de Engram **ya encadena e instala Engines por su
cuenta** (función `install_engines_dependency`) cuando falta. Por lo tanto, el instalador de Atlas
solo necesita encadenar a Engram — Engines llega sin que Atlas tenga que saber nada de él:

- Si `$HOME/.forge614/engram/bin/forge614-engram` ya existe y es ejecutable, no se toca.
- Si no existe, se descarga el `install.sh` real de Engram
  (`https://github.com/jotredev/forge614-engram/releases/latest/download/install.sh`) y se corre
  con `bash`. Ese script, al ejecutarse, resuelve Engines por su cuenta.
- Si la instalación de Engram falla, el instalador de Atlas se detiene ahí — nunca coloca el
  binario de Atlas sin su dependencia satisfecha.

Esta decisión evita duplicar en el repo de Atlas la lógica de "resolver Engines" que ya vive,
correcta y probada, en el repo de Engram. Si Engram mejora esa lógica en el futuro, Atlas la hereda
gratis en la siguiente ejecución del instalador (siempre resuelve `latest` salvo que el usuario fije
una versión).

## 4. Plataformas y artefactos

Cuatro artefactos, mismo esquema de nombres que Engram y Engines:

| Runner CI | Target de `bun build` | Nombre del artefacto |
|---|---|---|
| `macos-14` | `bun-darwin-arm64` | `forge614-atlas-darwin-arm64` |
| `macos-15-intel` | `bun-darwin-x64` | `forge614-atlas-darwin-x64` |
| `ubuntu-latest` | `bun-linux-x64` | `forge614-atlas-linux-x64` |
| `ubuntu-24.04-arm` | `bun-linux-arm64` | `forge614-atlas-linux-arm64` |

Detección en el script de instalación, vía `uname -s`/`uname -m` (idéntica a Engram):

```text
Darwin/x86_64  → forge614-atlas-darwin-x64
Darwin/arm64   → forge614-atlas-darwin-arm64
Linux/x86_64   → forge614-atlas-linux-x64
Linux/aarch64  → forge614-atlas-linux-arm64
otro           → falla: "Unsupported operating system or architecture."
```

## 5. Flujo de `scripts/install.sh`

Mismo esqueleto que el `install.sh` real de Engram, con nombres/rutas adaptados a Atlas:

1. Parsear flags: `--version TAG`, `--bin-dir PATH`, `--force`, `--help`. Validar `TAG` como
   semver (`^v?[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z][0-9A-Za-z.-]*)?$`) igual que Engram.
2. Resolver destino: `bin_dir` por defecto `$HOME/.forge614/atlas/bin`, destino
   `$bin_dir/forge614-atlas`. Si el destino ya existe y no se pasó `--force`, falla pidiendo
   `--force` explícito.
3. Detectar plataforma/arquitectura (sección 4); si no coincide con ninguna combinación soportada,
   falla ahí, antes de tocar la red.
4. Verificar que existan `curl` y una herramienta SHA-256 (`shasum` o `sha256sum`); si falta
   alguna, falla con mensaje claro.
5. Resolver la URL de metadata del release: `latest` o `tags/$version` contra
   `https://api.github.com/repos/jotredev/forge614-atlas/releases/<selector>`.
6. Descargar `release.json`, extraer de ahí las URLs de `SHA256SUMS` y del artefacto exacto
   (debe haber exactamente una coincidencia de cada uno; si no, falla).
7. Descargar `SHA256SUMS` y el binario; verificar HTTPS explícito en ambas URLs (salvo modo de
   prueba, sección 9).
8. Calcular el SHA-256 real del binario descargado y compararlo contra el que dice `SHA256SUMS`
   para ese artefacto exacto. Si no coincide, falla sin instalar nada.
9. **Encadenar Engram** (sección 3). Si falla, detener todo — el binario de Atlas nunca se coloca
   sin su dependencia satisfecha.
10. Crear `$bin_dir` de forma segura (mismos chequeos de symlink/permisos 700 que Engram cuando es
    la ruta por defecto bajo `~/.forge614/`).
11. Copiar el binario verificado a un archivo temporal dentro de `$bin_dir`, marcarlo ejecutable
    (`chmod 755`), y publicarlo de forma atómica en el destino final (`mv` con `--force`, `ln` +
    `rm` sin él, igual que Engram, para nunca dejar un binario a medio escribir si algo truena a
    mitad de camino).
12. Publicar `$bin_dir` en el PATH de la próxima terminal (bloque idempotente marcado en
    `~/.zshrc`, `~/.bashrc` (Linux) / `~/.bash_profile` (macOS), o
    `~/.config/fish/conf.d/forge614-atlas.fish`). Si la shell no se reconoce, no falla la
    instalación — imprime el comando `export PATH=...` exacto para agregarlo a mano.
13. Imprimir `Installed: <destino>` y terminar con: `forge614-atlas init` como siguiente paso
    sugerido.

Ninguna falla después del paso 9 (Engram ya instalado) puede hacer que el script revierta o borre
el binario de Atlas ya verificado — una falla de PATH, por ejemplo, solo imprime instrucciones
manuales y termina con código de salida 0 (mismo comportamiento que Engram).

## 6. `--version` mínimo en el CLI de Atlas

Hoy `src/interfaces/cli/main.ts` no reconoce `--version` ni `--help` — cualquier argumento no
reconocido cae en `UNKNOWN_COMMAND` con código de salida 1. Esto rompe el "smoke test" que el
workflow de release necesita correr sobre el binario recién compilado (Engram usa
`./binario --help` para esto). Se agrega:

- `forge614-atlas --version` → imprime la versión de `package.json` en texto plano (una línea) y
  sale con código 0. La versión se obtiene con un import estático de `package.json`
  (`import { version } from "../../../package.json"` — requiere agregar
  `"resolveJsonModule": true` a `tsconfig.json`, ya que Bun soporta imports de JSON de forma
  nativa mientras que `tsc --noEmit` necesita la bandera para no marcarlo como error).
- No se agrega `--help` con texto de ayuda largo en esta entrega (YAGNI) — el smoke test del
  workflow usa `--version`, no `--help`.
- El resto del contrato de `main.ts` no cambia: `init` sigue igual, cualquier otro comando
  desconocido sigue devolviendo el mismo JSON estructurado `UNKNOWN_COMMAND`.

## 7. `.github/workflows/release.yml`

Mismo esqueleto de 4 jobs que el workflow real de Engram, adaptado a Atlas:

- **`verify`**: `bun install --frozen-lockfile`, `bun test`, `bun run typecheck`,
  `git diff --check`, `bun test scripts/__tests__/install.sh.test.ts`, `bash -n scripts/install.sh`.
- **`build`** (matriz de 4, sección 4): `bun build ./src/interfaces/cli/main.ts --compile
  --target=<target> --outfile dist/<artifact>`, smoke test `./dist/<artifact> --version`, empaca en
  `.tar.gz` y sube como artifact de CI.
- **`assemble`**: descarga los 4 artifacts, genera `SHA256SUMS` con `sha256sum`, valida que los 4
  binarios existan, sean ejecutables, y que `SHA256SUMS` tenga exactamente 4 líneas válidas;
  corre `sha256sum --check SHA256SUMS` como verificación cruzada.
- **`publish`** (solo si el evento es un push de tag): crea el GitHub Release con `gh release
  create`, adjuntando los 4 binarios, `SHA256SUMS`, y `scripts/install.sh`; usa `--prerelease` si
  el tag contiene un guion (ej. `v1.0.0-rc.1`).

Disparadores: `push` sobre tags `v*`, y `workflow_dispatch` manual (igual que Engram).

## 8. Cómo se prueba, sin tocar GitHub real

Mismo patrón exacto que las pruebas reales de `scripts/install.sh.test.ts` de Engram, con nombres
de variable renombrados al espacio de Atlas para no chocar si algún día ambos instaladores corren
en el mismo entorno de pruebas:

- **Guarda doble obligatoria:** `FORGE614_ATLAS_INSTALLER_TEST=1` debe estar presente para que el
  script acepte cualquiera de las siguientes variables de override; sin ella, cualquier intento de
  usarlas falla explícitamente ("reserved for test fixtures").
- `FORGE614_ATLAS_TEST_RELEASE_BASE_URL`: debe ser una URL HTTP de loopback
  (`http://127.0.0.1:<puerto>` o `http://localhost:<puerto>`, puerto numérico explícito) — el
  script valida esto con una función `is_loopback_test_url` idéntica a la de Engram. Sustituye la
  base de `https://api.github.com` por este servidor local durante la prueba.
- `FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL`: debe ser una URL `file:///` local. Sustituye la URL
  real del instalador de Engram por un script mínimo de prueba (fixture) que simplemente crea el
  archivo `$HOME/.forge614/engram/bin/forge614-engram` esperado, sin descargar ni ejecutar nada
  real de Engram.
- **Fixtures desechables**, generadas en `mktemp -d` dentro del propio test (nunca commiteadas
  como archivo estático — mismo patrón que `discovery.test.ts` de Atlas y que las pruebas de
  Engram): un servidor HTTP local (`Bun.serve`) que sirve `release.json` con URLs
  `browser_download_url` apuntando a sí mismo, un binario dummy, y un `SHA256SUMS` calculado al
  vuelo con el hash real del binario dummy; y un script `install.sh` de Engram falso de una sola
  línea (fixture, no el real).
- **Casos a cubrir** (`scripts/__tests__/install.sh.test.ts`, TypeScript ejecutando el script via
  `Bun.spawn`, igual que Engram):
  1. Instalación limpia simulando cada una de las 4 combinaciones de plataforma (mockeando
     `uname` no es necesario — Engram prueba esto fijando `artifact` esperado según la plataforma
     real del runner de CI; este plan sigue el mismo criterio: en CI solo se verifica la
     combinación real del runner, más pruebas unitarias directas de la función de mapeo si se
     extrae como función pura).
  2. Checksum inválido → falla, no se crea el destino.
  3. Plataforma/arquitectura no soportada → falla antes de tocar la red.
  4. Engram ya instalado (`forge614-engram` ejecutable ya presente) → no se re-descarga ni
     re-ejecuta su instalador.
  5. Engram faltante → se descarga y corre el fixture del instalador de Engram, y el destino
     esperado de Engram queda creado.
  6. Falla la instalación de Engram (fixture que sale con código distinto de 0) → el instalador de
     Atlas se detiene, el binario de Atlas nunca se coloca.
  7. `--force` reemplaza un binario de Atlas ya existente; sin `--force`, falla si ya existe.
  8. Shell no reconocida (`$SHELL` vacío o desconocido) → imprime instrucción manual de PATH, sale
     con código 0, el binario queda instalado igual.
  9. `--bin-dir` personalizado se respeta como destino real.
- Además: `bash -n scripts/install.sh` (chequeo de sintaxis, ya incluido en el job `verify`) y
  pruebas normales de `bun test` para el nuevo `--version` de `main.ts`.

## 9. Archivos nuevos o modificados

- Crear: `scripts/install.sh`.
- Crear: `scripts/__tests__/install.sh.test.ts`.
- Crear: `.github/workflows/release.yml`.
- Modificar: `src/interfaces/cli/main.ts` (agregar `--version`).
- Modificar: `tsconfig.json` (agregar `"resolveJsonModule": true`).
- Ningún archivo de `src/modules/` se toca — este plan es puro empaquetado/distribución, no
  cambia ninguna lógica de análisis, Engram, o Workers ya construida en los Planes 1-4.

## 10. Publicar el primer release real (`v1.0.0`)

Decisión explícita del usuario para este plan (a diferencia del spec real de Engram, que dejó la
publicación del primer release fuera de alcance): al cerrar este plan — código fusionado a `main`,
suite en verde — se crea y empuja el tag `v1.0.0`, lo cual dispara `release.yml` en GitHub y
publica el primer Release público de `forge614-atlas` con sus 4 binarios y `SHA256SUMS`. Esta
acción requiere confirmación explícita del usuario en el momento de ejecutarla (es una acción
pública/visible e irreversible en el sentido de que un release publicado no se "des-publica"
limpiamente) — la aprobación general de este spec no sustituye esa confirmación puntual.

## 11. Salida y comunicación humana

El script imprime en texto plano (no JSON) — es un script de shell dirigido a un humano en una
terminal instalando el producto, no una salida de `forge614-atlas init` consumida por Shell u otro
programa. Esto es consistente con cómo ya se comporta el `install.sh` real de Engram.

## 12. Pruebas

Cobertura completa vía `bun test` (incluye el nuevo `scripts/__tests__/install.sh.test.ts`),
`bun run typecheck`, `git diff --check`, y `bash -n scripts/install.sh`. Antes de fusionar a
`main`: toda la suite existente de Atlas (Planes 1-4) debe seguir en verde sin cambios — este plan
no modifica ninguna lógica existente en `src/modules/`.
