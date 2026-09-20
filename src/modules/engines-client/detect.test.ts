import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { detectAgents } from "./detect";
import { resolveEnginesBinaryPath } from "./binary-path";

// Estos tests requieren forge614-engines instalado en la ruta fija del
// ecosistema (confirmado presente en esta máquina de desarrollo).
const binaryPath = resolveEnginesBinaryPath(process.platform, homedir());

describe("detectAgents", () => {
  test("reports installed agents from the real forge614-engines binary", () => {
    const agents = detectAgents(binaryPath);

    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      expect(typeof agent.id).toBe("string");
      expect(typeof agent.installed).toBe("boolean");
      expect(typeof agent.configDir).toBe("string");
      expect(typeof agent.configFound).toBe("boolean");
    }
  });

  test("throws a clear error when the binary path does not exist", () => {
    expect(() => detectAgents("/nonexistent/forge614-engines")).toThrow();
  });
});
