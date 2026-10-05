/**
 * Prueba `scripts/install.sh` con `bash` en carpetas temporales, contra una release FALSA (servidor local) y contra Engram, Workers y Engines FALSOS:
 * publicación del PATH (lista de carpetas donde la terminal busca programas), permisos, rechazo de huellas SHA-256 (código que identifica un archivo)
 * y de direcciones de prueba inseguras, y manejo de las dependencias y de `FORGE614_HOME`.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const installer = resolve(import.meta.dir, "../install.sh");
const temporaryDirectories: string[] = [];
const fixtureBytes = "#!/usr/bin/env sh\nprintf 'fixture release binary\\n'\n";
const testReleaseBaseUrl = "FORGE614_ATLAS_TEST_RELEASE_BASE_URL";
const testMode = "FORGE614_ATLAS_INSTALLER_TEST";
const engramInstallerTestUrl = "FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL";
const workersInstallerTestUrl = "FORGE614_ATLAS_WORKERS_INSTALLER_TEST_URL";
const forgeHomeVariable = "FORGE614_HOME";

/** Cómo debe responder el Engines FALSO: su versión y el campo `supportsReadOnly` (`"absent"` lo omite). */
interface EnginesSpec {
  /** Versión que el Engines falso imprime al recibir `--version`. */
  version: string;
  /** Valor del campo `supportsReadOnly` en la respuesta de `capabilities`; `"absent"` deja el campo fuera. */
  supportsReadOnly: boolean | "absent";
}

const goodEngines: EnginesSpec = { version: "1.17.0", supportsReadOnly: true };

/**
 * Escribe un binario FALSO que responde `--version` con `<name> <version>`; con `version` en `null` no
 * responde `--version` (sale con 1), como un programa viejo sin esa opción. Con cualquier otro argumento sale con 0.
 * @param path Ruta del programa falso; se crean las carpetas que falten y se marca ejecutable.
 * @param name Nombre que el programa imprime antes de la versión (por ejemplo `forge614-workers`).
 * @param version Versión que imprime, o `null` para que `--version` falle.
 */
function writeFakeVersioned(path: string, name: string, version: string | null) {
  mkdirSync(dirname(path), { recursive: true });
  const answer = version === null ? "exit 1" : `printf '${name} ${version}\\n'`;
  writeFileSync(path, `#!/bin/sh\nif [ "$1" = "--version" ]; then\n  ${answer}\n  exit 0\nfi\nexit 0\n`);
  chmodSync(path, 0o755);
}

/**
 * Escribe un Engines FALSO que responde `--version` y `capabilities` (este último con un JSON, sin mirar el resto
 * de los argumentos); cualquier otro comando sale con 2.
 * @param path Ruta del programa falso; se crean las carpetas que falten y se marca ejecutable.
 * @param spec Versión que imprime y valor (o ausencia) del campo `supportsReadOnly` que responde.
 */
function writeFakeEngines(path: string, spec: EnginesSpec) {
  mkdirSync(dirname(path), { recursive: true });
  const field = spec.supportsReadOnly === "absent" ? "" : `,"supportsReadOnly":${spec.supportsReadOnly}`;
  writeFileSync(
    path,
    [
      "#!/bin/sh",
      'case "$1" in',
      `  --version) printf 'forge614-engines ${spec.version}\\n' ;;`,
      `  capabilities) printf '{"id":"claude-code"${field}}\\n' ;;`,
      "  *) exit 2 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(path, 0o755);
}

/** Lo que hace el instalador publicado FALSO de otro producto cuando Atlas lo corre. */
interface InstallerBehavior {
  /** Si es `true`, sale con 1 sin instalar nada. */
  fails?: boolean;
  /** Versión que imprime el binario que deja instalado (`null`: un binario sin `--version`). Por defecto la mínima. */
  installs?: string | null;
  /** Pensado solo para Workers: el Engines que deja instalado, como haría el instalador real de Workers (`writeFakeInstaller` no lo restringe). */
  engines?: EnginesSpec;
}

/**
 * Escribe un instalador publicado FALSO de Engram o de Workers. Anota cada llamada en `logFile` como
 * `<producto>|<FORGE614_HOME que recibió>|<argumentos>` y, salvo que falle, deja su binario en `$FORGE614_HOME/<producto>/bin`.
 * @param directory Carpeta donde se escriben el binario falso que se instalará (`<producto>-payload`), el instalador y, si hay `engines`, el Engines falso (`engines-payload`).
 * @param product Producto que imita: `"engram"` o `"workers"`.
 * @param behavior Si falla, qué versión deja instalada y si deja además un Engines (ver `InstallerBehavior`).
 * @param logFile Archivo al que el instalador falso agrega una línea por cada vez que se le llama.
 * @returns Ruta del instalador falso, que `install.sh` descarga desde una URL `file://`.
 */
function writeFakeInstaller(directory: string, product: "engram" | "workers", behavior: InstallerBehavior, logFile: string) {
  const payload = join(directory, `${product}-payload`);
  // La versión que deja instalada es la indicada o, si no se dice nada, la mínima que exige Atlas para ese producto.
  writeFakeVersioned(payload, `forge614-${product}`, behavior.installs === undefined ? (product === "engram" ? "1.8.7" : "1.0.0") : behavior.installs);
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `printf '%s|%s|%s\\n' '${product}' "$FORGE614_HOME" "$*" >> '${logFile}'`,
  ];
  if (behavior.fails) {
    lines.push("exit 1");
  } else {
    lines.push(
      `mkdir -p "$FORGE614_HOME/${product}/bin"`,
      `cp '${payload}' "$FORGE614_HOME/${product}/bin/forge614-${product}"`,
      `chmod 755 "$FORGE614_HOME/${product}/bin/forge614-${product}"`,
    );
    // Con `engines` el instalador falso deja también un Engines instalado, en la ruta fija que Atlas revisa.
    if (behavior.engines) {
      const enginesPayload = join(directory, "engines-payload");
      writeFakeEngines(enginesPayload, behavior.engines);
      lines.push(
        'mkdir -p "$FORGE614_HOME/engines/bin"',
        `cp '${enginesPayload}' "$FORGE614_HOME/engines/bin/forge614-engines"`,
        'chmod 755 "$FORGE614_HOME/engines/bin/forge614-engines"',
      );
    }
  }
  const path = join(directory, `${product}-install.sh`);
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

// Las primeras pruebas de este archivo son anteriores a las dependencias que Atlas instala antes de
// copiar su binario. Ninguna fija sus propios instaladores de Engram y Workers, así que sin un valor por
// omisión caerían a las URL reales y dejarían de estar aisladas de la red: todas las corridas apuntan a estos dos
// instaladores locales (que dejan Engram 1.8.7, Workers 1.0.0 y un Engines 1.17.0 con el candado de solo lectura, la
// garantía de Engines de que un ayudante no modifica archivos), salvo que la prueba ponga el suyo.
const defaultsDirectory = mkdtempSync(join(tmpdir(), "forge614-atlas-default-installers-"));
const defaultEngramInstaller = writeFakeInstaller(defaultsDirectory, "engram", {}, "/dev/null");
const defaultWorkersInstaller = writeFakeInstaller(defaultsDirectory, "workers", { engines: goodEngines }, "/dev/null");

// Al terminar todas las pruebas del archivo se borra la carpeta de los instaladores falsos por omisión.
afterAll(() => {
  rmSync(defaultsDirectory, { recursive: true, force: true });
});

/**
 * Crea una carpeta temporal nueva y la anota para que `afterEach` la borre al terminar la prueba.
 * @returns Ruta de la carpeta creada.
 */
function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "forge614-atlas-installer-"));
  temporaryDirectories.push(directory);
  return directory;
}

/**
 * Cuenta cuántas veces aparece la línea de inicio del bloque de PATH (`# >>> forge614-atlas PATH >>>`) en un texto.
 * @param contents Contenido de un archivo de configuración de la terminal.
 * @returns Número de apariciones de esa línea de inicio.
 */
function markerCount(contents: string) {
  return contents.split("# >>> forge614-atlas PATH >>>").length - 1;
}

/**
 * Da el nombre del binario de release que corresponde a la plataforma y arquitectura donde corren las pruebas
 * (macOS o Linux, x64 o arm64), el mismo que el instalador elige con `uname`.
 * @returns Nombre del archivo, por ejemplo `forge614-atlas-darwin-arm64`.
 * @throws Error `Unsupported test host: <plataforma>/<arquitectura>` si el equipo no es una de las cuatro combinaciones.
 */
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

/**
 * Calcula la huella SHA-256 (código que identifica el contenido de un archivo) con `shasum -a 256`.
 * @param path Ruta del archivo.
 * @returns La huella: 64 caracteres hexadecimales.
 * @throws Error con la salida de error de `shasum` si termina con un código distinto de 0.
 */
function sha256(path: string) {
  const result = Bun.spawnSync(["shasum", "-a", "256", path]);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().split(/\s+/)[0]!;
}

/**
 * Corre `bash install.sh` con las opciones dadas y con las variables de entorno que tenga este proceso en ese
 * momento (por eso se llama dentro de `withFixtureEnvironment`).
 * @param args Opciones del instalador, por ejemplo `["--bin-dir", ruta, "--force"]`.
 * @returns El código de salida y lo que el instalador escribió en la salida estándar y en la de errores.
 */
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

/**
 * Corre `operation` con `HOME`, `SHELL` y las variables de prueba del instalador puestas, y las deja como
 * estaban al terminar. `FORGE614_HOME` se borra salvo que `extraEnv` la fije (un `undefined` borra la
 * variable), para que una variable real de la persona que corre las pruebas nunca llegue al instalador.
 * Las URL de los instaladores falsos de Engram y Workers valen las de los instaladores locales por omisión si no estaban ya puestas.
 * @param home Carpeta que hace de `HOME`.
 * @param releaseBaseUrl Dirección base de la release falsa (`FORGE614_ATLAS_TEST_RELEASE_BASE_URL`).
 * @param operation Lo que se corre con ese entorno, normalmente una llamada a `runInstaller`.
 * @param includeTestSentinel Si es `false`, se borra `FORGE614_ATLAS_INSTALLER_TEST` (la variable que activa el modo de pruebas del instalador).
 * @param shell Valor de `SHELL`; `undefined` borra la variable.
 * @param extraEnv Variables que se aplican al final y pisan a las anteriores; un valor `undefined` borra la variable.
 * @returns Lo que devuelva `operation`.
 */
async function withFixtureEnvironment<T>(
  home: string,
  releaseBaseUrl: string,
  operation: () => Promise<T>,
  includeTestSentinel = true,
  shell?: string,
  extraEnv: Record<string, string | undefined> = {},
) {
  // Se guardan los valores actuales de las variables que se van a cambiar, para restaurarlos al final.
  const managed = [
    "HOME",
    "SHELL",
    forgeHomeVariable,
    testReleaseBaseUrl,
    testMode,
    engramInstallerTestUrl,
    workersInstallerTestUrl,
  ];
  const saved = Object.fromEntries(managed.map(name => [name, process.env[name]]));
  const settings: Record<string, string | undefined> = {
    HOME: home,
    SHELL: shell,
    [forgeHomeVariable]: undefined,
    [testReleaseBaseUrl]: releaseBaseUrl,
    [testMode]: includeTestSentinel ? "1" : undefined,
    [engramInstallerTestUrl]: process.env[engramInstallerTestUrl] ?? `file://${defaultEngramInstaller}`,
    [workersInstallerTestUrl]: process.env[workersInstallerTestUrl] ?? `file://${defaultWorkersInstaller}`,
    ...extraEnv,
  };
  for (const [name, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await operation();
  } finally {
    // Pase lo que pase en `operation`, las variables vuelven a su valor anterior.
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

/**
 * Levanta un servidor HTTP local (puerto libre de `127.0.0.1`) que imita la API de releases de GitHub para un
 * binario. Una ruta que empieza con `/mismatch/` publica una huella de ceros en lugar de la real; con
 * `/unsafe-assets/` anuncia los archivos en `https://127.0.0.1:1`; con cualquier otra (las pruebas usan `/good/`)
 * todo es correcto. Lo que no es la release ni sus archivos responde 404.
 * @param artifact Nombre del binario de release que se anuncia y se sirve.
 * @param fixturePath Ruta del archivo cuyo contenido se sirve como ese binario y del que sale la huella correcta.
 * @returns El servidor; quien lo crea debe pararlo con `stop(true)`.
 * @throws Error con la salida de error de `shasum` (ver `sha256`) si no se puede calcular la huella del binario de prueba.
 */
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
      // Datos de la release: la lista de archivos (manifiesto de huellas y binario) con su dirección de descarga.
      if (url.pathname.endsWith("/releases/latest") || url.pathname.includes("/releases/tags/")) {
        return Response.json({
          assets: [
            { name: "SHA256SUMS", browser_download_url: `${assetBaseUrl}/download/SHA256SUMS` },
            { name: artifact, browser_download_url: `${assetBaseUrl}/download/${artifact}` },
          ],
        });
      }
      // Manifiesto: una línea `<huella>  <binario>`; con `/mismatch/` la huella es de ceros y no coincide.
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

// Después de cada prueba se borran las carpetas temporales que creó `temporaryDirectory`.
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

/**
 * Comprueba que, para zsh, bash y fish, instalar dos veces (la segunda con `--force`) en una carpeta elegida deje el
 * archivo de configuración con su contenido anterior, la línea de PATH propia de cada terminal y un solo bloque marcado.
 */
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

/**
 * Comprueba que con una terminal desconocida (`/bin/unknown`) el instalador termine bien, imprima la orden `export PATH=…`
 * y la palabra «manually» (a mano), y deje intactos los cuatro archivos de configuración, también en la segunda corrida con `--force`.
 */
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

/**
 * Comprueba que una instalación sin opciones deje el binario en `<HOME>/.forge614/atlas/bin`, imprima `forge614-atlas init`
 * y ponga permisos 700 (solo la persona dueña) en `atlas` y en `atlas/bin`.
 */
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

/**
 * Comprueba que una segunda instalación sobre el mismo destino, sin `--force`, termine con un código distinto de 0 y
 * que el binario siga con el contenido de la release de prueba (las dos copias son idénticas, así que no detecta un
 * reemplazo).
 */
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

/**
 * Comprueba que, si la huella SHA-256 publicada no coincide con la del binario descargado, el instalador termine con un
 * código distinto de 0 y no cree ni el binario ni la carpeta `.forge614`.
 */
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

/**
 * Comprueba que una dirección de pruebas con HTTPS o con usuario incrustado (`@`) se rechace con el aviso de que debe
 * ser HTTP local (loopback: la propia máquina) y sin crear el destino ni `.forge614`.
 */
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

/**
 * Comprueba que usar la dirección de pruebas sin `FORGE614_ATLAS_INSTALLER_TEST=1` termine con un código distinto de 0 y el
 * aviso «reserved for test fixtures» (reservado para pruebas), sin crear el destino ni `.forge614`.
 */
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

/**
 * Comprueba que, si los datos de la release anuncian sus archivos en una dirección que no es HTTP local, el instalador
 * termine con un código distinto de 0 y el aviso «unsafe test fixture URL», sin crear el destino ni `.forge614`.
 */
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

/**
 * Comprueba que, con un instalador de Engram FALSO, Atlas deje Engram en `<HOME>/.forge614/engram/bin` y no cree
 * `.claude.json` ni `.codex/config.toml` (la configuración de Claude Code y de Codex).
 * No revisa la configuración de ningún otro asistente.
 */
test("installs Forge614 Engram as a dependency without configuring an AI client", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "bin");
  const fakeHome = join(root, "home");
  const engramInstaller = writeFakeInstaller(root, "engram", {}, join(root, "calls.log"));
  mkdirSync(fakeHome, { recursive: true });
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    const result = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]), true, undefined, {
      [engramInstallerTestUrl]: `file://${engramInstaller}`,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(existsSync(join(fakeHome, ".forge614", "engram", "bin", "forge614-engram"))).toBe(true);
    expect(existsSync(join(fakeHome, ".claude.json"))).toBe(false);
    expect(existsSync(join(fakeHome, ".codex", "config.toml"))).toBe(false);
  } finally {
    server.stop(true);
  }
});

/**
 * Comprueba que una URL de reemplazo del instalador de Engram que no es `file://` (aquí HTTPS) se rechace con «must be a
 * local file URL», con un código distinto de 0 y sin crear el destino.
 */
test("rejects a non-file Engram installer override", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "untrusted-bin");
  const fakeHome = join(root, "empty-home");
  mkdirSync(fakeHome);
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    const result = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]), true, undefined, {
      [engramInstallerTestUrl]: "https://example.invalid/install.sh",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("must be a local file URL");
    expect(existsSync(destination)).toBe(false);
  } finally {
    server.stop(true);
  }
});

/**
 * Comprueba lo mismo para el instalador de Workers: una URL de reemplazo HTTPS se rechaza con «The Workers test installer
 * must be a local file URL», con un código distinto de 0 y sin crear el destino.
 */
test("rejects a non-file Workers installer override", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "untrusted-bin");
  const fakeHome = join(root, "empty-home");
  mkdirSync(fakeHome);
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    const result = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]), true, undefined, {
      [workersInstallerTestUrl]: "https://example.invalid/install.sh",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("The Workers test installer must be a local file URL");
    expect(existsSync(destination)).toBe(false);
  } finally {
    server.stop(true);
  }
});

/** Un escenario de corrida: qué hay ya instalado (una versión, `null` sin `--version`, o nada), cómo se portan los instaladores falsos, el valor de `FORGE614_HOME` y las opciones. */
interface Scenario {
  /** Engram falso ya instalado: su versión, `null` si no responde `--version`, o sin el campo si no hay Engram. */
  engram?: string | null;
  /** Workers falso ya instalado: su versión, `null` si no responde `--version`, o sin el campo si no hay Workers. */
  workers?: string | null;
  /** Engines falso ya instalado; sin el campo, no hay Engines. */
  engines?: EnginesSpec;
  /** Cómo se porta el instalador publicado falso de Engram; por omisión instala la versión mínima. */
  engramInstaller?: InstallerBehavior;
  /** Cómo se porta el instalador publicado falso de Workers; por omisión instala la versión mínima y un Engines con candado. */
  workersInstaller?: InstallerBehavior;
  /** `"custom"` (por defecto): una carpeta distinta de `$HOME/.forge614`; `"unset"`: sin variable; otro texto: ese valor. */
  forgeHome?: string;
  /** Opciones que se le pasan al instalador; por omisión ninguna. */
  args?: string[];
}

/**
 * Corre el instalador con un `HOME` temporal, con Engram, Workers y Engines FALSOS ya instalados según `scenario`, con
 * instaladores publicados FALSOS y con `FORGE614_HOME` según `scenario.forgeHome` (por omisión, una carpeta temporal).
 * Nunca toca el `HOME` real.
 * @param scenario Qué hay ya instalado, cómo se portan los instaladores falsos, qué valor tiene `FORGE614_HOME` y qué opciones recibe el instalador.
 * @returns El resultado, las carpetas usadas (`home` y `forgeHome`), la ruta esperada del binario de Atlas (`atlasBinary`) y las llamadas que recibieron los instaladores falsos.
 */
async function runScenario(scenario: Scenario) {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const home = join(root, "home");
  const log = join(root, "calls.log");
  mkdirSync(home, { recursive: true });
  writeFileSync(fixture, fixtureBytes);

  // `forgeHomeSetting` es el valor pedido; `forgeHome` es la carpeta donde se esperan los productos: con `"custom"`
  // una carpeta temporal propia, con `"unset"` la de siempre bajo `HOME` (y la variable no se fija), y con otro texto
  // ese mismo valor (aunque sea vacío o relativo).
  const forgeHomeSetting = scenario.forgeHome ?? "custom";
  const forgeHome =
    forgeHomeSetting === "custom" ? join(root, "forge614-custom") : forgeHomeSetting === "unset" ? join(home, ".forge614") : forgeHomeSetting;
  // Solo se instalan por adelantado los programas falsos que el escenario menciona.
  if (scenario.engram !== undefined) writeFakeVersioned(join(forgeHome, "engram", "bin", "forge614-engram"), "forge614-engram", scenario.engram);
  if (scenario.workers !== undefined) writeFakeVersioned(join(forgeHome, "workers", "bin", "forge614-workers"), "forge614-workers", scenario.workers);
  if (scenario.engines) writeFakeEngines(join(forgeHome, "engines", "bin", "forge614-engines"), scenario.engines);

  const engramInstaller = writeFakeInstaller(root, "engram", scenario.engramInstaller ?? {}, log);
  const workersInstaller = writeFakeInstaller(root, "workers", scenario.workersInstaller ?? { engines: goodEngines }, log);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  try {
    const result = await withFixtureEnvironment(home, `${server.url}good`, () => runInstaller(scenario.args ?? []), true, "/bin/zsh", {
      [engramInstallerTestUrl]: `file://${engramInstaller}`,
      [workersInstallerTestUrl]: `file://${workersInstaller}`,
      ...(forgeHomeSetting === "unset" ? {} : { [forgeHomeVariable]: forgeHomeSetting === "custom" ? forgeHome : forgeHomeSetting }),
    });
    // Cada línea del registro es una llamada que recibió un instalador falso (ver `writeFakeInstaller`).
    const calls = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(line => line !== "") : [];
    return { result, home, forgeHome, calls, atlasBinary: join(forgeHome, "atlas", "bin", "forge614-atlas") };
  } finally {
    server.stop(true);
  }
}

/**
 * Agrupa las pruebas de las dependencias (Engram, Workers y Engines) y de `FORGE614_HOME` (la carpeta donde viven los
 * productos Forge614); todas corren el instalador con `runScenario`.
 */
describe("dependencies and FORGE614_HOME", () => {
  /**
   * Comprueba que, sin nada instalado, corran los instaladores de Engram y de Workers una vez cada uno y sin argumentos
   * (sin `--force`), con la carpeta `FORGE614_HOME` temporal, y que después quede el binario de Atlas sin crear `<HOME>/.forge614`.
   */
  test("a clean machine runs the published Engram and Workers installers (no --force) and then installs Atlas", async () => {
    const run = await runScenario({});

    expect(run.result.exitCode, run.result.stderr).toBe(0);
    expect(run.calls).toEqual([`engram|${run.forgeHome}|`, `workers|${run.forgeHome}|`]);
    expect(existsSync(run.atlasBinary)).toBe(true);
    expect(existsSync(join(run.home, ".forge614"))).toBe(false);
  });

  /**
   * Comprueba que con Engram, Workers y Engines ya en la versión mínima o en una más nueva no se corra ningún instalador y se
   * impriman las tres líneas «… is compatible».
   */
  test.each([
    ["the minimum versions", "1.8.7", "1.0.0", "1.17.0"],
    ["newer versions", "1.9.2", "2.0.0", "1.18.0"],
  ])("does not reinstall Engram, Workers or Engines when %s are already there", async (_name, engram, workers, engines) => {
    const run = await runScenario({ engram, workers, engines: { version: engines, supportsReadOnly: true } });

    expect(run.result.exitCode, run.result.stderr).toBe(0);
    expect(run.calls).toEqual([]);
    expect(run.result.stdout).toContain("Forge614 Engram is compatible");
    expect(run.result.stdout).toContain("Forge614 Workers is compatible");
    expect(run.result.stdout).toContain("Forge614 Engines is compatible");
    expect(existsSync(run.atlasBinary)).toBe(true);
  });

  /**
   * Comprueba que un Engram anterior a 1.8.7, o que no responde `--version`, se actualice corriendo solo su instalador con
   * `--force` (el instalador lo pide cuando ya hay un archivo en la ruta de Engram) y que Atlas quede instalado.
   */
  test.each([
    ["is 1.5.0", "1.5.0"],
    ["is 1.8.6", "1.8.6"],
    ["does not answer --version", null],
  ])("updates an Engram that %s with --force, the way Engram's own update does", async (_name, engram) => {
    const run = await runScenario({ engram, workers: "1.0.0", engines: goodEngines });

    expect(run.result.exitCode, run.result.stderr).toBe(0);
    expect(run.calls).toEqual([`engram|${run.forgeHome}|--force`]);
    expect(existsSync(run.atlasBinary)).toBe(true);
  });

  /**
   * Comprueba que un Workers 0.1.0, o que no responde `--version`, se reinstale corriendo solo el instalador de Workers y sin
   * `--force`, y que Atlas quede instalado.
   */
  test.each([
    ["is 0.1.0", "0.1.0"],
    ["has no --version", null],
  ])("installs a Workers that %s, without --force", async (_name, workers) => {
    const run = await runScenario({ engram: "1.8.7", workers, engines: goodEngines });

    expect(run.result.exitCode, run.result.stderr).toBe(0);
    expect(run.calls).toEqual([`workers|${run.forgeHome}|`]);
    expect(existsSync(run.atlasBinary)).toBe(true);
  });

  /**
   * Comprueba ocho situaciones en que una dependencia no se puede cumplir (instalador que falla, versión que sigue vieja,
   * Engines sin el candado de solo lectura, viejo o ausente): salida 1, el motivo y «Atlas was not changed.» en stderr, y nada
   * de Atlas creado ni PATH publicado.
   */
  test.each([
    ["the Workers installer fails", { workersInstaller: { fails: true } }, "Forge614 Workers could not be installed"],
    ["the Workers installer leaves a Workers older than 1.0.0", { workersInstaller: { installs: "0.1.0", engines: goodEngines } }, "Forge614 Workers is still missing or older than 1.0.0"],
    ["the Engram installer fails", { engramInstaller: { fails: true } }, "Forge614 Engram could not be installed or updated"],
    ["Engram stays older than 1.8.7", { engram: "1.5.0", engramInstaller: { installs: "1.5.0" } }, "Forge614 Engram is still missing or older than 1.8.7"],
    ["Engines does not report supportsReadOnly: true", { engram: "1.8.7", workers: "1.0.0", engines: { version: "1.17.0", supportsReadOnly: false } }, "read-only lock"],
    ["Engines does not report supportsReadOnly at all", { engram: "1.8.7", workers: "1.0.0", engines: { version: "1.17.0", supportsReadOnly: "absent" } }, "read-only lock"],
    ["Engines is older than 1.17.0", { engram: "1.8.7", workers: "1.0.0", engines: { version: "1.16.0", supportsReadOnly: true } }, "Forge614 Engines 1.17.0 or newer"],
    ["Engines is missing although Workers is fine", { engram: "1.8.7", workers: "1.0.0" }, "Forge614 Engines 1.17.0 or newer"],
  ] as [string, Scenario, string][])("creates nothing of Atlas and exits 1 with the reason when %s", async (_name, scenario, reason) => {
    const run = await runScenario(scenario);

    expect(run.result.exitCode).toBe(1);
    expect(run.result.stderr).toContain(reason);
    expect(run.result.stderr).toContain("Atlas was not changed.");
    expect(existsSync(join(run.forgeHome, "atlas"))).toBe(false);
    expect(existsSync(run.atlasBinary)).toBe(false);
    // Tampoco se publicó el PATH en el perfil de la terminal.
    expect(existsSync(join(run.home, ".zshrc"))).toBe(false);
    expect(readdirSync(run.home)).toEqual([]);
  });

  /**
   * Comprueba que con un `FORGE614_HOME` absoluto todo quede ahí (los binarios de Engram, Workers y Engines, el de Atlas con
   * permisos 700 en su `bin` y la línea de PATH en `.zshrc`) y nada en `<HOME>/.forge614`.
   */
  test("an absolute FORGE614_HOME receives everything: the dependencies, the Atlas binary and its permissions", async () => {
    const run = await runScenario({ forgeHome: "custom" });

    expect(run.result.exitCode, run.result.stderr).toBe(0);
    expect(run.calls).toEqual([`engram|${run.forgeHome}|`, `workers|${run.forgeHome}|`]);
    expect(existsSync(join(run.forgeHome, "engram", "bin", "forge614-engram"))).toBe(true);
    expect(existsSync(join(run.forgeHome, "workers", "bin", "forge614-workers"))).toBe(true);
    expect(existsSync(join(run.forgeHome, "engines", "bin", "forge614-engines"))).toBe(true);
    expect(existsSync(run.atlasBinary)).toBe(true);
    expect(statSync(join(run.forgeHome, "atlas", "bin")).mode & 0o777).toBe(0o700);
    expect(readFileSync(join(run.home, ".zshrc"), "utf8")).toContain(join(run.forgeHome, "atlas", "bin"));
    // Nada cae en el $HOME/.forge614 de siempre.
    expect(existsSync(join(run.home, ".forge614"))).toBe(false);
  });

  /**
   * Comprueba que sin la variable `FORGE614_HOME` el instalador use `<HOME>/.forge614`: corre los instaladores de Engram y
   * de Workers allí y deja el binario de Atlas.
   */
  test("without FORGE614_HOME everything falls in $HOME/.forge614", async () => {
    const run = await runScenario({ forgeHome: "unset" });

    expect(run.result.exitCode, run.result.stderr).toBe(0);
    expect(run.forgeHome).toBe(join(run.home, ".forge614"));
    expect(run.calls).toEqual([`engram|${run.forgeHome}|`, `workers|${run.forgeHome}|`]);
    expect(existsSync(run.atlasBinary)).toBe(true);
  });

  /**
   * Comprueba que un `FORGE614_HOME` vacío o relativo termine con salida 1 y el mensaje `INVALID_FORGE614_HOME: …`, sin
   * correr ningún instalador, sin crear nada en `HOME` y sin crear una carpeta `relative` en el directorio actual.
   */
  test.each([
    ["empty", ""],
    ["relative", "relative/forge614"],
  ])("a %s FORGE614_HOME is INVALID_FORGE614_HOME and nothing is created or downloaded", async (_name, value) => {
    const run = await runScenario({ forgeHome: value });

    expect(run.result.exitCode).toBe(1);
    expect(run.result.stderr).toContain("INVALID_FORGE614_HOME: FORGE614_HOME must be a non-empty absolute path.");
    expect(run.calls).toEqual([]);
    expect(readdirSync(run.home)).toEqual([]);
    expect(existsSync(join(process.cwd(), "relative"))).toBe(false);
  });

  /**
   * Comprueba que `--help` termine con salida 0, nombre `FORGE614_HOME` y las versiones mínimas de Engram (1.8.7) y de
   * Workers (1.0.0), y no corra ningún instalador; la versión mínima de Engines (1.17.0) no se verifica.
   */
  test("--help names FORGE614_HOME and the minimum versions, and exits 0", async () => {
    const run = await runScenario({ args: ["--help"] });

    expect(run.result.exitCode, run.result.stderr).toBe(0);
    expect(run.result.stdout).toContain("FORGE614_HOME");
    expect(run.result.stdout).toContain("Engram 1.8.7");
    expect(run.result.stdout).toContain("Workers 1.0.0");
    expect(run.calls).toEqual([]);
  });
});
