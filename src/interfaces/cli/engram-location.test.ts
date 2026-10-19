/**
 * Protege que el `init` de Atlas use Engram 1.10.0 con una HOME temporal y sin Engines: solo inicializa/abre memoria y
 * termina antes de despachar Workers o ayudantes reales.
 */
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defaultDatabasePath, MemoryWorkspace, WorkspaceConfig, saveProjectMemoryWithSession, startProjectSession } from "forge614-engram";

const entrypoint = resolve(import.meta.dir, "main.ts");
const temporaryRoots: string[] = [];
const buildRoot = mkdtempSync(join(tmpdir(), "atlas-engram-location-build-"));
const atlasBinary = join(buildRoot, "forge614-atlas-test");

interface SeededMemory {
  projectId: string;
  topicKey: string;
  content: string;
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "atlas-engram-location-"));
  temporaryRoots.push(root);
  const home = join(root, "home");
  const forgeHome = join(root, "forge614");
  const project = join(root, "project");
  mkdirSync(home);
  mkdirSync(forgeHome);
  mkdirSync(project);
  return { home, forgeHome, project };
}

function seedMemory(workspaceRoot: string, project: string, topicKey: string, content: string): SeededMemory {
  const workspace = new MemoryWorkspace(new WorkspaceConfig(workspaceRoot));
  workspace.init();
  const store = workspace.open();
  store.enableSessions();
  try {
    const session = startProjectSession(store, project, `atlas:location:${topicKey}`);
    saveProjectMemoryWithSession(store, project, {
      type: "fact",
      topicKey,
      title: `Atlas test: ${topicKey}`,
      content,
    }, { sessionId: session.sessionId });
    return { projectId: session.projectId, topicKey, content };
  } finally {
    store.close();
  }
}

function runInit(home: string, forgeHome: string, project: string) {
  const result = spawnSync(atlasBinary, ["init"], {
    cwd: project,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, HOME: home, FORGE614_HOME: forgeHome },
  });
  expect(result.error?.message).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("ENGINES_UNREACHABLE");
  return result;
}

function readMemory(workspaceRoot: string, memory: SeededMemory) {
  const store = new MemoryWorkspace(new WorkspaceConfig(workspaceRoot)).open();
  try {
    return store.getByTopic(memory.projectId, memory.topicKey);
  } finally {
    store.close();
  }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

beforeAll(() => {
  const repoRoot = resolve(import.meta.dir, "../../..");
  const build = spawnSync("bun", ["build", entrypoint, "--compile", "--outfile", atlasBinary], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 120_000,
  });
  expect(build.error?.message).toBeUndefined();
  expect(build.status, build.stderr).toBe(0);
});

afterAll(() => rmSync(buildRoot, { recursive: true, force: true }));

test("init keeps a remembered fact in memory/ without creating an Engram database", () => {
  const { home, forgeHome, project } = fixture();
  const memory = seedMemory(join(forgeHome, "memory"), project, "atlas:test:memory-only", "fact in memory");

  runInit(home, forgeHome, project);

  expect(existsSync(join(forgeHome, "engram", "engram.db"))).toBe(false);
  expect(existsSync(join(forgeHome, "engram", ".env"))).toBe(false);
  expect(readMemory(join(forgeHome, "memory"), memory)?.content).toBe(memory.content);
});

test("init migrates a legacy remembered fact and its .env from engram/ to memory/", () => {
  const { home, forgeHome, project } = fixture();
  const legacyRoot = join(forgeHome, "engram");
  const memory = seedMemory(legacyRoot, project, "atlas:test:legacy-only", "fact in legacy memory");
  const legacyEnv = readFileSync(join(legacyRoot, ".env"));

  runInit(home, forgeHome, project);

  expect(existsSync(join(forgeHome, "memory", "engram.db"))).toBe(true);
  expect(readFileSync(join(forgeHome, "memory", ".env"))).toEqual(legacyEnv);
  expect(existsSync(join(legacyRoot, "engram.db"))).toBe(false);
  expect(readMemory(join(forgeHome, "memory"), memory)?.content).toBe(memory.content);
});

test("init selects memory/ and leaves an existing legacy database untouched when both exist", () => {
  const { home, forgeHome, project } = fixture();
  const currentRoot = join(forgeHome, "memory");
  const legacyRoot = join(forgeHome, "engram");
  const currentMemory = seedMemory(currentRoot, project, "atlas:test:current", "current fact");
  const legacyProject = join(project, "legacy-project");
  mkdirSync(legacyProject);
  const legacyMemory = seedMemory(legacyRoot, legacyProject, "atlas:test:legacy", "legacy fact");
  const legacyDb = join(legacyRoot, "engram.db");
  const legacyBytes = readFileSync(legacyDb);

  runInit(home, forgeHome, project);

  const previousForgeHome = process.env.FORGE614_HOME;
  process.env.FORGE614_HOME = forgeHome;
  try {
    expect(defaultDatabasePath()).toBe(join(currentRoot, "engram.db"));
  } finally {
    if (previousForgeHome === undefined) delete process.env.FORGE614_HOME;
    else process.env.FORGE614_HOME = previousForgeHome;
  }
  expect(readMemory(currentRoot, currentMemory)?.content).toBe(currentMemory.content);
  expect(readFileSync(legacyDb)).toEqual(legacyBytes);
  expect(readMemory(legacyRoot, legacyMemory)?.content).toBe(legacyMemory.content);
});
