/**
 * Comprueba la ruta del comando, la descarga temporal y la actualización con instaladores falsos; revisa las
 * versiones y las respuestas del comando sin instalar Atlas ni consultar una release real.
 */
import { afterEach, describe, expect, test } from "bun:test";
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

/** Crea un instalador descargado FALSO: un archivo real en una carpeta temporal para comprobar que se borra.
 * @returns Función de descarga falsa, ruta del instalador y lista de URL recibidas.
 */
function fakeDownload(): { download: (url: string) => Promise<{ installer: string; cleanup: () => void }>; installer: string; urls: string[] } {
  const directory = mkdtempSync(join(tmpdir(), "atlas-update-installer-"));
  tempDirs.push(directory);
  const installer = join(directory, "install.sh");
  writeFileSync(installer, "#!/bin/sh\nexit 0\n");
  const urls: string[] = [];
  return {
    installer,
    urls,
    download: async url => {
      urls.push(url);
      return { installer, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
    },
  };
}

/** Agrupa la comprobación de la ruta del comando que deja el instalador. */
describe("installedAtlasCommand", () => {
  /** Comprueba que la carpeta recibida antecede a `atlas/bin/forge614-atlas`. */
  test("builds the launcher path on top of the given Forge614 folder", () => {
    expect(installedAtlasCommand("/opt/forge614")).toBe("/opt/forge614/atlas/bin/forge614-atlas");
  });
});

/** Agrupa los casos de descarga, ejecución, lectura de versión y limpieza del instalador temporal. */
describe("updateInstalledAtlas", () => {
  /** Comprueba URL de la última release, llamada a bash con `--force`, versiones devueltas y borrado del temporal. */
  test("downloads the latest installer, runs it with --force, reads the installed version and removes the temporary file", async () => {
    const forgeHome = forgeHomeWithFakeAtlas("forge614-atlas 1.2.3");
    const double = fakeDownload();
    const calls: string[] = [];

    const result = await updateInstalledAtlas("1.0.0", forgeHome, {
      download: double.download,
      spawn: (command, args) => {
        calls.push(`${command} ${args.join(" ")}`);
        return { status: 0 };
      },
    });

    expect(double.urls).toEqual(["https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh"]);
    expect(LATEST_INSTALLER_URL).toBe("https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh");
    expect(calls).toEqual([`bash ${double.installer} --force`]);
    expect(result).toEqual({ updated: true, previousVersion: "1.0.0", installedVersion: "1.2.3" });
    expect(existsSync(double.installer)).toBe(false);
  });

  /** Comprueba que versiones iguales devuelven `updated: false` con ambas versiones en `1.0.0`. */
  test("reports updated: false when the installed version equals the running one", async () => {
    const forgeHome = forgeHomeWithFakeAtlas("forge614-atlas 1.0.0");

    const result = await updateInstalledAtlas("1.0.0", forgeHome, {
      download: fakeDownload().download,
      spawn: () => ({ status: 0 }),
    });

    expect(result).toEqual({ updated: false, previousVersion: "1.0.0", installedVersion: "1.0.0" });
  });

  /** Comprueba que un estado 1 del instalador produce el error esperado y borra el archivo temporal. */
  test("an installer that fails rejects and still removes the temporary file", async () => {
    const forgeHome = forgeHomeWithFakeAtlas("forge614-atlas 1.2.3");
    const double = fakeDownload();

    await expect(
      updateInstalledAtlas("1.0.0", forgeHome, { download: double.download, spawn: () => ({ status: 1 }) }),
    ).rejects.toThrow("The Forge614 Atlas installer failed; the installed version was not confirmed.");

    expect(existsSync(double.installer)).toBe(false);
  });

  /** Comprueba que un texto de versión sin formato X.Y.Z se rechaza y aun así se borra el temporal. */
  test("an installed version with an invalid format rejects and still removes the temporary file", async () => {
    const forgeHome = forgeHomeWithFakeAtlas("atlas version one point two");
    const double = fakeDownload();

    await expect(
      updateInstalledAtlas("1.0.0", forgeHome, { download: double.download, spawn: () => ({ status: 0 }) }),
    ).rejects.toThrow("The installed Forge614 Atlas did not report a valid version.");

    expect(existsSync(double.installer)).toBe(false);
  });

  /** Comprueba que `1.2.3` sin el nombre `forge614-atlas` se rechaza como versión instalada. */
  test("a version printed without the product name is not valid either", async () => {
    const forgeHome = forgeHomeWithFakeAtlas("1.2.3");

    await expect(
      updateInstalledAtlas("1.0.0", forgeHome, { download: fakeDownload().download, spawn: () => ({ status: 0 }) }),
    ).rejects.toThrow("The installed Forge614 Atlas did not report a valid version.");
  });

  /** Comprueba que un error de descarga llega al llamador y evita incluso invocar el lanzador falso. */
  test("a failed download rejects and never launches the installer", async () => {
    let launched = false;

    await expect(
      updateInstalledAtlas("1.0.0", "/nonexistent/forge614", {
        download: async () => {
          throw new Error("Could not download the Forge614 Atlas installer.");
        },
        spawn: () => {
          launched = true;
          return { status: 0 };
        },
      }),
    ).rejects.toThrow("Could not download the Forge614 Atlas installer.");

    expect(launched).toBe(false);
  });

  /** Comprueba que el error al iniciar bash llega al llamador y el temporal se borra. */
  test("a process that cannot start surfaces its own error and removes the temporary file", async () => {
    const double = fakeDownload();

    await expect(
      updateInstalledAtlas("1.0.0", "/nonexistent/forge614", {
        download: double.download,
        spawn: () => ({ status: null, error: new Error("spawn bash ENOENT") }),
      }),
    ).rejects.toThrow("spawn bash ENOENT");

    expect(existsSync(double.installer)).toBe(false);
  });
});

/** Agrupa las respuestas con éxito, fallo de instalación y argumentos sobrantes. */
describe("runUpdateCommand", () => {
  /** Comprueba el resultado con código 0 y los campos `updated`, `previousVersion` e `installedVersion`. */
  test("prints the success answer with updated, previousVersion and installedVersion", async () => {
    const outcome = await runUpdateCommand([], "1.0.0", "/opt/forge614", async (currentVersion, forgeHome) => {
      expect(currentVersion).toBe("1.0.0");
      expect(forgeHome).toBe("/opt/forge614");
      return { updated: true, previousVersion: "1.0.0", installedVersion: "1.2.3" };
    });

    expect(outcome).toEqual({
      exitCode: 0,
      payload: { schemaVersion: 1, status: "updated", updated: true, previousVersion: "1.0.0", installedVersion: "1.2.3" },
    });
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
      payload: { schemaVersion: 1, status: "error", error: { code: "INVALID_ARGUMENT", message: "forge614-atlas update takes no arguments." } },
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
