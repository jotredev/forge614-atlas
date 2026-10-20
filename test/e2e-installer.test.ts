/**
 * Pruebas de punta a punta (end-to-end, e2e) del instalador y ciclo de vida de Forge614 Atlas.
 *
 * Cubre los seis escenarios exigidos por la especificación del orquestador:
 * 1. Instalación limpia con el portero desde un FORGE614_HOME vacío (Atlas 1.2.0, Engram 1.10.0, Workers 1.1.0, Engines 1.18.0).
 * 2. Migración real desde Atlas 1.1.2 a 1.2.0 mediante un único update con proxy TLS local y bloque PATH limpio.
 * 3. Actualización de Engram 1.9.0 a 1.10.0 y migración de memoria desde engram/ a memory/ tras init.
 * 4. Desinstalación segura (rechazo en cwd de Atlas, borrado de carpeta y PATH, preservación de memory/).
 * 5. Desinstalación coordinada desde Engram 1.10.0 que retira Atlas y preserva memory/.
 * 6. Desinstalación mediante install.mjs --uninstall que retira atlas/ y preserva memory/.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  MemoryWorkspace,
  WorkspaceConfig,
  saveProjectMemoryWithSession,
  startProjectSession,
} from "forge614-engram";

const TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDCzCCAfOgAwIBAgIURQFDpCFxdbi11BUGAkVhlf11+OEwDQYJKoZIhvcNAQEL
BQAwFTETMBEGA1UEAwwKZ2l0aHViLmNvbTAeFw0yNjEwMjAwNDIxMDNaFw0yNjEw
MjEwNDIxMDNaMBUxEzARBgNVBAMMCmdpdGh1Yi5jb20wggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQC7NagrzT27PYH4kqmHiRi2JClxO+TwF8Kguh7x62py
nMwe9YHYIp+FUxlGrAPA2petCx9anCVjkjlwLfdv9Qj6e0iPALi+aYxapxjdRsRL
GBIoGb7QXFSYvYJeUs+CvzSAp6NWNWU4AOK/lHkGxQJ/zq7Ml2g8Ih0ob9cR1rQH
2rZuYLwntCRjFLsheaAsZXy1WJVx9dLWTLr6n/RiuruRjzUCGn/8DTkYhnCFsAI9
iZy3r4+NOyP88wcJHvZX19lX7BRpH+DoGPAsvuPO6eNJ0O9omKv6XX21Or3u10gU
VHNffND9wxDpeacFwmRaCiow/trqA1tJNNEjoqtiFCOtAgMBAAGjUzBRMB0GA1Ud
DgQWBBRGYaChvdxq1BF3W6D4Yz9ZJ/UbjjAfBgNVHSMEGDAWgBRGYaChvdxq1BF3
W6D4Yz9ZJ/UbjjAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQB7
jzmrhodc84x0yTD6rkFFWwMUe6nvdma5H9Dzy8Nr0NOqFlfAwB2B5zyRBpxkEOAL
CcO/cd1mEQi1iODsWhaLY18OQ90be28OZhVTTmATKOCG7RmPrEB532dHVRfN+UrV
cpHXJQq80SHvxwKTDt+m6G5QPfTKsd6NJZgtFpGVLEtqlThOkeuf7KvtJYl4QkuT
LThhCdSAoayPAFcbbZ85PhQNQe98wEFwn8iQQtw0jEsGF+nHc3O7pBgELPd18JXR
XLsYY+KJ+D2SijqBibuiAPnm8iAAuOKqxNhOZQRdajN80qUT9vyAmwEFvBCw14Fs
ccc+JYjFc13Y6B2EKGiM
-----END CERTIFICATE-----
`;

const TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7NagrzT27PYH4
kqmHiRi2JClxO+TwF8Kguh7x62pynMwe9YHYIp+FUxlGrAPA2petCx9anCVjkjlw
Lfdv9Qj6e0iPALi+aYxapxjdRsRLGBIoGb7QXFSYvYJeUs+CvzSAp6NWNWU4AOK/
lHkGxQJ/zq7Ml2g8Ih0ob9cR1rQH2rZuYLwntCRjFLsheaAsZXy1WJVx9dLWTLr6
n/RiuruRjzUCGn/8DTkYhnCFsAI9iZy3r4+NOyP88wcJHvZX19lX7BRpH+DoGPAs
vuPO6eNJ0O9omKv6XX21Or3u10gUVHNffND9wxDpeacFwmRaCiow/trqA1tJNNEj
oqtiFCOtAgMBAAECgf8JhW6IJ+00IueS6uzdTtkg+bXaMEs8KDakPbRVMw9vNXXQ
CMswf7EDq1odvghJ4ETWjU6+Hus4hnngP9JlLBZN7qVMTq26ho87ki+NtU48MZGw
lyO7+j3YU6IfrxaCirHUFrKO/K1XRWyUwm4dp3bF4FGdKqWDxZSNGKgulx4gPc9O
u87fovP+So/U7nGEO5uCE5SG0H0as+KydbIhLaA3WHmg9Osk14bvEu6Rh7BgNJVf
XHooeWVqO8oqJviTDdcoXKtol7P56Qz6LhM/edl3PeI7NHrzi7skEPPgv4NcAVT3
hrnhAWpLCix7TalPQEblxedeTMaRuX+RbW8bL5sCgYEA/AW4ZAFCsz7QLoPfNxpq
dOrqNT5VH77zlCL4XX1jSJJgDKzEQEmOJYexMgqMNzPrGdFub8coF1/RHkSV7jD4
LLtHRgngNZ3HkZeY9GXV5Kzm1jfm+kjqnwxZbQr80XnH2SHYgNkuJLNhc/RdNrlP
u+2qy39gczBdScYzvJtiGhcCgYEAvioQo4LDf39qAI/44gg5FYkTX79VrspxVtJw
SBBSbTU58i1jFTcCmJBrWSx0EIbH0M1jJUrEHupo/m5gnQ8uB5z9JK12GgLgxEhB
nEfTjbfT49jUdywFG9+YTOBMredDoXlzS7cIQfbhzALm43GwFAqBQbk2SwOaCOKg
1VcD/tsCgYEA3hq4d0H5I3j/BY9of+qC2YlSYRwO7wxdJDdxhQsFHacKiQEVb8aj
RIYCbqSHD/tsfXNqDY6J0Ze69x7gt2tmvB1MYfhAJWBoyfG9dd3tlDugsDfSEs+C
HitHAGeHiaD2tHA0mtFL7kI8Z3F7WMgV8fwx4mfee4WrIWJQpC6YVX8CgYEAqauK
kPmZSOb8Q2gx3isME8TsPl/PKVeDbL3yZLn7cWkuPIB2iXU9obYpsbTSEfTPz+OR
dLKS7iqkZ29AUKI8pZpS2yjR2T98IGV/9Nq5TRcZvY+3cmUaYdZMYzs172wKkcZ1
MrcqbQDEUmy8aW8Edb0xutxwLtoV05uxeOhcrkUCgYEArv1ruvSi0kpuhNhjhdyt
uF07Qg+DC0ukxKJ8Ogj8iMlei5qLI4oZ76fdtL4xHxX2E7zubLlMlIkdEJxiZhQ0
epZNqYR2S0tXGD3M6hG8KbP/pqYT35ZJ9/Pa9iS+W+05hgfUU4WGCPziAznBBEWM
ezv/wPkLfF+YOSX4oAsaMmI=
-----END PRIVATE KEY-----
`;

const hostTarget = process.platform === "darwin" ? `darwin-${process.arch}` : `linux-${process.arch}`;

let testCacheDir: string;
let buildDir: string;
let atlas120Bin: string;
let atlas120Sha: string;
let nodeJsonContent: string;
let installMjsContent: string;
let installShContent: string;
let sha256sums120: string;

/** Descarga un asset de release de GitHub si no existe en la carpeta de destino. */
async function downloadAsset(repo: string, tag: string, asset: string, destDir: string): Promise<string> {
  const destPath = join(destDir, asset);
  if (existsSync(destPath)) return destPath;
  mkdirSync(destDir, { recursive: true });
  const url = `https://github.com/jotredev/${repo}/releases/download/${tag}/${asset}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Fallo descargando ${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  return destPath;
}

/** Resuelve o prepara la caché local de binarios y dependencias. */
async function setupCache(): Promise<string> {
  const candidates = [
    "/tmp/forge614-test-cache",
    "/tmp/claude-t46/test-cache",
    join(tmpdir(), "forge614-test-cache"),
  ];
  let cache = candidates.find((dir) => existsSync(dir) && existsSync(join(dir, "engram-1.10.0")));
  if (!cache) {
    cache = candidates[0]!;
    mkdirSync(cache, { recursive: true });
  }

  // Asegura que los assets necesarios para hostTarget existan en la caché (descargando en CI si hace falta)
  const downloads: Promise<unknown>[] = [
    downloadAsset("forge614-engram", "v1.10.0", `forge614-engram-${hostTarget}`, join(cache, "engram-1.10.0")),
    downloadAsset("forge614-engram", "v1.10.0", "forge614.node.json", join(cache, "engram-1.10.0")),
    downloadAsset("forge614-engram", "v1.10.0", "install.mjs", join(cache, "engram-1.10.0")),
    downloadAsset("forge614-engram", "v1.10.0", "SHA256SUMS", join(cache, "engram-1.10.0")),

    downloadAsset("forge614-workers", "v1.1.0", `forge614-workers-${hostTarget}`, join(cache, "workers-1.1.0")),
    downloadAsset("forge614-workers", "v1.1.0", "forge614.node.json", join(cache, "workers-1.1.0")),
    downloadAsset("forge614-workers", "v1.1.0", "install.mjs", join(cache, "workers-1.1.0")),
    downloadAsset("forge614-workers", "v1.1.0", "SHA256SUMS", join(cache, "workers-1.1.0")),

    downloadAsset("forge614-engines", "v1.18.0", `forge614-engines-1.18.0-${hostTarget}.tar.gz`, join(cache, "engines-1.18.0")),
    downloadAsset("forge614-engines", "v1.18.0", "forge614.node.json", join(cache, "engines-1.18.0")),
    downloadAsset("forge614-engines", "v1.18.0", "install.mjs", join(cache, "engines-1.18.0")),
    downloadAsset("forge614-engines", "v1.18.0", "SHA256SUMS", join(cache, "engines-1.18.0")),

    downloadAsset("forge614-shell", "v1.17.0", "forge614-shell-1.17.0.tar.gz", join(cache, "shell-1.17.0")),
    downloadAsset("forge614-shell", "v1.17.0", "forge614.node.json", join(cache, "shell-1.17.0")),
    downloadAsset("forge614-shell", "v1.17.0", "install.mjs", join(cache, "shell-1.17.0")),
    downloadAsset("forge614-shell", "v1.17.0", "SHA256SUMS", join(cache, "shell-1.17.0")),

    downloadAsset("forge614-engram", "v1.9.0", `forge614-engram-${hostTarget}`, join(cache, "engram-1.9.0")),

    downloadAsset("forge614-atlas", "v1.1.2", "install.sh", join(cache, "atlas-1.1.2")),
    downloadAsset("forge614-atlas", "v1.1.2", `forge614-atlas-${hostTarget}`, join(cache, "atlas-1.1.2")),
    downloadAsset("forge614-atlas", "v1.1.2", "SHA256SUMS", join(cache, "atlas-1.1.2")),
  ];
  await Promise.all(downloads);

  chmodSync(join(cache, "engram-1.10.0", `forge614-engram-${hostTarget}`), 0o755);
  chmodSync(join(cache, "workers-1.1.0", `forge614-workers-${hostTarget}`), 0o755);
  chmodSync(join(cache, "engram-1.9.0", `forge614-engram-${hostTarget}`), 0o755);
  chmodSync(join(cache, "atlas-1.1.2", "install.sh"), 0o755);
  chmodSync(join(cache, "atlas-1.1.2", `forge614-atlas-${hostTarget}`), 0o755);

  // Asegura que engines esté extraído para facilitar copias rápidas en pruebas
  const enginesExtracted = join(cache, "engines-extracted");
  const extractedTarget = join(enginesExtracted, `forge614-engines-1.18.0-${hostTarget}`, "forge614-engines");
  if (!existsSync(extractedTarget)) {
    const archive = join(cache, "engines-1.18.0", `forge614-engines-1.18.0-${hostTarget}.tar.gz`);
    if (existsSync(archive)) {
      mkdirSync(enginesExtracted, { recursive: true });
      Bun.spawnSync(["tar", "-xzf", archive, "-C", enginesExtracted]);
    }
  }

  return cache;
}

/** Pre-siembra binarios reales de Engram 1.10.0, Workers 1.1.0 y Engines 1.18.0 en un FORGE614_HOME temporal. */
function preseedDependencies(forgeHome: string): void {
  const engramBin = join(forgeHome, "engram", "bin");
  const workersBin = join(forgeHome, "workers", "bin");
  const enginesBin = join(forgeHome, "engines", "bin");
  mkdirSync(engramBin, { recursive: true });
  mkdirSync(workersBin, { recursive: true });
  mkdirSync(enginesBin, { recursive: true });

  const engramSrc = join(testCacheDir, "engram-1.10.0", `forge614-engram-${hostTarget}`);
  if (existsSync(engramSrc)) {
    copyFileSync(engramSrc, join(engramBin, "forge614-engram"));
    chmodSync(join(engramBin, "forge614-engram"), 0o755);
  }

  const workersSrc = join(testCacheDir, "workers-1.1.0", `forge614-workers-${hostTarget}`);
  if (existsSync(workersSrc)) {
    copyFileSync(workersSrc, join(workersBin, "forge614-workers"));
    chmodSync(join(workersBin, "forge614-workers"), 0o755);
  }

  const enginesExtracted = join(testCacheDir, "engines-extracted", `forge614-engines-1.18.0-${hostTarget}`, "forge614-engines");
  if (existsSync(enginesExtracted)) {
    copyFileSync(enginesExtracted, join(enginesBin, "forge614-engines"));
    chmodSync(join(enginesBin, "forge614-engines"), 0o755);
  }
}

/** Inicia el servidor HTTP de publicación local para emular los endpoints de GitHub Releases. */
function startLocalReleaseServer() {
  let server: ReturnType<typeof Bun.serve>;
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      if (path.endsWith("/releases/latest") || path.includes("/releases/tags/")) {
        if (path.includes("engram")) return Response.json({ tag_name: "v1.10.0" });
        if (path.includes("workers")) return Response.json({ tag_name: "v1.1.0" });
        if (path.includes("engines")) return Response.json({ tag_name: "v1.18.0" });
        if (path.includes("shell")) return Response.json({ tag_name: "v1.17.0" });
        if (path.includes("v1.1.2")) {
          return Response.json({
            tag_name: "v1.1.2",
            assets: [
              {
                name: `forge614-atlas-${hostTarget}`,
                browser_download_url: `http://127.0.0.1:${server.port}/repos/jotredev/forge614-atlas/releases/download/v1.1.2/forge614-atlas-${hostTarget}`,
              },
              {
                name: "SHA256SUMS",
                browser_download_url: `http://127.0.0.1:${server.port}/repos/jotredev/forge614-atlas/releases/download/v1.1.2/SHA256SUMS`,
              },
            ],
          });
        }
        return Response.json({ tag_name: "v1.2.0" });
      }

      if (path.includes("v1.1.2")) {
        const name = path.split("/").pop()!;
        const file = join(testCacheDir, "atlas-1.1.2", name);
        if (existsSync(file)) return new Response(readFileSync(file));
      }

      if (path.includes("forge614-atlas")) {
        const name = path.split("/").pop()!;
        if (name === `forge614-atlas-${hostTarget}`) return new Response(readFileSync(atlas120Bin));
        if (name === "forge614.node.json") return new Response(nodeJsonContent);
        if (name === "install.mjs") return new Response(installMjsContent);
        if (name === "install.sh") return new Response(installShContent);
        if (name === "SHA256SUMS") return new Response(sha256sums120);
      }

      if (path.includes("forge614-engram")) {
        const name = path.split("/").pop()!;
        const file = join(testCacheDir, "engram-1.10.0", name);
        if (existsSync(file)) return new Response(readFileSync(file));
      }

      if (path.includes("forge614-workers")) {
        const name = path.split("/").pop()!;
        const file = join(testCacheDir, "workers-1.1.0", name);
        if (existsSync(file)) return new Response(readFileSync(file));
      }

      if (path.includes("forge614-engines")) {
        const name = path.split("/").pop()!;
        const file = join(testCacheDir, "engines-1.18.0", name);
        if (existsSync(file)) return new Response(readFileSync(file));
      }

      if (path.includes("forge614-shell")) {
        const name = path.split("/").pop()!;
        const file = join(testCacheDir, "shell-1.17.0", name);
        if (existsSync(file)) return new Response(readFileSync(file));
      }

      return new Response(`Ruta no encontrada: ${path}`, { status: 404 });
    },
  });

  return server;
}

/** Inicia el proxy TLS local y servidor CONNECT para interceptar el update de 1.1.2 sin salir a la red. */
async function startTlsInterceptionServer(installShText: string) {
  const tlsServer = https.createServer({ cert: TLS_CERT, key: TLS_KEY }, (req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(installShText);
  });
  await new Promise<void>((r) => tlsServer.listen(0, "127.0.0.1", () => r()));
  const tlsPort = (tlsServer.address() as net.AddressInfo).port;

  const proxy = http.createServer();
  proxy.on("connect", (req, clientSocket, head) => {
    const srv = net.connect(tlsPort, "127.0.0.1", () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      srv.write(head);
      srv.pipe(clientSocket);
      clientSocket.pipe(srv);
    });
    srv.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => srv.destroy());
  });
  await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", () => r()));
  const proxyPort = (proxy.address() as net.AddressInfo).port;

  return {
    proxyPort,
    close() {
      tlsServer.close();
      proxy.close();
    },
  };
}

beforeAll(async () => {
  testCacheDir = await setupCache();
  buildDir = mkdtempSync(join(tmpdir(), "atlas-e2e-build-"));
  atlas120Bin = join(buildDir, `forge614-atlas-${hostTarget}`);

  // Compila el binario real de Atlas 1.2.0
  const buildResult = Bun.spawnSync([
    "bun",
    "build",
    "./src/interfaces/cli/main.ts",
    "--compile",
    "--outfile",
    atlas120Bin,
  ]);
  if (buildResult.exitCode !== 0) {
    throw new Error(`Fallo compilando Atlas 1.2.0: ${buildResult.stderr.toString()}`);
  }
  chmodSync(atlas120Bin, 0o755);

  atlas120Sha = createHash("sha256").update(readFileSync(atlas120Bin)).digest("hex");
  nodeJsonContent = readFileSync("forge614.node.json", "utf8");
  installMjsContent = readFileSync("install.mjs", "utf8");
  installShContent = readFileSync("install.sh", "utf8");

  sha256sums120 = [
    `${atlas120Sha}  forge614-atlas-${hostTarget}`,
    `${createHash("sha256").update(nodeJsonContent).digest("hex")}  forge614.node.json`,
    `${createHash("sha256").update(installMjsContent).digest("hex")}  install.mjs`,
    `${createHash("sha256").update(installShContent).digest("hex")}  install.sh`,
  ].join("\n") + "\n";
}, 120_000);

afterAll(() => {
  if (buildDir && existsSync(buildDir)) rmSync(buildDir, { recursive: true, force: true });
});

describe("forge614-atlas installer and lifecycle e2e", () => {
  /** Caso 1: Instalación limpia con portero desde un FORGE614_HOME vacío. */
  test(
    "1. clean installation with gatekeeper installs Engram, Workers, Engines, and Atlas 1.2.0",
    async () => {
      const tmp = mkdtempSync(join(tmpdir(), "atlas-e2e-c1-"));
      const server = startLocalReleaseServer();
      try {
        const home = join(tmp, "home");
        const forgeHome = join(home, ".forge614");
        mkdirSync(forgeHome, { recursive: true });

        const gatekeeper = join(tmp, "install.sh");
        writeFileSync(gatekeeper, installShContent, { mode: 0o755 });

        const child = Bun.spawn(["bash", gatekeeper], {
          env: {
            PATH: process.env.PATH,
            HOME: home,
            USERPROFILE: home,
            FORGE614_HOME: forgeHome,
            FORGE614_INSTALL_TEST_BASE_URL: `http://127.0.0.1:${server.port}`,
          },
          stdout: "pipe",
          stderr: "pipe",
        });

        const [exitCode, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);

        expect(exitCode, `Instalador falló con código ${exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`).toBe(0);

        const atlasInstalled = join(forgeHome, "atlas", "bin", "forge614-atlas");
        const engramInstalled = join(forgeHome, "engram", "bin", "forge614-engram");
        const workersInstalled = join(forgeHome, "workers", "bin", "forge614-workers");
        const enginesInstalled = join(forgeHome, "engines", "bin", "forge614-engines");

        expect(existsSync(atlasInstalled)).toBe(true);
        expect(existsSync(engramInstalled)).toBe(true);
        expect(existsSync(workersInstalled)).toBe(true);
        expect(existsSync(enginesInstalled)).toBe(true);

        const versionProc = Bun.spawnSync([atlasInstalled, "--version"]);
        expect(
          versionProc.exitCode,
          `--version falló\nSTDOUT:\n${versionProc.stdout.toString()}\nSTDERR:\n${versionProc.stderr.toString()}`,
        ).toBe(0);
        expect(versionProc.stdout.toString().trim()).toBe("forge614-atlas 1.2.0");
      } finally {
        server.stop(true);
        rmSync(tmp, { recursive: true, force: true });
      }
    },
    120_000,
  );

  /** Caso 2: Migración real desde Atlas 1.1.2 a 1.2.0 en 1 único update. */
  test(
    "2. upgrade from Atlas 1.1.2 to 1.2.0 takes exactly 1 update, clean PATH block",
    async () => {
      const tmp = mkdtempSync(join(tmpdir(), "atlas-e2e-c2-"));
      const server = startLocalReleaseServer();
      const tls = await startTlsInterceptionServer(installShContent);

      try {
        const home = join(tmp, "home");
        const forgeHome = join(home, ".forge614");
        mkdirSync(forgeHome, { recursive: true });

        // Pre-siembra dependencias
        preseedDependencies(forgeHome);

        // Instala 1.1.2 usando su propio instalador
        const install112 = join(testCacheDir, "atlas-1.1.2", "install.sh");
        const child112 = Bun.spawn(["bash", install112, "--version", "v1.1.2"], {
          env: {
            PATH: process.env.PATH,
            HOME: home,
            USERPROFILE: home,
            FORGE614_HOME: forgeHome,
            FORGE614_ATLAS_INSTALLER_TEST: "1",
            FORGE614_ATLAS_TEST_RELEASE_BASE_URL: `http://127.0.0.1:${server.port}`,
          },
          stdout: "pipe",
          stderr: "pipe",
        });

        const [code112, stdout112, stderr112] = await Promise.all([
          child112.exited,
          new Response(child112.stdout).text(),
          new Response(child112.stderr).text(),
        ]);
        expect(code112, `Instalación 1.1.2 falló\nSTDOUT:\n${stdout112}\nSTDERR:\n${stderr112}`).toBe(0);

        const installedAtlas = join(forgeHome, "atlas", "bin", "forge614-atlas");
        expect(existsSync(installedAtlas)).toBe(true);

        const beforeVer = Bun.spawnSync([installedAtlas, "--version"]);
        expect(beforeVer.stdout.toString().trim()).toBe("forge614-atlas 1.1.2");

        // Ejecuta update con HTTPS_PROXY hacia el proxy TLS local
        const updateChild = Bun.spawn([installedAtlas, "update"], {
          env: {
            PATH: process.env.PATH,
            HOME: home,
            USERPROFILE: home,
            FORGE614_HOME: forgeHome,
            HTTPS_PROXY: `http://127.0.0.1:${tls.proxyPort}`,
            NODE_TLS_REJECT_UNAUTHORIZED: "0",
            FORGE614_INSTALL_TEST_BASE_URL: `http://127.0.0.1:${server.port}`,
          },
          stdout: "pipe",
          stderr: "pipe",
        });

        const [updateCode, updateStdout, updateStderr] = await Promise.all([
          updateChild.exited,
          new Response(updateChild.stdout).text(),
          new Response(updateChild.stderr).text(),
        ]);

        expect(
          updateCode,
          `Update falló con código ${updateCode}\nSTDOUT:\n${updateStdout}\nSTDERR:\n${updateStderr}`,
        ).toBe(0);

        // Comprueba versión tras update
        const afterVer = Bun.spawnSync([installedAtlas, "--version"]);
        expect(afterVer.stdout.toString().trim()).toBe("forge614-atlas 1.2.0");

        // Verifica que el bloque PATH quedó uno solo y sin residuos en el perfil de terminal detectado
        const candidateProfiles = [
          join(home, ".zshrc"),
          join(home, ".bash_profile"),
          join(home, ".bashrc"),
          join(home, ".profile"),
        ];
        const modifiedProfiles = candidateProfiles.filter(
          (p) => existsSync(p) && readFileSync(p, "utf8").includes("# >>> forge614-atlas PATH >>>"),
        );
        expect(modifiedProfiles.length, "Debe existir al menos un perfil modificado con el bloque PATH").toBeGreaterThanOrEqual(1);
        for (const profile of modifiedProfiles) {
          const content = readFileSync(profile, "utf8");
          const pathMatches = content.match(/# >>> forge614-atlas PATH >>>/g) || [];
          expect(pathMatches.length, `Perfil ${profile} debe tener exactamente 1 bloque PATH`).toBe(1);
        }
      } finally {
        tls.close();
        server.stop(true);
        rmSync(tmp, { recursive: true, force: true });
      }
    },
    120_000,
  );

  /** Caso 3: Engram 1.9.0 con memoria en engram/ es actualizado a 1.10.0 e init muda a memory/. */
  test(
    "3. Engram 1.9.0 is updated to 1.10.0 and init migrates memory to memory/",
    async () => {
      const tmp = mkdtempSync(join(tmpdir(), "atlas-e2e-c3-"));
      const server = startLocalReleaseServer();
      try {
        const home = join(tmp, "home");
        const forgeHome = join(home, ".forge614");
        const project = join(tmp, "test-project");
        mkdirSync(forgeHome, { recursive: true });
        mkdirSync(project, { recursive: true });

        // 1. Instala Engram 1.9.0 en forgeHome/engram
        const engramBin = join(forgeHome, "engram", "bin");
        mkdirSync(engramBin, { recursive: true });
        copyFileSync(
          join(testCacheDir, "engram-1.9.0", `forge614-engram-${hostTarget}`),
          join(engramBin, "forge614-engram"),
        );
        chmodSync(join(engramBin, "forge614-engram"), 0o755);

        // 2. Sembrar memoria de prueba en forgeHome/engram
        const legacyWorkspace = new MemoryWorkspace(new WorkspaceConfig(join(forgeHome, "engram")));
        legacyWorkspace.init();
        const store = legacyWorkspace.open();
        store.enableSessions();
        const session = startProjectSession(store, project, "atlas:test:legacy");
        saveProjectMemoryWithSession(
          store,
          project,
          {
            type: "fact",
            topicKey: "atlas:test:legacy",
            title: "Test Fact 1.9.0",
            content: "remembered-content-from-1.9.0",
          },
          { sessionId: session.sessionId },
        );
        store.close();

        // 3. Ejecuta el portero de Atlas 1.2.0: debe actualizar Engram a 1.10.0
        const gatekeeper = join(tmp, "install.sh");
        writeFileSync(gatekeeper, installShContent, { mode: 0o755 });

        const child = Bun.spawn(["bash", gatekeeper], {
          env: {
            PATH: process.env.PATH,
            HOME: home,
            USERPROFILE: home,
            FORGE614_HOME: forgeHome,
            FORGE614_INSTALL_TEST_BASE_URL: `http://127.0.0.1:${server.port}`,
          },
          stdout: "pipe",
          stderr: "pipe",
        });

        const [installCode, installStdout, installStderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        expect(
          installCode,
          `Instalación falló con código ${installCode}\nSTDOUT:\n${installStdout}\nSTDERR:\n${installStderr}`,
        ).toBe(0);

        // Engram debe haber quedado en 1.10.0
        const engramVer = Bun.spawnSync([join(engramBin, "forge614-engram"), "--version"]);
        expect(engramVer.stdout.toString().trim()).toBe("forge614-engram 1.10.0");

        // 4. Retira Engines para probar la migración sin Engines
        if (existsSync(join(forgeHome, "engines"))) {
          rmSync(join(forgeHome, "engines"), { recursive: true, force: true });
        }

        const installedAtlas = join(forgeHome, "atlas", "bin", "forge614-atlas");
        const initChild = Bun.spawn([installedAtlas, "init"], {
          cwd: project,
          env: {
            PATH: process.env.PATH,
            HOME: home,
            USERPROFILE: home,
            FORGE614_HOME: forgeHome,
          },
          stdout: "pipe",
          stderr: "pipe",
        });

        const [initCode, initStdout, initStderr] = await Promise.all([
          initChild.exited,
          new Response(initChild.stdout).text(),
          new Response(initChild.stderr).text(),
        ]);

        // Sin Engines, init falla predeciblemente con ENGINES_UNREACHABLE tras migrar memoria
        expect(initCode).toBe(1);
        expect(initStdout).toContain("ENGINES_UNREACHABLE");

        // Verifica que la memoria fue migrada a memory/ y retirada de engram/
        expect(existsSync(join(forgeHome, "memory", "engram.db"))).toBe(true);
        expect(existsSync(join(forgeHome, "engram", "engram.db"))).toBe(false);

        // Verifica que el recuerdo se recupera íntegro desde memory/
        const memWorkspace = new MemoryWorkspace(new WorkspaceConfig(join(forgeHome, "memory")));
        const memStore = memWorkspace.open();
        const fact = memStore.getByTopic(session.projectId, "atlas:test:legacy");
        expect(fact?.content).toBe("remembered-content-from-1.9.0");
        memStore.close();
      } finally {
        server.stop(true);
        rmSync(tmp, { recursive: true, force: true });
      }
    },
    120_000,
  );

  /** Caso 4: Desinstalación segura de Atlas: rechazo en cwd, borrado y preservación de memoria. */
  test(
    "4. Atlas uninstall rejects inside cwd, deletes folder and PATH, keeps memory intact",
    async () => {
      const tmp = mkdtempSync(join(tmpdir(), "atlas-e2e-c4-"));
      try {
        const home = join(tmp, "home");
        const forgeHome = join(home, ".forge614");
        const atlasDir = join(forgeHome, "atlas");
        const atlasBinDir = join(atlasDir, "bin");
        const memoryDir = join(forgeHome, "memory");
        mkdirSync(atlasBinDir, { recursive: true });
        mkdirSync(memoryDir, { recursive: true });
        writeFileSync(join(memoryDir, "engram.db"), "preserved memory data");

        const atlasBin = join(atlasBinDir, "forge614-atlas");
        copyFileSync(atlas120Bin, atlasBin);
        chmodSync(atlasBin, 0o755);

        const zshrc = join(home, ".zshrc");
        writeFileSync(
          zshrc,
          `echo before\n# >>> forge614-atlas PATH >>>\nexport PATH="${atlasBinDir}:$PATH"\n# <<< forge614-atlas PATH <<<\necho after\n`,
        );

        // 1. Rechazo cuando el cwd está dentro de la carpeta de Atlas
        const rejectProc = Bun.spawnSync([atlasBin, "uninstall", "--confirmed", "--json"], {
          cwd: atlasDir,
          env: {
            PATH: process.env.PATH,
            HOME: home,
            USERPROFILE: home,
            FORGE614_HOME: forgeHome,
          },
        });
        expect(
          rejectProc.exitCode,
          `El rechazo en cwd debía salir con 1\nSTDOUT:\n${rejectProc.stdout.toString()}\nSTDERR:\n${rejectProc.stderr.toString()}`,
        ).toBe(1);
        expect(existsSync(atlasDir)).toBe(true);

        // 2. Desinstalación normal desde fuera
        const okProc = Bun.spawnSync([atlasBin, "uninstall", "--confirmed", "--json"], {
          cwd: home,
          env: {
            PATH: process.env.PATH,
            HOME: home,
            USERPROFILE: home,
            FORGE614_HOME: forgeHome,
          },
        });
        expect(
          okProc.exitCode,
          `Desinstalación falló con código ${okProc.exitCode}\nSTDOUT:\n${okProc.stdout.toString()}\nSTDERR:\n${okProc.stderr.toString()}`,
        ).toBe(0);
        expect(JSON.parse(okProc.stdout.toString().trim())).toMatchObject({
          schemaVersion: 1,
          status: "uninstalled",
          result: { removed: true },
        });

        // Carpeta de Atlas retirada, PATH limpio y memoria conservada
        expect(existsSync(atlasDir)).toBe(false);
        expect(readFileSync(zshrc, "utf8").includes("forge614-atlas PATH")).toBe(false);
        expect(existsSync(join(memoryDir, "engram.db"))).toBe(true);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
    120_000,
  );

  /** Caso 5: Desinstalación coordinada de Engram 1.10.0 con Atlas 1.2.0 instalado. */
  test(
    "5. real Engram 1.10.0 uninstall uninstalls Atlas and keeps memory/ intact",
    async () => {
      const tmp = mkdtempSync(join(tmpdir(), "atlas-e2e-c5-"));
      try {
        const home = join(tmp, "home");
        const forgeHome = join(home, ".forge614");
        const atlasDir = join(forgeHome, "atlas");
        const atlasBinDir = join(atlasDir, "bin");
        const engramDir = join(forgeHome, "engram");
        const engramBinDir = join(engramDir, "bin");
        const memoryDir = join(forgeHome, "memory");
        mkdirSync(atlasBinDir, { recursive: true });
        mkdirSync(engramBinDir, { recursive: true });
        mkdirSync(memoryDir, { recursive: true });
        writeFileSync(join(memoryDir, "engram.db"), "preserved memory data");

        const atlasBin = join(atlasBinDir, "forge614-atlas");
        copyFileSync(atlas120Bin, atlasBin);
        chmodSync(atlasBin, 0o755);

        const engramBin = join(engramBinDir, "forge614-engram");
        copyFileSync(join(testCacheDir, "engram-1.10.0", `forge614-engram-${hostTarget}`), engramBin);
        chmodSync(engramBin, 0o755);

        const zshrc = join(home, ".zshrc");
        writeFileSync(
          zshrc,
          `echo before\n# >>> forge614-atlas PATH >>>\nexport PATH="${atlasBinDir}:$PATH"\n# <<< forge614-atlas PATH <<<\n# >>> forge614-engram PATH >>>\nexport PATH="${engramBinDir}:$PATH"\n# <<< forge614-engram PATH <<<\n`,
        );

        // Engram desinstala no interactivo con --json
        const engramProc = Bun.spawnSync([engramBin, "uninstall", "--json"], {
          cwd: home,
          env: {
            PATH: process.env.PATH,
            HOME: home,
            USERPROFILE: home,
            FORGE614_HOME: forgeHome,
          },
        });

        expect(
          engramProc.exitCode,
          `Engram uninstall falló\nSTDOUT:\n${engramProc.stdout.toString()}\nSTDERR:\n${engramProc.stderr.toString()}`,
        ).toBe(0);

        const payload = JSON.parse(engramProc.stdout.toString().trim());
        expect(payload).toMatchObject({
          schemaVersion: 1,
          result: {
            removed: true,
            memoryKept: true,
            atlasRemoved: true,
          },
        });

        // Ambos productos retirados, memoria preservada
        expect(existsSync(atlasDir)).toBe(false);
        expect(existsSync(engramDir)).toBe(false);
        expect(existsSync(join(memoryDir, "engram.db"))).toBe(true);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
    120_000,
  );

  /** Caso 6: install.mjs --uninstall llama a uninstall --self y retira Atlas preservando memoria. */
  test(
    "6. install.mjs --uninstall invokes uninstall --self, deletes atlas/, keeps memory/ intact",
    async () => {
      const tmp = mkdtempSync(join(tmpdir(), "atlas-e2e-c6-"));
      try {
        const home = join(tmp, "home");
        const forgeHome = join(home, ".forge614");
        const atlasDir = join(forgeHome, "atlas");
        const atlasBinDir = join(atlasDir, "bin");
        const memoryDir = join(forgeHome, "memory");
        mkdirSync(atlasBinDir, { recursive: true });
        mkdirSync(memoryDir, { recursive: true });
        writeFileSync(join(memoryDir, "engram.db"), "preserved memory data");

        const atlasBin = join(atlasBinDir, "forge614-atlas");
        copyFileSync(atlas120Bin, atlasBin);
        chmodSync(atlasBin, 0o755);

        const zshrc = join(home, ".zshrc");
        writeFileSync(
          zshrc,
          `echo before\n# >>> forge614-atlas PATH >>>\nexport PATH="${atlasBinDir}:$PATH"\n# <<< forge614-atlas PATH <<<\n`,
        );

        const installMjsPath = resolve("install.mjs");
        const mjsProc = Bun.spawnSync(["node", installMjsPath, "--uninstall"], {
          cwd: tmp,
          env: {
            PATH: process.env.PATH,
            HOME: home,
            USERPROFILE: home,
            FORGE614_HOME: forgeHome,
            FORGE614_INSTALL_NODE: "atlas",
          },
        });

        expect(
          mjsProc.exitCode,
          `install.mjs --uninstall falló\nSTDOUT:\n${mjsProc.stdout.toString()}\nSTDERR:\n${mjsProc.stderr.toString()}`,
        ).toBe(0);

        expect(existsSync(atlasDir)).toBe(false);
        expect(readFileSync(zshrc, "utf8").includes("forge614-atlas PATH")).toBe(false);
        expect(existsSync(join(memoryDir, "engram.db"))).toBe(true);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
