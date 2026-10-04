#!/usr/bin/env bash
# Instalador de Forge614 Atlas: baja de GitHub el binario de una release publicada, verifica su huella SHA-256
# (código que identifica el contenido de un archivo), instala o actualiza Engram y Workers cuando faltan o son más
# viejos, comprueba Engines (si falta o no sirve, lo deja instalado el instalador de Workers), copia el binario a la
# carpeta elegida y, si puede, la agrega al PATH (la lista de carpetas donde la terminal busca programas). Los errores
# previstos terminan con `fail` (código 1); si una dependencia no se puede cumplir, no se instala nada de Atlas.
# Uso: bash scripts/install.sh [--version TAG] [--bin-dir PATH] [--force]; `--help` lo detalla.

# Termina ante un comando que falle fuera de una condición (`if`, `&&`, `||`), una variable sin definir (-u) o un fallo
# en cualquier parte de una tubería (comandos encadenados con `|`; pipefail).
set -euo pipefail

# Imprime la ayuda del instalador (la que muestra `--help`) en la salida estándar. No recibe argumentos y devuelve 0.
usage() {
  printf '%s\n' \
    'Install a verified Forge614 Atlas release binary.' \
    'Usage: bash scripts/install.sh [--version TAG] [--bin-dir PATH] [--force]' \
    'Default destination: $FORGE614_HOME (default $HOME/.forge614)/atlas/bin/forge614-atlas' \
    'FORGE614_HOME, when set, must be a non-empty absolute path; every Forge614 product is looked up there.' \
    '--force explicitly replaces an existing installation.' \
    'Requires Forge614 Engram 1.8.7 or newer, Forge614 Workers 1.0.0 or newer and Forge614 Engines 1.17.0 or newer' \
    'with the read-only lock (supportsReadOnly); Engram and Workers are installed when missing or too old.' \
    'Nothing of Atlas is installed when a requirement cannot be met.'
}

# Imprime el mensaje recibido ($1) en la salida de errores y termina todo el instalador con código 1.
fail() { printf '%s\n' "$1" >&2; exit 1; }

# Versiones más antiguas con las que funciona Atlas. La de Engram es la contra la que Atlas se compila.
engram_min_version='1.8.7'
workers_min_version='1.0.0'
engines_min_version='1.17.0'
engram_hint='Install or update it with: curl -fsSL https://github.com/jotredev/forge614-engram/releases/latest/download/install.sh | bash'
workers_hint='Install or update it with: curl -fsSL https://github.com/jotredev/forge614-workers/releases/latest/download/install.sh | bash'
engines_hint='Install or update it with: curl -fsSL https://github.com/jotredev/forge614-engines/releases/latest/download/install.sh | bash'

# Líneas que delimitan, en el archivo de configuración de la terminal, el bloque que este instalador agrega y reemplaza.
path_marker_start='# >>> forge614-atlas PATH >>>'
path_marker_end='# <<< forge614-atlas PATH <<<'

# Imprime las dos líneas con las que la persona puede agregar a mano la carpeta $1 al PATH (la lista de carpetas
# donde la terminal busca programas): un aviso y la orden `export PATH=...` con la ruta escapada por `%q`.
# Se usa cuando `publish_path_for_future_shell` devuelve algo distinto de 0 (no se pudo editar la configuración o la
# terminal no está soportada). Devuelve 0.
manual_path_guidance() {
  local bin_dir="$1"
  printf '%s\n' 'Add this directory to your terminal PATH manually:'
  printf 'export PATH=%q:"$PATH"\n' "$bin_dir"
}

# Crea la carpeta de destino ($bin_dir, variable global; también lee $forge_home) y, solo si es la de por omisión,
# deja sus permisos en modo 700. Devuelve 0 si quedó bien y 1 si alguna comprobación falla (por ejemplo, una carpeta
# que es un enlace simbólico, o sea, un acceso directo).
prepare_bin_directory() {
  local product_home
  # Carpeta distinta de la de por omisión (la elegida con --bin-dir): solo se crea (con sus padres) y se exige que sea
  # una carpeta real, no un enlace. No se le cambian los permisos.
  if [ "$bin_dir" != "$forge_home/atlas/bin" ]; then
    mkdir -p -- "$bin_dir"
    [ -d "$bin_dir" ] && [ ! -L "$bin_dir" ] || return 1
    return 0
  fi
  # Carpeta por omisión ($forge_home/atlas/bin): se revisa cada nivel antes de crearlo para que ninguno sea un enlace.
  product_home="$forge_home/atlas"
  # $forge_home no debe ser un enlace y, si existe, debe ser una carpeta.
  [ ! -L "$forge_home" ] && { [ ! -e "$forge_home" ] || [ -d "$forge_home" ]; } || return 1
  # Si $forge_home no existía, se crea con modo 700 (solo la persona dueña puede entrar).
  if [ ! -e "$forge_home" ]; then mkdir -- "$forge_home" || return 1; chmod 700 "$forge_home" || return 1; fi
  # Lo mismo para la carpeta de Atlas: ni enlace, ni algo que no sea carpeta.
  [ ! -L "$product_home" ] && { [ ! -e "$product_home" ] || [ -d "$product_home" ]; } || return 1
  mkdir -p -- "$bin_dir" || return 1
  # Se vuelve a comprobar que lo creado no sea un enlace y se dejan ambas carpetas en modo 700.
  [ ! -L "$product_home" ] && [ ! -L "$bin_dir" ] || return 1
  chmod 700 "$product_home" "$bin_dir" || return 1
}

# Deja en el archivo de configuración $1 un solo bloque delimitado por los marcadores, con el contenido $2 (la orden
# que agrega la carpeta al PATH). Conserva el resto del archivo, sin el bloque anterior si lo había, y también sus
# permisos. Escribe en un archivo temporal junto al original y lo mueve encima al final, así el original nunca
# queda a medias. Devuelve 0 si lo logra y 1 si el archivo es un enlace o no es un archivo normal, si los
# marcadores están desbalanceados o si falla cualquier paso (el temporal se borra si fallan `awk`, la escritura del
# bloque nuevo, el cambio de permisos o el movimiento).
replace_path_marker_block() {
  local configuration_file="$1"
  local path_command="$2"
  local configuration_dir temporary_file existing_mode
  # No se escribe a través de un enlace ni sobre algo que no sea un archivo normal.
  [ ! -L "$configuration_file" ] || return 1
  [ ! -e "$configuration_file" ] || [ -f "$configuration_file" ] || return 1
  configuration_dir="$(dirname -- "$configuration_file")"
  mkdir -p -- "$configuration_dir" || return 1
  temporary_file="$(mktemp "${configuration_file}.XXXXXX")" || return 1

  if [ -f "$configuration_file" ]; then
    # Se lee el modo (permisos) del archivo: `stat -f` es la forma de macOS; si no da un número octal (en Linux
    # esa opción significa otra cosa), se prueba `stat -c`; si tampoco, se usa 644.
    existing_mode="$(stat -f '%Lp' -- "$configuration_file" 2>/dev/null)"
    if ! [[ "$existing_mode" =~ ^[0-7]+$ ]]; then
      existing_mode="$(stat -c '%a' -- "$configuration_file" 2>/dev/null)"
    fi
    if ! [[ "$existing_mode" =~ ^[0-7]+$ ]]; then
      existing_mode='644'
    fi
    # awk copia el archivo sin las líneas del bloque marcado (de la línea de inicio a la de fin, ambas incluidas).
    # Sale con error si el bloque está mal formado: un inicio dentro de otro bloque, un fin sin inicio o un
    # inicio sin fin.
    awk -v start="$path_marker_start" -v end="$path_marker_end" '
      $0 == start {
        if (inside_block) { invalid = 1; exit 1 }
        inside_block = 1
        next
      }
      $0 == end {
        if (!inside_block) { invalid = 1; exit 1 }
        inside_block = 0
        next
      }
      !inside_block { print }
      END {
        if (invalid || inside_block) exit 1
      }
    ' "$configuration_file" > "$temporary_file" || {
      rm -f -- "$temporary_file"
      return 1
    }
  else
    # El archivo no existía: se crea con modo 644 y partiendo de un temporal vacío.
    existing_mode='644'
    : > "$temporary_file" || return 1
  fi

  # Al final del temporal se agrega el bloque nuevo: marcador de inicio, la orden y marcador de fin.
  printf '%s\n%s\n%s\n' "$path_marker_start" "$path_command" "$path_marker_end" >> "$temporary_file" || {
    rm -f -- "$temporary_file"
    return 1
  }
  chmod "$existing_mode" "$temporary_file" || {
    rm -f -- "$temporary_file"
    return 1
  }
  # El movimiento reemplaza el original en un solo paso.
  mv -f -- "$temporary_file" "$configuration_file" || { rm -f -- "$temporary_file"; return 1; }
}

# Agrega la carpeta $1 al PATH de las terminales nuevas, escribiendo en el archivo de configuración que corresponde
# a la terminal de la persona (variable SHELL), y avisa con un mensaje. Devuelve 0 si lo logra, 1 si no se pudo
# editar el archivo de forma segura (o si, en macOS con bash, crear `.bash_profile` dejaría sin efecto a otro archivo
# de inicio que ya existe) y 2 si la terminal o el sistema no están soportados. Quien la llama trata cualquier valor
# distinto de 0 como «hay que hacerlo a mano».
publish_path_for_future_shell() {
  local bin_dir="$1"
  local configuration_file path_command
  # Según la terminal se elige el archivo y la orden; `%q` escapa la ruta para que sea segura dentro de la orden.
  case "${SHELL:-}" in
    */zsh|zsh)
      configuration_file="$HOME/.zshrc"
      path_command="$(printf 'case ":$PATH:" in\n  *:%q:*) ;;\n  *) export PATH=%q:"$PATH" ;;\nesac' "$bin_dir" "$bin_dir")"
      ;;
    */bash|bash)
      case "$(uname -s)" in
        Darwin)
          # En macOS bash lee el primer archivo que exista entre .bash_profile, .bash_login y .profile. Si
          # .bash_profile no existe pero alguno de los otros sí, crearlo los dejaría sin efecto: no se toca nada.
          configuration_file="$HOME/.bash_profile"
          if [ ! -e "$configuration_file" ] && [ ! -L "$configuration_file" ]; then
            if [ -e "$HOME/.bash_login" ] || [ -L "$HOME/.bash_login" ] || [ -e "$HOME/.profile" ] || [ -L "$HOME/.profile" ]; then
              return 1
            fi
          fi
          ;;
        Linux) configuration_file="$HOME/.bashrc" ;;
        *) return 2 ;;
      esac
      path_command="$(printf 'case ":$PATH:" in\n  *:%q:*) ;;\n  *) export PATH=%q:"$PATH" ;;\nesac' "$bin_dir" "$bin_dir")"
      ;;
    */fish|fish)
      # fish usa otra sintaxis y un archivo propio de este instalador dentro de su carpeta conf.d.
      configuration_file="$HOME/.config/fish/conf.d/forge614-atlas.fish"
      path_command="$(printf 'if not contains -- %q $PATH\n  set -gx PATH %q $PATH\nend' "$bin_dir" "$bin_dir")"
      ;;
    *) return 2 ;;
  esac

  replace_path_marker_block "$configuration_file" "$path_command" || return 1
  printf 'Added %s to PATH in %s. Open a new terminal to use forge614-atlas.\n' "$bin_dir" "$configuration_file"
}

# Tiene éxito (0) solo si la dirección $1 es una URL de pruebas: `http://127.0.0.1:<puerto>` o
# `http://localhost:<puerto>`, con un puerto numérico explícito entre 1 y 65535 y una ruta opcional sin `?`, `#` ni `\`.
# Una dirección con usuario incrustado (como `http://127.0.0.1:5432@localhost:1`) no la cumple. Si no, devuelve 1.
is_loopback_test_url() {
  local url="$1"
  local port
  # La expresión regular (patrón de texto) exige esa forma exacta y deja el puerto en el grupo 2 de BASH_REMATCH (la
  # variable de bash donde quedan las partes del texto que coincidieron).
  [[ "$url" =~ ^http://(127\.0\.0\.1|localhost):([0-9]+)(/[^\?#]*)?$ ]] || return 1
  port="${BASH_REMATCH[2]}"
  # `10#` fuerza base decimal para que un puerto con ceros a la izquierda no se lea como octal (base 8).
  (( 10#$port >= 1 && 10#$port <= 65535 ))
}

# Imprime X.Y.Z cuando la salida de `<binario> --version` empieza con `<nombre> X.Y.Z` (lo que siga, como un sufijo
# `-rc.1`, se ignora); falla en cualquier otro caso (no existe, no es ejecutable, no acepta --version, otro texto). $1
# es la ruta del binario y $2 el nombre esperado. Al binario se le da una entrada vacía (/dev/null) para que uno viejo
# que espere datos no se quede colgado.
installed_version() {
  local binary="$1" name="$2" output
  local pattern="^${name}[[:space:]]+([0-9]+\\.[0-9]+\\.[0-9]+)"
  [ -x "$binary" ] || return 1
  output="$("$binary" --version < /dev/null 2>/dev/null)" || return 1
  [[ "$output" =~ $pattern ]] || return 1
  printf '%s\n' "${BASH_REMATCH[1]}"
}

# Tiene éxito (0) cuando X.Y.Z ($1) es al menos el mínimo X.Y.Z ($2); si es menor devuelve distinto de 0. Compara
# número por número (mayor, menor, parche), y `10#` evita que los ceros a la izquierda se lean como octal.
version_at_least() {
  local found_major found_minor found_patch minimum_major minimum_minor minimum_patch
  IFS=. read -r found_major found_minor found_patch <<< "$1"
  IFS=. read -r minimum_major minimum_minor minimum_patch <<< "$2"
  (( 10#$found_major > 10#$minimum_major \
    || (10#$found_major == 10#$minimum_major && (10#$found_minor > 10#$minimum_minor \
    || (10#$found_minor == 10#$minimum_minor && 10#$found_patch >= 10#$minimum_patch))) ))
}

# Tiene éxito (0) cuando `<binario> --version` imprime `<nombre> X.Y.Z` con X.Y.Z al menos el mínimo ($3). $1 es la
# ruta del binario y $2 el nombre esperado; devuelve 1 si no responde bien o es más viejo.
tool_is_compatible() {
  local found
  found="$(installed_version "$1" "$2")" || return 1
  version_at_least "$found" "$3"
}

# Descarga el instalador publicado de otro producto Forge614 en $2 (un archivo dentro de $download_dir).
# $1 es el nombre del producto, $3 la URL por omisión y $4 el nombre de la variable que la reemplaza solo en pruebas.
# Sin reemplazo solo se permite HTTPS; con reemplazo exige el modo de pruebas y una URL `file:///` local. Si la
# descarga falla termina el instalador con `fail`.
download_dependency_installer() {
  local product="$1" destination_file="$2" installer_url="$3" override_name="$4"
  # `${!override_name}` lee la variable cuyo nombre viene en $4 (expansión indirecta).
  local installer_proto='=https' override_url="${!override_name:-}"
  if [ -n "$override_url" ]; then
    [ "${FORGE614_ATLAS_INSTALLER_TEST:-}" = '1' ] || fail "The ${product} installer override is reserved for test fixtures."
    case "$override_url" in file:///*) ;; *) fail "The ${product} test installer must be a local file URL." ;; esac
    installer_url="$override_url"
    installer_proto='=https,file'
  fi
  curl --fail --location --proto "$installer_proto" --tlsv1.2 --silent --show-error "$installer_url" --output "$destination_file" \
    || fail "Could not download the Forge614 ${product} installer. Atlas was not changed."
}

# Se asegura de que Engram tenga al menos la versión contra la que se compila Atlas. Cuando es más viejo (o no
# responde --version), el instalador publicado lo actualiza con --force, como hace el `update` de Engram; cuando
# falta, el instalador corre sin --force. Corre antes de que se cree nada de Atlas. Devuelve 0 si Engram ya servía o
# quedó bien; si no, termina el instalador con `fail`.
ensure_engram() {
  local engram_installer
  local installer_arguments=()
  if tool_is_compatible "$engram_command" forge614-engram "$engram_min_version"; then
    printf 'Forge614 Engram is compatible: %s\n' "$engram_command"
    return 0
  fi

  # Si ya hay algo en esa ruta (archivo o enlace) se pide reemplazarlo con --force; si no hay nada, se instala sin él.
  if [ -e "$engram_command" ] || [ -L "$engram_command" ]; then installer_arguments=(--force); fi
  printf 'Forge614 Engram %s or newer is required; installing the latest release.\n' "$engram_min_version"
  engram_installer="$download_dir/forge614-engram-install.sh"
  download_dependency_installer Engram "$engram_installer" \
    'https://github.com/jotredev/forge614-engram/releases/latest/download/install.sh' FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL
  # El instalador de Engram corre con la misma carpeta Forge614 y sin entrada. La forma `${arreglo[@]+...}` expande
  # los argumentos solo si hay alguno, para que `set -u` no falle con el arreglo vacío en versiones viejas de bash.
  FORGE614_HOME="$forge_home" bash "$engram_installer" ${installer_arguments[@]+"${installer_arguments[@]}"} < /dev/null \
    || fail "Forge614 Engram could not be installed or updated. Atlas was not changed. $engram_hint"
  # Se vuelve a comprobar la versión: el instalador pudo terminar bien y aun así no dejar un Engram suficiente.
  tool_is_compatible "$engram_command" forge614-engram "$engram_min_version" \
    || fail "Forge614 Engram is still missing or older than ${engram_min_version}. Atlas was not changed. $engram_hint"
}

# Se asegura de que Workers tenga al menos la versión mínima, instalando la última release cuando falta o es más
# vieja (un Workers sin --version cuenta como más viejo). El instalador corre SIN --force: si en el lugar de Workers
# hay algo que no es un enlace, Workers se niega y Atlas no instala nada. Devuelve 0 si Workers ya servía o quedó
# bien; si no, termina el instalador con `fail`.
ensure_workers() {
  local workers_installer
  if tool_is_compatible "$workers_command" forge614-workers "$workers_min_version"; then
    printf 'Forge614 Workers is compatible: %s\n' "$workers_command"
    return 0
  fi

  printf 'Forge614 Workers %s or newer is required; installing the latest release.\n' "$workers_min_version"
  workers_installer="$download_dir/forge614-workers-install.sh"
  download_dependency_installer Workers "$workers_installer" \
    'https://github.com/jotredev/forge614-workers/releases/latest/download/install.sh' FORGE614_ATLAS_WORKERS_INSTALLER_TEST_URL
  FORGE614_HOME="$forge_home" bash "$workers_installer" < /dev/null \
    || fail "Forge614 Workers could not be installed. Atlas was not changed. $workers_hint"
  # Se vuelve a comprobar la versión tras el instalador, igual que con Engram.
  tool_is_compatible "$workers_command" forge614-workers "$workers_min_version" \
    || fail "Forge614 Workers is still missing or older than ${workers_min_version}. Atlas was not changed. $workers_hint"
}

# Tiene éxito (0) solo cuando el Engines instalado corre, tiene al menos la versión mínima y declara `supportsReadOnly:
# true` (garantiza el candado de solo lectura: que un ayudante no modifique archivos) en la respuesta de
# `capabilities --agent claude-code` (la misma comprobación que hace el instalador de Workers). Devuelve 1 si falla
# cualquiera de esas tres condiciones.
engines_is_compatible() {
  local capabilities
  tool_is_compatible "$engines_command" forge614-engines "$engines_min_version" || return 1
  capabilities="$("$engines_command" capabilities --agent claude-code < /dev/null 2>/dev/null)" || return 1
  grep -Eq '"supportsReadOnly"[[:space:]]*:[[:space:]]*true' <<< "$capabilities"
}

# Comprobación final: el instalador propio de Workers mantiene Engines al día cuando instala, pero un Workers que ya
# estaba bien se lo salta; por eso Atlas pregunta otra vez y nunca instala encima de un Engines sin el candado. No
# instala Engines, solo lo comprueba: si no sirve termina el instalador con `fail`; si sirve imprime su ruta.
ensure_engines() {
  engines_is_compatible \
    || fail "Forge614 Engines ${engines_min_version} or newer with the read-only lock (supportsReadOnly) is required, and the installed one is missing, older or does not guarantee it. Atlas was not changed. $engines_hint"
  printf 'Forge614 Engines is compatible: %s\n' "$engines_command"
}

# Valores iniciales: repositorio de las releases, carpeta de destino y versión sin elegir (se usa la última
# release) y banderas para saber si --force está puesto y si --bin-dir o --version ya se dieron.
repo='jotredev/forge614-atlas'
bin_dir=''
version=''
force=0
seen_bin_dir=0
seen_version=0

# Lee las opciones de la línea de comandos. --version y --bin-dir se aceptan una sola vez y exigen un valor que no
# empiece con `--`; --help (o -h) imprime la ayuda y sale con 0; cualquier otra opción termina con `fail`.
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --version)
      [ "$#" -ge 2 ] && [ -n "$2" ] && [ "$seen_version" -eq 0 ] || fail 'Specify one tag for --version.'
      case "$2" in --*) fail 'Specify a valid tag for --version.' ;; esac
      version="$2"
      seen_version=1
      shift 2 ;;
    --bin-dir)
      [ "$#" -ge 2 ] && [ -n "$2" ] && [ "$seen_bin_dir" -eq 0 ] || fail 'Specify one path for --bin-dir.'
      case "$2" in --*) fail 'Specify a valid path for --bin-dir.' ;; esac
      bin_dir="$2"
      seen_bin_dir=1
      shift 2 ;;
    --force) force=1; shift ;;
    *) fail 'Unknown option. See: bash scripts/install.sh --help' ;;
  esac
done

# La etiqueta de versión debe ser una versión semántica: X.Y.Z, con una `v` opcional al inicio y un sufijo opcional
# empiece con `-` o `.` (por ejemplo `-rc.1`).
if [ -n "$version" ] && ! [[ "$version" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z][0-9A-Za-z.-]*)?$ ]]; then
  fail 'Invalid release tag. Use a semantic version tag such as v1.2.3.'
fi

# Casi la misma regla que el código de Atlas (src/modules/forge-home): sin la variable, la carpeta Forge614 es
# ~/.forge614; con ella, debe ser una ruta absoluta no vacía (una vacía o relativa es un error). El código además
# normaliza la ruta (quita `..` y barras sobrantes); aquí se usa tal cual.
if [ "${FORGE614_HOME+set}" = 'set' ]; then
  case "$FORGE614_HOME" in
    /*) forge_home="$FORGE614_HOME" ;;
    *) fail 'INVALID_FORGE614_HOME: FORGE614_HOME must be a non-empty absolute path.' ;;
  esac
else
  forge_home="${HOME:?HOME must be set}/.forge614"
fi
# Ruta donde se espera el programa de cada dependencia; sin --bin-dir, Atlas va en $forge_home/atlas/bin.
engram_command="$forge_home/engram/bin/forge614-engram"
workers_command="$forge_home/workers/bin/forge614-workers"
engines_command="$forge_home/engines/bin/forge614-engines"
if [ "$seen_bin_dir" -eq 0 ]; then bin_dir="$forge_home/atlas/bin"; fi

# Una carpeta de destino relativa se vuelve absoluta con el directorio actual. Se falla pronto si el destino es una
# carpeta, o si ya existe (archivo o enlace) y no se pidió reemplazarlo con --force.
case "$bin_dir" in /*) ;; *) bin_dir="$PWD/$bin_dir" ;; esac
destination="$bin_dir/forge614-atlas"
[ ! -d "$destination" ] || fail 'The destination is a directory; choose a different --bin-dir.'
if { [ -e "$destination" ] || [ -L "$destination" ]; } && [ "$force" -ne 1 ]; then
  fail 'The command already exists. Use --force to replace it explicitly.'
fi

# Elige el nombre del binario de la release según el sistema operativo y la arquitectura (macOS y Linux, x64 y arm64).
case "$(uname -s)/$(uname -m)" in
  Darwin/x86_64) artifact='forge614-atlas-darwin-x64' ;;
  Darwin/arm64) artifact='forge614-atlas-darwin-arm64' ;;
  Linux/x86_64) artifact='forge614-atlas-linux-x64' ;;
  Linux/aarch64) artifact='forge614-atlas-linux-arm64' ;;
  *) fail 'Unsupported operating system or architecture. Supported: macOS x64/arm64 and Linux x64/arm64.' ;;
esac

# Herramientas necesarias: curl para descargar y shasum o sha256sum para calcular la huella SHA-256.
command -v curl >/dev/null 2>&1 || fail 'curl is required to download a release.'
if command -v shasum >/dev/null 2>&1; then
  checksum_tool='shasum'
elif command -v sha256sum >/dev/null 2>&1; then
  checksum_tool='sha256sum'
else
  fail 'A SHA-256 command is required: shasum or sha256sum.'
fi

# Dirección de la API de GitHub con los datos de la release: la última, o la del tag pedido con --version.
# Por omisión curl solo habla HTTPS (`curl_protocol`); `test_endpoint` indica si se usa la vía de pruebas.
selector='latest'
if [ -n "$version" ]; then selector="tags/$version"; fi
release_json_url="https://api.github.com/repos/${repo}/releases/${selector}"
curl_protocol='=https'
test_endpoint=0

# Este endpoint está disponible únicamente para las pruebas desechables del instalador.
# No es una opción de instalación soportada ni forma parte de la ayuda para el usuario.
# Exige además FORGE614_ATLAS_INSTALLER_TEST=1. Con él, la dirección base debe ser HTTP local (loopback: la propia
# máquina) y curl también puede usar HTTP.
if [ -n "${FORGE614_ATLAS_TEST_RELEASE_BASE_URL:-}" ]; then
  [ "${FORGE614_ATLAS_INSTALLER_TEST:-}" = '1' ] || fail 'The release endpoint override is reserved for test fixtures.'
  test_base_url="${FORGE614_ATLAS_TEST_RELEASE_BASE_URL%/}"
  is_loopback_test_url "$test_base_url" || fail 'The test release endpoint must be a loopback HTTP URL with an explicit numeric port.'
  release_json_url="${test_base_url}/repos/${repo}/releases/${selector}"
  curl_protocol='=http,https'
  test_endpoint=1
fi

# Carpeta temporal para todas las descargas; `cleanup` la borra al salir del instalador, con o sin error.
download_dir="$(mktemp -d "${TMPDIR:-/tmp}/forge614-atlas-release.XXXXXX")"
staging=''
# Borra el archivo temporal del binario (`staging`) si quedó alguno y la carpeta de descargas. Se ejecuta siempre al
# terminar el instalador (trap EXIT); no recibe argumentos.
cleanup() {
  [ -z "$staging" ] || rm -f -- "$staging"
  rm -rf -- "$download_dir"
}
trap cleanup EXIT

# Descarga la dirección $1 al archivo $2 usando solo los protocolos de `curl_protocol` (HTTPS; en modo de pruebas
# también HTTP) y TLS 1.2 (cifrado de la conexión) o más nuevo. Con --fail, un error HTTP del servidor hace que curl
# devuelva distinto de 0.
download() {
  curl --fail --location --proto "$curl_protocol" --tlsv1.2 --silent --show-error "$1" --output "$2"
}

# Imprime la dirección de descarga del archivo de la release cuyo nombre es $1, leyendo `release.json`: parte el
# JSON en cada `{`, saca los valores de `browser_download_url` y se queda con los que terminan con ese texto (basta
# que la dirección acabe igual que el nombre). Devuelve 1 si no hay exactamente uno.
asset_url() {
  local asset_name="$1"
  tr '{' '\n' < "$download_dir/release.json" \
    | sed -n 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"\([^"[:space:]]*\)".*/\1/p' \
    | awk -v asset_name="$asset_name" '
        substr($0, length($0) - length(asset_name) + 1) == asset_name {
          count += 1
          url = $0
        }
        END {
          if (count != 1) exit 1
          print url
        }
      '
}

# Baja los datos de la release y busca en ellos las direcciones del manifiesto SHA256SUMS y del binario de esta
# plataforma (cada una debe aparecer exactamente una vez).
download "$release_json_url" "$download_dir/release.json" || fail 'Could not download release metadata.'
manifest_url="$(asset_url SHA256SUMS)" || fail 'The release is missing SHA256SUMS.'
binary_url="$(asset_url "$artifact")" || fail "The release is missing the ${artifact} binary."
# En la vía de pruebas ambas direcciones deben ser HTTP locales. En la normal, esta comprobación solo exige que la del
# manifiesto empiece con https://; la del binario la limita `download`, que solo admite HTTPS.
if [ "$test_endpoint" -eq 1 ]; then
  is_loopback_test_url "$manifest_url" || fail 'Release metadata contains an unsafe test fixture URL.'
  is_loopback_test_url "$binary_url" || fail 'Release metadata contains an unsafe test fixture URL.'
else
  case "$manifest_url/$binary_url" in https://*/*) ;; *) fail 'Release assets must use HTTPS URLs.' ;; esac
fi

# Baja el manifiesto y el binario. La huella esperada sale del manifiesto (debe haber exactamente una línea válida para
# este binario, con 64 caracteres hexadecimales en minúscula); la real se calcula sobre lo descargado y deben coincidir.
download "$manifest_url" "$download_dir/SHA256SUMS" || fail 'Could not download SHA256SUMS.'
download "$binary_url" "$download_dir/$artifact" || fail "Could not download ${artifact}."
expected_digest="$(awk -v artifact="$artifact" '
  $2 == artifact && length($1) == 64 && $1 ~ /^[0-9a-f]+$/ { count += 1; digest = $1 }
  END { if (count != 1) exit 1; print digest }
' "$download_dir/SHA256SUMS")" || fail "SHA256SUMS does not contain one valid digest for ${artifact}."
if [ "$checksum_tool" = 'shasum' ]; then
  actual_digest="$(shasum -a 256 -- "$download_dir/$artifact" | awk '{print $1}')"
else
  actual_digest="$(sha256sum -- "$download_dir/$artifact" | awk '{print $1}')"
fi
[ "$expected_digest" = "$actual_digest" ] || fail "Checksum verification failed for ${artifact}."

# Dependencias, antes de crear nada de Atlas: Engram y Workers se instalan si faltan o son viejos; Engines solo se
# comprueba (si esos instaladores corren, el de Engram lo instala cuando falta y el de Workers cuando falta o no sirve).
ensure_engram
ensure_workers
ensure_engines
# Prepara la carpeta de destino y repite las dos comprobaciones del destino que se hicieron al inicio.
prepare_bin_directory || fail 'Could not safely create the selected Atlas installation directory.'
[ ! -d "$destination" ] || fail 'The destination is a directory; choose a different --bin-dir.'
if { [ -e "$destination" ] || [ -L "$destination" ]; } && [ "$force" -ne 1 ]; then
  fail 'The command already exists. Use --force to replace it explicitly.'
fi
# Copia el binario descargado a un archivo temporal en la carpeta de destino y le da permisos 755. Con --force lo
# mueve encima del destino (`mv -f`); sin --force crea un enlace duro con `ln` (un segundo nombre para el mismo
# archivo), que falla si el destino apareció mientras tanto, y luego borra el temporal. Después `staging` queda vacío
# porque ya no hay temporal que borrar.
staging="$(mktemp "$bin_dir/.forge614-atlas.XXXXXX")"
cp -- "$download_dir/$artifact" "$staging"
chmod 755 "$staging"
if [ "$force" -eq 1 ]; then
  mv -f -- "$staging" "$destination"
else
  ln -- "$staging" "$destination" || fail 'The command was created concurrently; rerun with --force only if replacement is intended.'
  rm -f -- "$staging"
fi
staging=''
# Informa la ruta instalada, intenta dejar la carpeta en el PATH de las terminales nuevas (si no puede, imprime cómo
# hacerlo a mano) y muestra el siguiente paso.
printf 'Installed: %s\n' "$destination"
if ! publish_path_for_future_shell "$bin_dir"; then
  printf '%s\n' 'Could not update PATH configuration automatically.'
  manual_path_guidance "$bin_dir"
fi
printf '%s\n' 'forge614-atlas init'
