import { afterAll, afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const installer = resolve(import.meta.dir, "../install.sh");
const temporaryDirectories: string[] = [];
const fixtureBytes = "#!/usr/bin/env sh\nprintf 'fixture release binary\\n'\n";
const testReleaseBaseUrl = "FORGE614_ATLAS_TEST_RELEASE_BASE_URL";
const testMode = "FORGE614_ATLAS_INSTALLER_TEST";
const engramInstallerTestUrl = "FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL";

// Task 2's tests predate the Engram dependency Task 3 chains in front of every install. None of
// them opt into `FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL` themselves, so without a default they
// would otherwise fall through to installer.sh's real, network-hitting fallback URL and become
// flaky/non-hermetic. Provide one shared local stub installer and point every fixture run at it,
// unless a test (the Engram-specific ones below) has already set its own override.
const defaultEngramInstaller = join(mkdtempSync(join(tmpdir(), "forge614-atlas-default-engram-")), "install.sh");
writeFileSync(
  defaultEngramInstaller,
  [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "mkdir -p \"$HOME/.forge614/engram/bin\"",
    "printf '#!/usr/bin/env sh\\nexit 0\\n' > \"$HOME/.forge614/engram/bin/forge614-engram\"",
    "chmod 700 \"$HOME/.forge614/engram/bin/forge614-engram\"",
  ].join("\n"),
);

afterAll(() => {
  rmSync(dirname(defaultEngramInstaller), { recursive: true, force: true });
});

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
    engramInstallerTestUrl: process.env[engramInstallerTestUrl],
  };
  const setDefaultEngramInstaller = process.env[engramInstallerTestUrl] === undefined;
  process.env.HOME = home;
  if (shell === undefined) delete process.env.SHELL;
  else process.env.SHELL = shell;
  process.env[testReleaseBaseUrl] = releaseBaseUrl;
  if (includeTestSentinel) process.env[testMode] = "1";
  else delete process.env[testMode];
  if (setDefaultEngramInstaller) process.env[engramInstallerTestUrl] = `file://${defaultEngramInstaller}`;
  try {
    return await operation();
  } finally {
    for (const [name, value] of Object.entries({
      HOME: saved.home,
      SHELL: saved.shell,
      [testReleaseBaseUrl]: saved.releaseBaseUrl,
      [testMode]: saved.testMode,
      [engramInstallerTestUrl]: saved.engramInstallerTestUrl,
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

test("rejects a non-file Engram installer override", async () => {
  const root = temporaryDirectory();
  const fixture = join(root, "fixture-binary");
  const destination = join(root, "untrusted-bin");
  const fakeHome = join(root, "empty-home");
  mkdirSync(fakeHome);
  writeFileSync(fixture, fixtureBytes);
  const server = fixtureReleaseServer(targetArtifact(), fixture);
  const previous = process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL;
  process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL = "https://example.invalid/install.sh";
  try {
    const result = await withFixtureEnvironment(fakeHome, `${server.url}good`, () => runInstaller(["--bin-dir", destination]));
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("must be a local file URL");
    expect(existsSync(destination)).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL;
    else process.env.FORGE614_ATLAS_ENGRAM_INSTALLER_TEST_URL = previous;
    server.stop(true);
  }
});
