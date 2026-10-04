#!/usr/bin/env bash
set -euo pipefail

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

fail() { printf '%s\n' "$1" >&2; exit 1; }

# Oldest releases Atlas works with. The Engram version is the one Atlas is compiled against.
engram_min_version='1.8.7'
workers_min_version='1.0.0'
engines_min_version='1.17.0'
engram_hint='Install or update it with: curl -fsSL https://github.com/jotredev/forge614-engram/releases/latest/download/install.sh | bash'
workers_hint='Install or update it with: curl -fsSL https://github.com/jotredev/forge614-workers/releases/latest/download/install.sh | bash'
engines_hint='Install or update it with: curl -fsSL https://github.com/jotredev/forge614-engines/releases/latest/download/install.sh | bash'

path_marker_start='# >>> forge614-atlas PATH >>>'
path_marker_end='# <<< forge614-atlas PATH <<<'

manual_path_guidance() {
  local bin_dir="$1"
  printf '%s\n' 'Add this directory to your terminal PATH manually:'
  printf 'export PATH=%q:"$PATH"\n' "$bin_dir"
}

prepare_bin_directory() {
  local product_home
  if [ "$bin_dir" != "$forge_home/atlas/bin" ]; then
    mkdir -p -- "$bin_dir"
    [ -d "$bin_dir" ] && [ ! -L "$bin_dir" ] || return 1
    return 0
  fi
  product_home="$forge_home/atlas"
  [ ! -L "$forge_home" ] && { [ ! -e "$forge_home" ] || [ -d "$forge_home" ]; } || return 1
  if [ ! -e "$forge_home" ]; then mkdir -- "$forge_home" || return 1; chmod 700 "$forge_home" || return 1; fi
  [ ! -L "$product_home" ] && { [ ! -e "$product_home" ] || [ -d "$product_home" ]; } || return 1
  mkdir -p -- "$bin_dir" || return 1
  [ ! -L "$product_home" ] && [ ! -L "$bin_dir" ] || return 1
  chmod 700 "$product_home" "$bin_dir" || return 1
}

replace_path_marker_block() {
  local configuration_file="$1"
  local path_command="$2"
  local configuration_dir temporary_file existing_mode
  [ ! -L "$configuration_file" ] || return 1
  [ ! -e "$configuration_file" ] || [ -f "$configuration_file" ] || return 1
  configuration_dir="$(dirname -- "$configuration_file")"
  mkdir -p -- "$configuration_dir" || return 1
  temporary_file="$(mktemp "${configuration_file}.XXXXXX")" || return 1

  if [ -f "$configuration_file" ]; then
    existing_mode="$(stat -f '%Lp' -- "$configuration_file" 2>/dev/null)"
    if ! [[ "$existing_mode" =~ ^[0-7]+$ ]]; then
      existing_mode="$(stat -c '%a' -- "$configuration_file" 2>/dev/null)"
    fi
    if ! [[ "$existing_mode" =~ ^[0-7]+$ ]]; then
      existing_mode='644'
    fi
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
    existing_mode='644'
    : > "$temporary_file" || return 1
  fi

  printf '%s\n%s\n%s\n' "$path_marker_start" "$path_command" "$path_marker_end" >> "$temporary_file" || {
    rm -f -- "$temporary_file"
    return 1
  }
  chmod "$existing_mode" "$temporary_file" || {
    rm -f -- "$temporary_file"
    return 1
  }
  mv -f -- "$temporary_file" "$configuration_file" || { rm -f -- "$temporary_file"; return 1; }
}

publish_path_for_future_shell() {
  local bin_dir="$1"
  local configuration_file path_command
  case "${SHELL:-}" in
    */zsh|zsh)
      configuration_file="$HOME/.zshrc"
      path_command="$(printf 'case ":$PATH:" in\n  *:%q:*) ;;\n  *) export PATH=%q:"$PATH" ;;\nesac' "$bin_dir" "$bin_dir")"
      ;;
    */bash|bash)
      case "$(uname -s)" in
        Darwin)
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
      configuration_file="$HOME/.config/fish/conf.d/forge614-atlas.fish"
      path_command="$(printf 'if not contains -- %q $PATH\n  set -gx PATH %q $PATH\nend' "$bin_dir" "$bin_dir")"
      ;;
    *) return 2 ;;
  esac

  replace_path_marker_block "$configuration_file" "$path_command" || return 1
  printf 'Added %s to PATH in %s. Open a new terminal to use forge614-atlas.\n' "$bin_dir" "$configuration_file"
}

is_loopback_test_url() {
  local url="$1"
  local port
  [[ "$url" =~ ^http://(127\.0\.0\.1|localhost):([0-9]+)(/[^\?#]*)?$ ]] || return 1
  port="${BASH_REMATCH[2]}"
  (( 10#$port >= 1 && 10#$port <= 65535 ))
}

# Prints X.Y.Z when `<binary> --version` prints `<name> X.Y.Z`; fails otherwise (missing, not
# executable, no --version, other text). stdin is closed so an old binary that waits for input cannot hang.
installed_version() {
  local binary="$1" name="$2" output
  local pattern="^${name}[[:space:]]+([0-9]+\\.[0-9]+\\.[0-9]+)"
  [ -x "$binary" ] || return 1
  output="$("$binary" --version < /dev/null 2>/dev/null)" || return 1
  [[ "$output" =~ $pattern ]] || return 1
  printf '%s\n' "${BASH_REMATCH[1]}"
}

# Succeeds when X.Y.Z ($1) is at least the minimum X.Y.Z ($2).
version_at_least() {
  local found_major found_minor found_patch minimum_major minimum_minor minimum_patch
  IFS=. read -r found_major found_minor found_patch <<< "$1"
  IFS=. read -r minimum_major minimum_minor minimum_patch <<< "$2"
  (( 10#$found_major > 10#$minimum_major \
    || (10#$found_major == 10#$minimum_major && (10#$found_minor > 10#$minimum_minor \
    || (10#$found_minor == 10#$minimum_minor && 10#$found_patch >= 10#$minimum_patch))) ))
}

# Succeeds when `<binary> --version` prints `<name> X.Y.Z` with X.Y.Z at least the minimum ($3).
tool_is_compatible() {
  local found
  found="$(installed_version "$1" "$2")" || return 1
  version_at_least "$found" "$3"
}

# Downloads the published installer of another Forge614 product into $2 (a file inside $download_dir).
# $1 is the product name, $3 the default URL and $4 the name of the test-only override variable.
download_dependency_installer() {
  local product="$1" destination_file="$2" installer_url="$3" override_name="$4"
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

# Makes sure Engram is at least the version Atlas is compiled against. When it is older (or does not
# answer --version) the published installer updates it with --force, as Engram's own `update` does;
# when it is missing the installer runs without --force. Runs before anything of Atlas is created.
ensure_engram() {
  local engram_installer
  local installer_arguments=()
  if tool_is_compatible "$engram_command" forge614-engram "$engram_min_version"; then
    printf 'Forge614 Engram is compatible: %s\n' "$engram_command"
    return 0
  fi

  if [ -e "$engram_command" ] || [ -L "$engram_command" ]; then installer_arguments=(--force); fi
  printf 'Forge614 Engram %s or newer is required; installing the latest release.\n' "$engram_min_version"
  engram_installer="$download_dir/forge614-engram-install.sh"
  download_dependency_installer Engram "$engram_installer" \
    'https://github.com/jotredev/forge614-engram/releases/latest/download/install.sh' FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL
  FORGE614_HOME="$forge_home" bash "$engram_installer" ${installer_arguments[@]+"${installer_arguments[@]}"} < /dev/null \
    || fail "Forge614 Engram could not be installed or updated. Atlas was not changed. $engram_hint"
  tool_is_compatible "$engram_command" forge614-engram "$engram_min_version" \
    || fail "Forge614 Engram is still missing or older than ${engram_min_version}. Atlas was not changed. $engram_hint"
}

# Makes sure Workers is at least the minimum version, installing the latest release when it is missing
# or older (a Workers without --version counts as older). The installer runs WITHOUT --force: if
# something that is not a link sits where Workers goes, Workers refuses and Atlas installs nothing.
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
  tool_is_compatible "$workers_command" forge614-workers "$workers_min_version" \
    || fail "Forge614 Workers is still missing or older than ${workers_min_version}. Atlas was not changed. $workers_hint"
}

# Succeeds only when the installed Engines runs, is at least the minimum version and reports
# `supportsReadOnly: true` for Claude Code (same check as Workers' installer).
engines_is_compatible() {
  local capabilities
  tool_is_compatible "$engines_command" forge614-engines "$engines_min_version" || return 1
  capabilities="$("$engines_command" capabilities --agent claude-code < /dev/null 2>/dev/null)" || return 1
  grep -Eq '"supportsReadOnly"[[:space:]]*:[[:space:]]*true' <<< "$capabilities"
}

# Final check: Workers' own installer keeps Engines current when it installs, but a Workers that was
# already fine skips it, so Atlas asks again and never installs on top of an Engines without the lock.
ensure_engines() {
  engines_is_compatible \
    || fail "Forge614 Engines ${engines_min_version} or newer with the read-only lock (supportsReadOnly) is required, and the installed one is missing, older or does not guarantee it. Atlas was not changed. $engines_hint"
  printf 'Forge614 Engines is compatible: %s\n' "$engines_command"
}

repo='jotredev/forge614-atlas'
bin_dir=''
version=''
force=0
seen_bin_dir=0
seen_version=0

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

if [ -n "$version" ] && ! [[ "$version" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z][0-9A-Za-z.-]*)?$ ]]; then
  fail 'Invalid release tag. Use a semantic version tag such as v1.2.3.'
fi

# Same rule as the Atlas code (src/modules/forge-home): without the variable the Forge614 folder is
# ~/.forge614; with it, it must be a non-empty absolute path (an empty or relative one is an error).
if [ "${FORGE614_HOME+set}" = 'set' ]; then
  case "$FORGE614_HOME" in
    /*) forge_home="$FORGE614_HOME" ;;
    *) fail 'INVALID_FORGE614_HOME: FORGE614_HOME must be a non-empty absolute path.' ;;
  esac
else
  forge_home="${HOME:?HOME must be set}/.forge614"
fi
engram_command="$forge_home/engram/bin/forge614-engram"
workers_command="$forge_home/workers/bin/forge614-workers"
engines_command="$forge_home/engines/bin/forge614-engines"
if [ "$seen_bin_dir" -eq 0 ]; then bin_dir="$forge_home/atlas/bin"; fi

case "$bin_dir" in /*) ;; *) bin_dir="$PWD/$bin_dir" ;; esac
destination="$bin_dir/forge614-atlas"
[ ! -d "$destination" ] || fail 'The destination is a directory; choose a different --bin-dir.'
if { [ -e "$destination" ] || [ -L "$destination" ]; } && [ "$force" -ne 1 ]; then
  fail 'The command already exists. Use --force to replace it explicitly.'
fi

case "$(uname -s)/$(uname -m)" in
  Darwin/x86_64) artifact='forge614-atlas-darwin-x64' ;;
  Darwin/arm64) artifact='forge614-atlas-darwin-arm64' ;;
  Linux/x86_64) artifact='forge614-atlas-linux-x64' ;;
  Linux/aarch64) artifact='forge614-atlas-linux-arm64' ;;
  *) fail 'Unsupported operating system or architecture. Supported: macOS x64/arm64 and Linux x64/arm64.' ;;
esac

command -v curl >/dev/null 2>&1 || fail 'curl is required to download a release.'
if command -v shasum >/dev/null 2>&1; then
  checksum_tool='shasum'
elif command -v sha256sum >/dev/null 2>&1; then
  checksum_tool='sha256sum'
else
  fail 'A SHA-256 command is required: shasum or sha256sum.'
fi

selector='latest'
if [ -n "$version" ]; then selector="tags/$version"; fi
release_json_url="https://api.github.com/repos/${repo}/releases/${selector}"
curl_protocol='=https'
test_endpoint=0

# This endpoint is intentionally available only to the disposable installer tests.
# It is neither a supported installation option nor part of the user help.
if [ -n "${FORGE614_ATLAS_TEST_RELEASE_BASE_URL:-}" ]; then
  [ "${FORGE614_ATLAS_INSTALLER_TEST:-}" = '1' ] || fail 'The release endpoint override is reserved for test fixtures.'
  test_base_url="${FORGE614_ATLAS_TEST_RELEASE_BASE_URL%/}"
  is_loopback_test_url "$test_base_url" || fail 'The test release endpoint must be a loopback HTTP URL with an explicit numeric port.'
  release_json_url="${test_base_url}/repos/${repo}/releases/${selector}"
  curl_protocol='=http,https'
  test_endpoint=1
fi

download_dir="$(mktemp -d "${TMPDIR:-/tmp}/forge614-atlas-release.XXXXXX")"
staging=''
cleanup() {
  [ -z "$staging" ] || rm -f -- "$staging"
  rm -rf -- "$download_dir"
}
trap cleanup EXIT

download() {
  curl --fail --location --proto "$curl_protocol" --tlsv1.2 --silent --show-error "$1" --output "$2"
}

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

download "$release_json_url" "$download_dir/release.json" || fail 'Could not download release metadata.'
manifest_url="$(asset_url SHA256SUMS)" || fail 'The release is missing SHA256SUMS.'
binary_url="$(asset_url "$artifact")" || fail "The release is missing the ${artifact} binary."
if [ "$test_endpoint" -eq 1 ]; then
  is_loopback_test_url "$manifest_url" || fail 'Release metadata contains an unsafe test fixture URL.'
  is_loopback_test_url "$binary_url" || fail 'Release metadata contains an unsafe test fixture URL.'
else
  case "$manifest_url/$binary_url" in https://*/*) ;; *) fail 'Release assets must use HTTPS URLs.' ;; esac
fi

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

ensure_engram
ensure_workers
ensure_engines
prepare_bin_directory || fail 'Could not safely create the selected Atlas installation directory.'
[ ! -d "$destination" ] || fail 'The destination is a directory; choose a different --bin-dir.'
if { [ -e "$destination" ] || [ -L "$destination" ]; } && [ "$force" -ne 1 ]; then
  fail 'The command already exists. Use --force to replace it explicitly.'
fi
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
printf 'Installed: %s\n' "$destination"
if ! publish_path_for_future_shell "$bin_dir"; then
  printf '%s\n' 'Could not update PATH configuration automatically.'
  manual_path_guidance "$bin_dir"
fi
printf '%s\n' 'forge614-atlas init'
