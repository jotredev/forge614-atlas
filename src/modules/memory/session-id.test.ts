import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveSessionId, deriveForcedSessionId } from "./session-id";

describe("deriveSessionId", () => {
  test("is deterministic for the same directory", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-sessionid-"));
    expect(deriveSessionId(root)).toBe(deriveSessionId(root));
    rmSync(root, { recursive: true, force: true });
  });

  test("differs between two different directories", () => {
    const rootA = mkdtempSync(join(tmpdir(), "atlas-sessionid-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "atlas-sessionid-b-"));
    expect(deriveSessionId(rootA)).not.toBe(deriveSessionId(rootB));
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  });

  test("starts with the atlas: prefix and is a valid Engram sessionId", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-sessionid-prefix-"));
    const id = deriveSessionId(root);
    expect(id.startsWith("atlas:")).toBe(true);
    expect(id.length).toBeLessThanOrEqual(200);
    expect(id.trim()).toBe(id);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("deriveForcedSessionId", () => {
  test("differs from the deterministic id but keeps it as a prefix", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-sessionid-forced-"));
    const base = deriveSessionId(root);
    const forced = deriveForcedSessionId(root);
    expect(forced).not.toBe(base);
    expect(forced.startsWith(base)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
});
