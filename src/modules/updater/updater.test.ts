/**
 * Comprueba la ruta del comando, la descarga temporal y la actualización con instaladores falsos; revisa las
 * versiones y las respuestas del comando sin instalar Atlas ni consultar una release real.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  LATEST_INSTALLER_URL,
  downloadInstaller,
  installedAtlasCommand,
  runUpdateCommand,
  updateInstalledAtlas,
} from "./updater";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Crea una carpeta Forge614 temporal con un `forge614-atlas` FALSO que responde `--version`.
 * @param versionLine Línea exacta que imprime el comando falso, válida o inválida según la prueba.
 * @returns Carpeta Forge614 temporal donde quedó el comando ejecutable.
 */
function forgeHomeWithFakeAtlas(versionLine: string): string {
  const forgeHome = mkdtempSync(join(tmpdir(), "atlas-update-home-"));
  tempDirs.push(forgeHome);
  const command = installedAtlasCommand(forgeHome);
  mkdirSync(dirname(command), { recursive: true });
  writeFileSync(command, `#!/bin/sh\nprintf '%s\\n' '${versionLine}'\n`);
  chmodSync(command, 0o755);
  return forgeHome;
}

/** Crea un fetcher falso que emula las respuestas HTTP de GitHub releases para pruebas de actualización. */
function fakeReleaseFetcher(options: {
  tag?: string;
  scriptContent?: string;
  sha256sums?: string;
  failAsset?: boolean;
  failSums?: boolean;
} = {}): typeof fetch {
  const tag = options.tag ?? "v1.2.3";
  const script = options.scriptContent ?? "#!/bin/sh\nexit 0\n";
  const scriptSha = createHash("sha256").update(script).digest("hex");
  const sums = options.sha256sums ?? `${scriptSha}  install.sh\n`;

  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/releases/latest")) {
      return new Response(JSON.stringify({ tag_name: tag }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/install.sh")) {
      if (options.failAsset) return new Response("Not found", { status: 404 });
      return new Response(script, { status: 200 });
    }
    if (url.endsWith("/SHA256SUMS")) {
      if (options.failSums) return new Response("Not found", { status: 404 });
      return new Response(sums, { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  }) as unknown as typeof fetch;
}

/** Agrupa la comprobación de la ruta del comando que deja el instalador. */
describe("installedAtlasCommand", () => {
  /** Comprueba que la carpeta recibida antecede a `atlas/bin/forge614-atlas`. */
  test("builds the launcher path on top of the given Forge614 folder", () => {
    expect(installedAtlasCommand("/opt/forge614")).toBe("/opt/forge614/atlas/bin/forge614-atlas");
  });
});

/** Agrupa los casos de descarga, verificación SHA-256, ejecución, lectura de versión y limpieza del instalador temporal. */
describe("updateInstalledAtlas", () => {
  /** Comprueba resolución de release, verificación SHA-256, invocación del instalador y versiones resultantes. */
  test("downloads the release gatekeeper, verifies SHA-256, runs it, reads installed version and cleans up", async () => {
    const forgeHome = forgeHomeWithFakeAtlas("forge614-atlas 1.2.3");
    const calls: string[] = [];

    const result = await updateInstalledAtlas("1.0.0", forgeHome, {
      fetcher: fakeReleaseFetcher(),
      spawn: (command, args) => {
        calls.push(`${command} ${args.join(" ")}`);
        return { status: 0 };
      },
    });

    expect(calls[0]).toMatch(/^bash .*\/install\.sh --version v1\.2\.3$/);
    expect(result).toEqual({ updated: true, previousVersion: "1.0.0", installedVersion: "1.2.3" });
  });

  /** Comprueba que versiones iguales devuelven `updated: false` con ambas versiones en `1.0.0`. */
  test("reports updated: false when the installed version equals the running one", async () => {
    const forgeHome = forgeHomeWithFakeAtlas("forge614-atlas 1.0.0");

    const result = await updateInstalledAtlas("1.0.0", forgeHome, {
      fetcher: fakeReleaseFetcher({ tag: "v1.0.0" }),
      spawn: () => ({ status: 0 }),
    });

    expect(result).toEqual({ updated: false, previousVersion: "1.0.0", installedVersion: "1.0.0" });
  });

  /** Comprueba que un SHA256SUMS que no coincide detiene el update sin ejecutar el instalador. */
  test("a mismatched SHA256SUMS stops the update and never launches the installer", async () => {
    let launched = false;
    const badSums = "0000000000000000000000000000000000000000000000000000000000000000  install.sh\n";

    await expect(
      updateInstalledAtlas("1.0.0", "/nonexistent/forge614", {
        fetcher: fakeReleaseFetcher({ sha256sums: badSums }),
        spawn: () => {
          launched = true;
          return { status: 0 };
        },
      }),
    ).rejects.toThrow("SHA-256 verification failed for install.sh.");

    expect(launched).toBe(false);
  });

  /** Comprueba que un estado 1 del instalador produce el error esperado y limpia el temporal. */
  test("an installer that fails rejects and still removes the temporary file", async () => {
    const forgeHome = forgeHomeWithFakeAtlas("forge614-atlas 1.2.3");

    await expect(
      updateInstalledAtlas("1.0.0", forgeHome, {
        fetcher: fakeReleaseFetcher(),
        spawn: () => ({ status: 1 }),
      }),
    ).rejects.toThrow("The Forge614 Atlas installer failed; the installed version was not confirmed.");
  });

  /** Comprueba que un texto de versión sin formato X.Y.Z se rechaza y aun así se borra el temporal. */
  test("an installed version with an invalid format rejects and still removes the temporary file", async () => {
    const forgeHome = forgeHomeWithFakeAtlas("atlas version one point two");

    await expect(
      updateInstalledAtlas("1.0.0", forgeHome, {
        fetcher: fakeReleaseFetcher(),
        spawn: () => ({ status: 0 }),
      }),
    ).rejects.toThrow("The installed Forge614 Atlas did not report a valid version.");
  });

  /** Comprueba que `1.2.3` sin el nombre `forge614-atlas` se rechaza como versión instalada. */
  test("a version printed without the product name is not valid either", async () => {
    const forgeHome = forgeHomeWithFakeAtlas("1.2.3");

    await expect(
      updateInstalledAtlas("1.0.0", forgeHome, {
        fetcher: fakeReleaseFetcher(),
        spawn: () => ({ status: 0 }),
      }),
    ).rejects.toThrow("The installed Forge614 Atlas did not report a valid version.");
  });

  /** Comprueba que un error de descarga del activo llega al llamador y evita invocar el instalador. */
  test("a failed download rejects and never launches the installer", async () => {
    let launched = false;

    await expect(
      updateInstalledAtlas("1.0.0", "/nonexistent/forge614", {
        fetcher: fakeReleaseFetcher({ failAsset: true }),
        spawn: () => {
          launched = true;
          return { status: 0 };
        },
      }),
    ).rejects.toThrow("Could not download install.sh for v1.2.3 (HTTP 404).");

    expect(launched).toBe(false);
  });

  /** Comprueba que un fallo al descargar SHA256SUMS detiene la ejecución sin lanzar el instalador. */
  test("a failed SHA256SUMS download rejects and never launches the installer", async () => {
    let launched = false;

    await expect(
      updateInstalledAtlas("1.0.0", "/nonexistent/forge614", {
        fetcher: fakeReleaseFetcher({ failSums: true }),
        spawn: () => {
          launched = true;
          return { status: 0 };
        },
      }),
    ).rejects.toThrow("Could not download SHA256SUMS for v1.2.3 (HTTP 404).");

    expect(launched).toBe(false);
  });

  /** Comprueba que un error simulado al iniciar bash llega al llamador y limpia el temporal. */
  test("a process that cannot start surfaces its own error and removes the temporary file", async () => {
    await expect(
      updateInstalledAtlas("1.0.0", "/nonexistent/forge614", {
        fetcher: fakeReleaseFetcher(),
        spawn: () => ({ status: null, error: new Error("spawn bash ENOENT") }),
      }),
    ).rejects.toThrow("spawn bash ENOENT");
  });
});

/** Agrupa las respuestas con éxito, fallo de instalación y argumentos sobrantes. */
describe("runUpdateCommand", () => {
  /** Comprueba el resultado con código 0 y los campos `updated`, `previousVersion` e `installedVersion` con `--json`. */
  test("prints the success answer with updated, previousVersion and installedVersion with --json", async () => {
    const outcome = await runUpdateCommand(["--json"], "1.0.0", "/opt/forge614", async (currentVersion, forgeHome) => {
      expect(currentVersion).toBe("1.0.0");
      expect(forgeHome).toBe("/opt/forge614");
      return { updated: true, previousVersion: "1.0.0", installedVersion: "1.2.3" };
    });

    expect(outcome).toEqual({
      exitCode: 0,
      payload: { schemaVersion: 1, status: "updated", updated: true, previousVersion: "1.0.0", installedVersion: "1.2.3" },
    });
  });

  /** Comprueba que sin `--json` devuelve el mensaje de texto para personas. */
  test("prints human readable text when --json is omitted", async () => {
    const outcome = await runUpdateCommand([], "1.0.0", "/opt/forge614", async () => {
      return { updated: true, previousVersion: "1.0.0", installedVersion: "1.2.3" };
    });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain("forge614-atlas se actualizó de 1.0.0 a 1.2.3.");
  });

  /** Comprueba que el error del actualizador se convierte en `UPDATE_FAILED` con código de salida 1. */
  test("a failed update answers with the error envelope and exit code 1", async () => {
    const outcome = await runUpdateCommand([], "1.0.0", "/opt/forge614", async () => {
      throw new Error("The Forge614 Atlas installer failed; the installed version was not confirmed.");
    });

    expect(outcome).toEqual({
      exitCode: 1,
      payload: {
        schemaVersion: 1,
        status: "error",
        error: { code: "UPDATE_FAILED", message: "The Forge614 Atlas installer failed; the installed version was not confirmed." },
      },
    });
  });

  /** Comprueba que `--force` como argumento extra devuelve `INVALID_ARGUMENT` sin llamar a la actualización. */
  test("refuses extra arguments without updating anything", async () => {
    let called = false;

    const outcome = await runUpdateCommand(["--force"], "1.0.0", "/opt/forge614", async () => {
      called = true;
      return { updated: false, previousVersion: "1.0.0", installedVersion: "1.0.0" };
    });

    expect(called).toBe(false);
    expect(outcome).toEqual({
      exitCode: 1,
      payload: { schemaVersion: 1, status: "error", error: { code: "INVALID_ARGUMENT", message: "Unknown argument for update: --force" } },
    });
  });
});

/** Agrupa las pruebas de escritura y rechazo HTTP con un servidor local (la propia máquina). */
describe("downloadInstaller", () => {
  /** Comprueba bytes, permiso 700 y que `cleanup` borra el archivo descargado. */
  test("saves the installer in a private temporary file and cleanup removes it", async () => {
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("#!/bin/sh\necho installer\n") });
    try {
      const { installer, cleanup } = await downloadInstaller(`http://127.0.0.1:${server.port}/install.sh`);
      expect(readFileSync(installer, "utf8")).toBe("#!/bin/sh\necho installer\n");
      expect(statSync(installer).mode & 0o777).toBe(0o700);
      cleanup();
      expect(existsSync(installer)).toBe(false);
    } finally {
      server.stop(true);
    }
  });

  /** Comprueba que una respuesta HTTP 404 produce el mensaje de descarga fallida. */
  test("an HTTP error status rejects with a clear message and leaves no file behind", async () => {
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("nope", { status: 404 }) });
    try {
      await expect(downloadInstaller(`http://127.0.0.1:${server.port}/install.sh`)).rejects.toThrow(
        "Could not download the Forge614 Atlas installer.",
      );
    } finally {
      server.stop(true);
    }
  });
});
