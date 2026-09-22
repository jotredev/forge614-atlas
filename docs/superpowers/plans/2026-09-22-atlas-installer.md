# Plan 5 — Instalador de Atlas (`curl | bash`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a `forge614-atlas` un script público de instalación (`curl | bash`), un binario
compilado autocontenido para macOS/Linux, y el workflow de CI que los produce y publica — cerrando
el último plan (5 de 5) del roadmap de Atlas.

**Architecture:** Un script Bash (`scripts/install.sh`) descarga, verifica por checksum, e instala
el binario de Atlas, encadenando la instalación de `forge614-engram` (que a su vez ya instala
`forge614-engines` por su cuenta). Un workflow de GitHub Actions (`.github/workflows/release.yml`)
compila el binario con `bun build --compile` para 4 combinaciones de plataforma/arquitectura y
publica un GitHub Release cuando se empuja un tag `v*`. Se agrega un `--version` mínimo al CLI de
Atlas para poder verificar ("smoke test") el binario recién compilado antes de publicarlo.

**Tech Stack:** Bash (`set -euo pipefail`), Bun (`bun:test`, `Bun.serve`, `Bun.spawn`), TypeScript,
GitHub Actions, `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-09-22-atlas-installer-design.md`

## Global Constraints

- Solo macOS y Linux (x64/arm64) — nunca Windows/`install.ps1` en este plan.
- El instalador nunca registra MCP ni toca configuración de asistentes de IA — cero excepciones.
- El instalador encadena **solo** a `forge614-engram` (nunca a `forge614-engines` directamente); la
  URL real del instalador de Engram es
  `https://github.com/jotredev/forge614-engram/releases/latest/download/install.sh`.
- Repo real de Atlas: `jotredev/forge614-atlas`. Destino por defecto del binario:
  `$HOME/.forge614/atlas/bin/forge614-atlas`.
- Ninguna falla después de tener Engram instalado puede revertir o borrar el binario de Atlas ya
  verificado — una falla de PATH solo imprime instrucciones manuales y sale con código 0.
- Pruebas del script **nunca** tocan la API real de GitHub ni descargan nada real de internet:
  toda prueba usa un servidor HTTP de loopback (`Bun.serve`) y fixtures desechables en `mktemp`,
  activadas solo con la guarda doble `FORGE614_ATLAS_INSTALLER_TEST=1` +
  `FORGE614_ATLAS_TEST_RELEASE_BASE_URL`/`FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL`.
- El script imprime en texto plano (no JSON) — es para un humano en una terminal.
- Ningún archivo de `src/modules/` se toca en este plan; la suite completa de los Planes 1-4 debe
  seguir en verde sin cambios.
- Referencias reales, ya existentes y funcionando en un repo hermano en el mismo `Desktop`, para
  copiar patrones (no reinventar sintaxis Bash desde cero):
  `/Users/jorgeetrejoo/Desktop/forge614-engram/scripts/install.sh` y
  `/Users/jorgeetrejoo/Desktop/forge614-engram/.github/workflows/release.yml`. Este plan ya incluye
  el código completo adaptado — solo hace falta leer esos archivos si algo en el código de abajo no
  queda claro.

---

### Task 1: `--version` en el CLI de Atlas

**Files:**
- Modify: `src/interfaces/cli/main.ts`
- Modify: `tsconfig.json`
- Create: `src/interfaces/cli/main.test.ts`

**Interfaces:**
- Consumes: nada de tareas previas (tarea independiente).
- Produces: `forge614-atlas --version` imprime la versión de `package.json` en una línea y sale con
  código 0. Usado por el smoke test del workflow de release (Task 4).

- [ ] **Step 1: Agregar `resolveJsonModule` a `tsconfig.json`**

Reemplazar el contenido completo de `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["bun-types"]
  }
}
```

- [ ] **Step 2: Escribir la prueba que falla**

Crear `src/interfaces/cli/main.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { version } from "../../../package.json";

const entrypoint = resolve(import.meta.dir, "main.ts");

test("--version prints the package version and exits 0", async () => {
  const child = Bun.spawn(["bun", entrypoint, "--version"], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  expect(exitCode).toBe(0);
  expect(stdout.trim()).toBe(version);
});

test("an unknown command still returns the structured UNKNOWN_COMMAND error", async () => {
  const child = Bun.spawn(["bun", entrypoint, "--bogus"], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  const payload = JSON.parse(stdout) as { status: string; error: { code: string } };
  expect(exitCode).toBe(1);
  expect(payload.status).toBe("error");
  expect(payload.error.code).toBe("UNKNOWN_COMMAND");
});
```

- [ ] **Step 3: Correr la prueba y confirmar que falla**

Run: `bun test src/interfaces/cli/main.test.ts`
Expected: FAIL — el primer test falla porque `--version` cae hoy en `UNKNOWN_COMMAND` con código
de salida 1, no imprime la versión ni sale con código 0.

- [ ] **Step 4: Implementar `--version` en `main.ts`**

Reemplazar el contenido completo de `src/interfaces/cli/main.ts`:

```typescript
#!/usr/bin/env bun
import { version } from "../../../package.json";
import { runInit } from "./commands";

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "--version") {
    console.log(version);
    return;
  }

  if (command === "init") {
    const engine = flag(rest, "--engine");
    const force = rest.includes("--force");
    await runInit(process.cwd(), engine, force);
    return;
  }

  console.log(
    JSON.stringify(
      { schemaVersion: 1, status: "error", error: { code: "UNKNOWN_COMMAND", argv: process.argv.slice(2) } },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}

main().catch(error => {
  // main() ahora es async (Task 8 del Plan 4: runInitCommand pasó a async por el streaming
  // de eventos de Workers) — sin este .catch(), un error inesperado se volvería un
  // unhandled promise rejection en vez de una salida estructurada, y Node podría
  // imprimir su propio texto (no JSON) a stderr antes de salir con código 1.
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        status: "error",
        error: { code: "UNEXPECTED_ERROR", message: error instanceof Error ? error.message : String(error) },
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
```

- [ ] **Step 5: Correr la prueba y confirmar que pasa**

Run: `bun test src/interfaces/cli/main.test.ts`
Expected: PASS (2 tests, 0 fallas).

- [ ] **Step 6: Typecheck y commit**

Run: `bun run typecheck` → debe salir limpio (código 0).

```bash
git add tsconfig.json src/interfaces/cli/main.ts src/interfaces/cli/main.test.ts
git commit -m "feat: add --version to the Atlas CLI entrypoint"
```

---

### Task 2: `scripts/install.sh` — flujo central de descarga, verificación e instalación

**Files:**
- Create: `scripts/install.sh`
- Create: `scripts/__tests__/install.sh.test.ts`

**Interfaces:**
- Consumes: nada de Task 1 (archivo independiente).
- Produces: el script `scripts/install.sh` ejecutable con flags `--help`, `--version TAG`,
  `--bin-dir PATH`, `--force`; variables de entorno de prueba `FORGE614_ATLAS_INSTALLER_TEST` y
  `FORGE614_ATLAS_TEST_RELEASE_BASE_URL`; funciones internas `fail`, `usage`,
  `manual_path_guidance`, `prepare_bin_directory`, `replace_path_marker_block`,
  `publish_path_for_future_shell`, `is_loopback_test_url`, `download`, `asset_url`. Task 3 extiende
  este mismo archivo agregando el encadenado de Engram; Task 4 lo referencia desde el workflow de
  release. Esta tarea **no** encadena Engram todavía — eso es exclusivo de Task 3.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `scripts/__tests__/install.sh.test.ts`:

```typescript
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const installer = resolve(import.meta.dir, "../install.sh");
const temporaryDirectories: string[] = [];
const fixtureBytes = "#!/usr/bin/env sh\nprintf 'fixture release binary\\n'\n";
const testReleaseBaseUrl = "FORGE614_ATLAS_TEST_RELEASE_BASE_URL";
const testMode = "FORGE614_ATLAS_INSTALLER_TEST";

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "forge614-atlas-installer-"));
  temporaryDirectories.push(directory);
  return directory;
}

function markerCount(contents: string) {
  return contents.split("# >>> forge614-atlas PATH >>>").length - 1;
}

function targetArtifact() {
  const target = `${process.platform}/${process.arch}`;
  const artifacts: Record<string, string> = {
    "darwin/x64": "forge614-atlas-darwin-x64",
    "darwin/arm64": "forge614-atlas-darwin-arm64",
    "linux/x64": "forge614-atlas-linux-x64",
    "linux/arm64": "forge614-atlas-linux-arm64",
  };
  const artifact = artifacts[target];
  if (!artifact) throw new Error(`Unsupported test host: ${target}`);
  return artifact;
}

function sha256(path: string) {
  const result = Bun.spawnSync(["shasum", "-a", "256", path]);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().split(/\s+/)[0]!;
}

async function runInstaller(args: string[]) {
  const child = Bun.spawn(["/usr/bin/env", "bash", installer, ...args], {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: await child.exited,
    stdout: await new Response(child.stdout).text(),
    stderr: await new Response(child.stderr).text(),
  };
}

async function withFixtureEnvironment<T>(
  home: string,
  releaseBaseUrl: string,
  operation: () => Promise<T>,
  includeTestSentinel = true,
  shell?: string,
) {
  const saved = {
    home: process.env.HOME,
    shell: process.env.SHELL,
    releaseBaseUrl: process.env[testReleaseBaseUrl],
    testMode: process.env[testMode],
  };
  process.env.HOME = home;
  if (shell === undefined) delete process.env.SHELL;
  else process.env.SHELL = shell;
  process.env[testReleaseBaseUrl] = releaseBaseUrl;
  if (includeTestSentinel) process.env[testMode] = "1";
  else delete process.env[testMode];
  try {
    return await operation();
  } finally {
    for (const [name, value] of Object.entries({
      HOME: saved.home,
      SHELL: saved.shell,
      [testReleaseBaseUrl]: saved.releaseBaseUrl,
      [testMode]: saved.testMode,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function fixtureReleaseServer(artifact: string, fixturePath: string) {
  const digest = sha256(fixturePath);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const mismatch = url.pathname.startsWith("/mismatch/");
      const unsafeAssets = url.pathname.startsWith("/unsafe-assets/");
      const prefix = mismatch ? "/mismatch" : "/good";
      const baseUrl = `http://${url.host}${prefix}`;
      const assetBaseUrl = unsafeAssets ? "https://127.0.0.1:1" : baseUrl;
      if (url.pathname.endsWith("/releases/latest") || url.pathname.includes("/releases/tags/")) {
        return Response.json({
          assets: [
            { name: "SHA256SUMS", browser_download_url: `${assetBaseUrl}/download/SHA256SUMS` },
            { name: artifact, browser_download_url: `${assetBaseUrl}/download/${artifact}` },
          ],
        });
      }
      if (url.pathname.endsWith("/download/SHA256SUMS")) {
        const manifestDigest = mismatch ? "0".repeat(64) : digest;
        return new Response(`${manifestDigest}  ${artifact}\n`);
      }
      if (url.pathname.endsWith(`/download/${artifact}`)) {
        return new Response(readFileSync(fixturePath));
      }
      return new Response("not found", { status: 404 });
    },
  });
  return server;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

test.each([
  ["zsh", "/bin/zsh", ".zshrc"],
  ["bash", "/bin/bash", process.platform === "darwin" ? ".bash_profile" : ".bashrc"],
  ["fish", "/usr/bin/fish", ".config/fish/conf.d/forge614-atlas.fish"],
])("publishes a custom bin directory once for %s", async (_name, shell, configurationFile) => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "custom-bin");
  const fakeHome = join(root, "home");
  const configurationPath = join(fakeHome, configurationFile);
  mkdirSync(fakeHome, { recursive: true });
  mkdirSync(resolve(configurationPath, ".."), { recursive: true });
  writeFileSync(fixture, fixtureBytes);
  writeFileSync(configurationPath, "# unrelated configuration\nexport KEEP_THIS=1\n");
  const server = fixtureReleaseServer(targetArtifact(), fixture);

  try {
    const first = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]), true, shell);
    const second = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination, "--force"]), true, shell);
    const configuration = readFileSync(configurationPath, "utf8");

    expect(first.exitCode, first.stderr).toBe(0);
    expect(second.exitCode, second.stderr).toBe(0);
    expect(first.stdout).toContain(configurationPath);
    expect(first.stdout).toContain("new terminal");
    expect(configuration).toContain("# unrelated configuration");
    expect(configuration).toContain("export KEEP_THIS=1");
    expect(configuration).toContain(destination);
    expect(configuration).toContain(
      shell.endsWith("fish") ? `set -gx PATH ${destination} $PATH` : `export PATH=${destination}:"$PATH"`,
    );
    expect(markerCount(configuration)).toBe(1);
  } finally {
    server.stop(true);
  }
});

test("leaves shell files untouched and prints manual PATH guidance for an unknown shell", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "custom-bin");
  const fakeHome = join(root, "home");
  const shellFiles = [".zshrc", ".bashrc", ".bash_profile", ".config/fish/conf.d/forge614-atlas.fish"];
  mkdirSync(fakeHome, { recursive: true });
  writeFileSync(fixture, fixtureBytes);
  for (const shellFile of shellFiles) {
    const path = join(fakeHome, shellFile);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, `unrelated ${shellFile}\n`);
  }
  const server = fixtureReleaseServer(targetArtifact(), fixture);

  try {
    const first = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]), true, "/bin/unknown");
    const second = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination, "--force"]), true, "/bin/unknown");

    expect(first.exitCode, first.stderr).toBe(0);
    expect(second.exitCode, second.stderr).toBe(0);
    expect(first.stdout).toContain(`export PATH=${destination}:\"$PATH\"`);
    expect(first.stdout).toContain("manually");
    expect(second.stdout).toContain("manually");
    for (const shellFile of shellFiles) {
      expect(readFileSync(join(fakeHome, shellFile), "utf8")).toBe(`unrelated ${shellFile}\n`);
    }
  } finally {
    server.stop(true);
  }
});

test("default install uses the product bin with locked-down permissions", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const fakeHome = join(root, "home");
  mkdirSync(fakeHome, { recursive: true });
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    const result = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller([]), true, "/bin/unknown");
    expect(result.exitCode, result.stderr).toBe(0);
    expect(existsSync(join(fakeHome, ".forge614", "atlas", "bin", "forge614-atlas"))).toBe(true);
    expect(result.stdout).toContain("forge614-atlas init");
    expect(statSync(join(fakeHome, ".forge614", "atlas")).mode & 0o777).toBe(0o700);
    expect(statSync(join(fakeHome, ".forge614", "atlas", "bin")).mode & 0o777).toBe(0o700);
  } finally {
    server.stop(true);
  }
});

test("refuses replacement without force", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "chosen-bin");
  const fakeHome = join(root, "empty-home");
  mkdirSync(fakeHome);
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]));
    const secondWithoutForce = await withFixtureEnvironment(fakeHome, `${server.url}good`, () =>
      runInstaller(["--bin-dir", destination]),
    );
    expect(secondWithoutForce.exitCode).not.toBe(0);
    expect(readFileSync(join(destination, "forge614-atlas"), "utf8")).toBe(fixtureBytes);
  } finally {
    server.stop(true);
  }
});

test("rejects a checksum mismatch before creating the destination", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const mismatchDestination = join(root, "checksum-mismatch-bin");
  const fakeHome = join(root, "empty-home");
  mkdirSync(fakeHome);
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    const checksumMismatch = await withFixtureEnvironment(fakeHome, `${server.url}mismatch`, () =>
      runInstaller(["--bin-dir", mismatchDestination]),
    );
    expect(checksumMismatch.exitCode).not.toBe(0);
    expect(existsSync(join(mismatchDestination, "forge614-atlas"))).toBe(false);
    expect(existsSync(join(fakeHome, ".forge614"))).toBe(false);
  } finally {
    server.stop(true);
  }
});

test.each([
  ["an HTTPS endpoint", "https://127.0.0.1:1"],
  ["a userinfo endpoint", "http://127.0.0.1:5432@localhost:1"],
])("rejects %s before downloading", async (_description, releaseBaseUrl) => {
  const root = temporaryDirectory();
  const fakeHome = join(root, "empty-home");
  const destination = join(root, "untrusted-bin");
  mkdirSync(fakeHome);

  const result = await withFixtureEnvironment(fakeHome, releaseBaseUrl, () =>
    runInstaller(["--bin-dir", destination]),
  );

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("test release endpoint must be a loopback HTTP URL");
  expect(existsSync(destination)).toBe(false);
  expect(existsSync(join(fakeHome, ".forge614"))).toBe(false);
});

test("rejects a test endpoint without the test sentinel", async () => {
  const root = temporaryDirectory();
  const fakeHome = join(root, "empty-home");
  const destination = join(root, "untrusted-bin");
  mkdirSync(fakeHome);

  const result = await withFixtureEnvironment(fakeHome, "http://127.0.0.1:1", () =>
    runInstaller(["--bin-dir", destination]),
  false);

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("reserved for test fixtures");
  expect(existsSync(destination)).toBe(false);
  expect(existsSync(join(fakeHome, ".forge614"))).toBe(false);
});

test("rejects non-loopback release asset URLs from a test fixture", async () => {
  const root = temporaryDirectory();
  const fakeHome = join(root, "empty-home");
  const destination = join(root, "untrusted-bin");
  const fixture = join(root, "fixture-binary");
  mkdirSync(fakeHome);
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    const result = await withFixtureEnvironment(fakeHome, `${server.url}unsafe-assets`, () =>
      runInstaller(["--bin-dir", destination]),
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("unsafe test fixture URL");
    expect(existsSync(destination)).toBe(false);
    expect(existsSync(join(fakeHome, ".forge614"))).toBe(false);
  } finally {
    server.stop(true);
  }
});
```

- [ ] **Step 2: Correr las pruebas y confirmar que fallan**

Run: `bun test scripts/__tests__/install.sh.test.ts`
Expected: FAIL — `scripts/install.sh` todavía no existe (`bash: .../install.sh: No such file or
directory` o similar en cada caso).

- [ ] **Step 3: Implementar `scripts/install.sh`**

Crear `scripts/install.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf '%s\n' \
    'Install a verified Forge614 Atlas release binary.' \
    'Usage: bash scripts/install.sh [--version TAG] [--bin-dir PATH] [--force]' \
    'Default destination: $HOME/.forge614/atlas/bin/forge614-atlas' \
    '--force explicitly replaces an existing installation.'
}

fail() { printf '%s\n' "$1" >&2; exit 1; }

path_marker_start='# >>> forge614-atlas PATH >>>'
path_marker_end='# <<< forge614-atlas PATH <<<'

manual_path_guidance() {
  local bin_dir="$1"
  printf '%s\n' 'Add this directory to your terminal PATH manually:'
  printf 'export PATH=%q:"$PATH"\n' "$bin_dir"
}

prepare_bin_directory() {
  local forge_home product_home
  if [ "$bin_dir" != "$HOME/.forge614/atlas/bin" ]; then
    mkdir -p -- "$bin_dir"
    [ -d "$bin_dir" ] && [ ! -L "$bin_dir" ] || return 1
    return 0
  fi
  forge_home="$HOME/.forge614"
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
  local configuration_dir temporary_file
  [ ! -L "$configuration_file" ] || return 1
  [ ! -e "$configuration_file" ] || [ -f "$configuration_file" ] || return 1
  configuration_dir="$(dirname -- "$configuration_file")"
  mkdir -p -- "$configuration_dir" || return 1
  temporary_file="$(mktemp "${configuration_file}.XXXXXX")" || return 1

  if [ -f "$configuration_file" ]; then
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
    : > "$temporary_file" || return 1
  fi

  printf '%s\n%s\n%s\n' "$path_marker_start" "$path_command" "$path_marker_end" >> "$temporary_file" || {
    rm -f -- "$temporary_file"
    return 1
  }
  mv -f -- "$temporary_file" "$configuration_file"
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

repo='jotredev/forge614-atlas'
bin_dir="${HOME:?HOME must be set}/.forge614/atlas/bin"
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
```

Marcar el archivo como ejecutable:

```bash
chmod +x scripts/install.sh
```

- [ ] **Step 4: Correr las pruebas y confirmar que pasan**

Run: `bun test scripts/__tests__/install.sh.test.ts`
Expected: PASS (todas las pruebas del Step 1 en verde).

- [ ] **Step 5: Chequeo de sintaxis y commit**

Run: `bash -n scripts/install.sh` → sin salida, código 0.

```bash
git add scripts/install.sh scripts/__tests__/install.sh.test.ts
git commit -m "feat: add the Atlas installer's download, checksum, and PATH flow"
```

---

### Task 3: Encadenar `forge614-engram` y sus guardas de seguridad de prueba

**Files:**
- Modify: `scripts/install.sh`
- Modify: `scripts/__tests__/install.sh.test.ts`

**Interfaces:**
- Consumes: todo lo producido por Task 2 (`download_dir`, `fail`, `prepare_bin_directory`, la
  guarda `FORGE614_ATLAS_INSTALLER_TEST`/`FORGE614_ATLAS_TEST_RELEASE_BASE_URL`).
- Produces: función `install_engram_dependency` (llamada justo antes de `prepare_bin_directory`);
  nueva variable de prueba `FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL` (debe ser `file:///...`,
  gateada por la misma `FORGE614_ATLAS_INSTALLER_TEST=1`).

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar estos tres bloques de prueba al final de `scripts/__tests__/install.sh.test.ts` (después
de la última prueba existente, antes del fin de archivo):

```typescript
test("installs Forge614 Engram as a dependency without configuring an AI client", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "bin");
  const fakeHome = join(root, "home");
  const engramInstaller = join(root, "engram-install.sh");
  mkdirSync(fakeHome, { recursive: true });
  writeFileSync(fixture, fixtureBytes);
  writeFileSync(engramInstaller, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "mkdir -p \"$HOME/.forge614/engram/bin\"",
    "printf '#!/usr/bin/env sh\\nexit 0\\n' > \"$HOME/.forge614/engram/bin/forge614-engram\"",
    "chmod 700 \"$HOME/.forge614/engram/bin/forge614-engram\"",
  ].join("\n"));
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  const previous = process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL;
  process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL = `file://${engramInstaller}`;
  try {
    const result = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]));
    expect(result.exitCode, result.stderr).toBe(0);
    expect(existsSync(join(fakeHome, ".forge614", "engram", "bin", "forge614-engram"))).toBe(true);
    expect(existsSync(join(fakeHome, ".claude.json"))).toBe(false);
    expect(existsSync(join(fakeHome, ".codex", "config.toml"))).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL;
    else process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL = previous;
    server.stop(true);
  }
});

test("skips Engram installation when it is already present", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "bin");
  const fakeHome = join(root, "home");
  const engramBin = join(fakeHome, ".forge614", "engram", "bin", "forge614-engram");
  mkdirSync(resolve(engramBin, ".."), { recursive: true });
  writeFileSync(engramBin, "#!/usr/bin/env sh\nexit 0\n");
  chmodSync(engramBin, 0o755);
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  const engramInstaller = join(root, "engram-install-should-not-run.sh");
  writeFileSync(engramInstaller, "#!/usr/bin/env bash\nexit 1\n");
  const previous = process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL;
  process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL = `file://${engramInstaller}`;
  try {
    const result = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]));
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("Forge614 Engram is already available");
  } finally {
    if (previous === undefined) delete process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL;
    else process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL = previous;
    server.stop(true);
  }
});

test("stops without installing Atlas when the Engram installer fails", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "bin");
  const fakeHome = join(root, "home");
  const engramInstaller = join(root, "engram-install-fails.sh");
  mkdirSync(fakeHome, { recursive: true });
  writeFileSync(fixture, fixtureBytes);
  writeFileSync(engramInstaller, "#!/usr/bin/env bash\nexit 1\n");
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  const previous = process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL;
  process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL = `file://${engramInstaller}`;
  try {
    const result = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]));
    expect(result.exitCode).not.toBe(0);
    expect(existsSync(join(destination, "forge614-atlas"))).toBe(false);
    expect(existsSync(join(fakeHome, ".forge614", "atlas"))).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL;
    else process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL = previous;
    server.stop(true);
  }
});
```

Estas pruebas usan `chmodSync`, que no está importado todavía. Actualizar el `import` de
`node:fs` al inicio del archivo para incluirlo:

```typescript
import { afterEach, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
```

- [ ] **Step 2: Correr las pruebas y confirmar que fallan**

Run: `bun test scripts/__tests__/install.sh.test.ts`
Expected: FAIL — las 3 pruebas nuevas fallan porque `scripts/install.sh` todavía no encadena
ningún instalador de Engram (nunca crea `forge614-engram`, y la variable
`FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL` no la lee nadie todavía).

- [ ] **Step 3: Implementar el encadenado de Engram en `scripts/install.sh`**

Agregar esta función en `scripts/install.sh`, colocándola justo después de la función
`is_loopback_test_url` (antes de la línea `repo='jotredev/forge614-atlas'`):

```bash
install_engram_dependency() {
  local engram_command engram_installer installer_url
  engram_command="$HOME/.forge614/engram/bin/forge614-engram"
  if [ -x "$engram_command" ]; then
    printf '%s\n' "Forge614 Engram is already available: $engram_command"
    return 0
  fi

  installer_url='https://github.com/jotredev/forge614-engram/releases/latest/download/install.sh'
  if [ -n "${FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL:-}" ]; then
    [ "${FORGE614_ATLAS_INSTALLER_TEST:-}" = '1' ] || fail 'The Engram installer override is reserved for test fixtures.'
    installer_url="$FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL"
    case "$installer_url" in file:///*) ;; *) fail 'The Engram test installer must be a local file URL.' ;; esac
  fi

  engram_installer="$download_dir/forge614-engram-install.sh"
  curl --fail --location --proto '=https,file' --tlsv1.2 --silent --show-error "$installer_url" --output "$engram_installer" \
    || fail 'Could not download the Forge614 Engram installer.'
  bash "$engram_installer" || fail 'Forge614 Engram could not be installed; Atlas was not changed.'
  [ -x "$engram_command" ] || fail 'Forge614 Engram installation did not provide its required command.'
}
```

Modificar la línea que llama a `prepare_bin_directory` (agregada en Task 2) para encadenar Engram
justo antes:

```bash
install_engram_dependency
prepare_bin_directory || fail 'Could not safely create the selected Atlas installation directory.'
```

- [ ] **Step 4: Correr las pruebas y confirmar que pasan**

Run: `bun test scripts/__tests__/install.sh.test.ts`
Expected: PASS — todas las pruebas de Task 2 siguen en verde (no usan Engram, así que no se ven
afectadas) y las 3 nuevas de este paso también pasan.

- [ ] **Step 5: Chequeo de sintaxis y commit**

Run: `bash -n scripts/install.sh` → sin salida, código 0.

```bash
git add scripts/install.sh scripts/__tests__/install.sh.test.ts
git commit -m "feat: chain the Engram installer as Atlas's only dependency"
```

---

### Task 4: Workflow de release (`.github/workflows/release.yml`)

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: el `--version` de Task 1 (smoke test del binario compilado), el script
  `scripts/install.sh` de las Tasks 2-3 (job `verify` lo chequea con `bash -n` y con la suite
  completa de pruebas), y el script de build ya existente en `package.json`
  (`"build": "bun build ./src/interfaces/cli/main.ts --compile --outfile dist/forge614-atlas"` —
  este workflow no lo usa literalmente porque necesita variar `--target`/`--outfile` por cada
  combinación de plataforma, pero es la misma orden base).
- Produces: al empujar un tag `v*`, publica un GitHub Release con 4 binarios + `SHA256SUMS` +
  `scripts/install.sh` adjuntos.

- [ ] **Step 1: Crear el workflow**

Crear `.github/workflows/release.yml`:

```yaml
name: Release standalone artifacts

on:
  push:
    tags:
      - "v*"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verify:
    name: Release verification
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.8
      - run: bun install --frozen-lockfile
      - run: bun test
      - run: bun run typecheck
      - run: git diff --check
      - run: bash -n scripts/install.sh

  build:
    name: Build ${{ matrix.artifact }}
    runs-on: ${{ matrix.runner }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - runner: macos-14
            target: bun-darwin-arm64
            artifact: forge614-atlas-darwin-arm64
            bun_version: 1.3.8
          - runner: macos-15-intel
            target: bun-darwin-x64
            artifact: forge614-atlas-darwin-x64
            bun_version: 1.3.8
          - runner: ubuntu-latest
            target: bun-linux-x64
            artifact: forge614-atlas-linux-x64
            bun_version: 1.3.8
          - runner: ubuntu-24.04-arm
            target: bun-linux-arm64
            artifact: forge614-atlas-linux-arm64
            bun_version: 1.3.8
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ matrix.bun_version }}
      - run: bun install --frozen-lockfile
      - name: Create the disposable build directory
        run: mkdir dist
      - name: Compile standalone artifact
        run: bun build ./src/interfaces/cli/main.ts --compile --target=${{ matrix.target }} --outfile dist/${{ matrix.artifact }}
      - name: Smoke-test the native standalone artifact
        shell: bash
        run: ./dist/${{ matrix.artifact }} --version
      - name: Preserve the artifact mode for collection
        run: tar -C dist -czf dist/${{ matrix.artifact }}.tar.gz ${{ matrix.artifact }}
      - uses: actions/upload-artifact@v4
        with:
          name: release-${{ matrix.artifact }}
          path: dist/${{ matrix.artifact }}.tar.gz
          if-no-files-found: error

  assemble:
    name: Assemble and validate release assets
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: release-*
          merge-multiple: true
          path: dist
      - name: Extract the four standalone artifacts with their original modes
        shell: bash
        run: |
          set -euo pipefail
          for archive in dist/*.tar.gz; do
            tar -xzf "$archive" -C dist
          done
      - name: Generate SHA256SUMS for the four release artifacts
        shell: bash
        run: |
          cd dist
          sha256sum \
            forge614-atlas-darwin-arm64 \
            forge614-atlas-darwin-x64 \
            forge614-atlas-linux-x64 \
            forge614-atlas-linux-arm64 > SHA256SUMS
      - name: Validate release artifacts and manifest
        shell: bash
        run: |
          set -euo pipefail
          for artifact in forge614-atlas-darwin-arm64 forge614-atlas-darwin-x64 \
            forge614-atlas-linux-x64 forge614-atlas-linux-arm64; do
            test -s "dist/$artifact" || { echo "missing or empty artifact: $artifact" >&2; exit 1; }
          done
          for artifact in forge614-atlas-darwin-arm64 forge614-atlas-darwin-x64 \
            forge614-atlas-linux-x64 forge614-atlas-linux-arm64; do
            test -x "dist/$artifact" || { echo "artifact is not executable: $artifact" >&2; exit 1; }
          done
          test -s dist/SHA256SUMS || { echo "missing or empty SHA256SUMS" >&2; exit 1; }
          test "$(wc -l < dist/SHA256SUMS | tr -d ' ')" = 4
          for artifact in forge614-atlas-darwin-arm64 forge614-atlas-darwin-x64 \
            forge614-atlas-linux-x64 forge614-atlas-linux-arm64; do
            grep -Eq "^[0-9a-f]{64}  ${artifact}$" dist/SHA256SUMS || { echo "invalid checksum entry: $artifact" >&2; exit 1; }
          done
          (cd dist && sha256sum --check SHA256SUMS)
      - uses: actions/upload-artifact@v4
        with:
          name: release-assets
          path: |
            dist/forge614-atlas-darwin-arm64
            dist/forge614-atlas-darwin-x64
            dist/forge614-atlas-linux-x64
            dist/forge614-atlas-linux-arm64
            dist/SHA256SUMS
          if-no-files-found: error

  publish:
    name: Publish GitHub Release
    needs: [verify, assemble]
    if: github.event_name == 'push' && github.ref_type == 'tag'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: release-assets
          path: dist
      - name: Create the GitHub Release with the validated files only
        env:
          GH_TOKEN: ${{ github.token }}
          GH_REPO: ${{ github.repository }}
        shell: bash
        run: |
          release_flags=()
          if [[ "$GITHUB_REF_NAME" == *-* ]]; then
            release_flags+=(--prerelease)
          fi
          gh release create "$GITHUB_REF_NAME" \
            dist/forge614-atlas-darwin-arm64 \
            dist/forge614-atlas-darwin-x64 \
            dist/forge614-atlas-linux-x64 \
            dist/forge614-atlas-linux-arm64 \
            dist/SHA256SUMS \
            scripts/install.sh#install.sh \
            --title "$GITHUB_REF_NAME" \
            --generate-notes \
            "${release_flags[@]}"
```

- [ ] **Step 2: Validar la sintaxis del YAML**

Run: `python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/release.yml')); print('ok')"`
Expected: imprime `ok` sin errores (confirma que el YAML es válido antes de subirlo a GitHub).

- [ ] **Step 3: Confirmar que la suite completa de Atlas sigue en verde**

Run: `bun test`
Expected: PASS — todos los tests de los Planes 1-4 más los nuevos de este plan (Tasks 1-3), sin
ninguna falla.

Run: `bun run typecheck`
Expected: código de salida 0, sin diagnósticos.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat: add the release workflow that builds and publishes Atlas binaries"
```

---

## Plan Self-Review

**Cobertura del spec:** las 12 secciones del spec están cubiertas — sección 2 (alcance, sin
Windows/MCP) es una restricción transversal respetada en todas las tareas; sección 3 (encadenar
solo Engram) → Task 3; sección 4 (plataformas/artefactos) → Tasks 2 y 4; sección 5 (flujo de
`install.sh`) → Tasks 2-3; sección 6 (`--version`) → Task 1; sección 7 (workflow) → Task 4;
sección 8 (pruebas sin GitHub real) → Tasks 2-3; sección 9 (archivos) → cubiertos exactamente;
sección 10 (publicar `v1.0.0`) → acción explícita post-fusión, fuera de las tareas de SDD, descrita
en el mensaje de cierre de este plan (ver más abajo); sección 11 (salida en texto plano) → todo el
script imprime con `printf`/`echo`, nunca JSON; sección 12 (pruebas) → cubierto por Tasks 1-4.

**Placeholders:** ninguno — todo el código Bash, TypeScript y YAML de cada tarea es completo y
ejecutable tal cual, adaptado línea por línea de los archivos reales ya verificados de
`forge614-engram` (con nombres, rutas y URLs corregidos para Atlas).

**Consistencia de tipos/nombres:** `install_engram_dependency` (Task 3) es el único punto que
lee `FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL`; `FORGE614_ATLAS_INSTALLER_TEST` y
`FORGE614_ATLAS_TEST_RELEASE_BASE_URL` (Task 2) se reutilizan sin cambios en Task 3. Los nombres de
artefacto (`forge614-atlas-darwin-arm64`, etc.) son idénticos entre `scripts/install.sh` (Task 2) y
`.github/workflows/release.yml` (Task 4). El destino por defecto
(`$HOME/.forge614/atlas/bin/forge614-atlas`) es el mismo en el spec, el script, y las pruebas.

## Publicar el release real `v1.0.0` (después de fusionar, fuera del ciclo de SDD)

Una vez que la revisión final de toda la rama pase limpia y la rama se fusione a `main` (skill
`superpowers:finishing-a-development-branch`), el cierre de este plan incluye un paso final,
manual y con confirmación explícita del usuario en ese momento exacto (no basta la aprobación
general de este plan):

```bash
git tag v1.0.0
git push origin v1.0.0
```

Esto dispara `release.yml` en GitHub y publica el primer Release público de `forge614-atlas`.

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-09-22-atlas-installer.md`. Dos opciones de
ejecución:

**1. Subagent-Driven (recomendado)** — despacho un subagente implementador fresco por tarea,
revisión entre tareas, iteración rápida.

**2. Ejecución en línea** — ejecuto las tareas en esta misma sesión con `executing-plans`, por
lotes con puntos de control.

¿Cuál prefieres?
