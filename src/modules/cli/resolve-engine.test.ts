import { describe, expect, test } from "bun:test";
import { resolveEngine } from "./resolve-engine";
import type { AgentDetection } from "../engines-client/detect";
import type { Capabilities } from "../engines-client/capabilities";

function agent(id: string, installed: boolean, executable?: string): AgentDetection {
  return { id, label: id, installed, executable, configDir: `/home/.${id}`, configFound: installed };
}

function capabilities(id: string, supportsHeadlessExec: boolean): Capabilities {
  const supportsReasoningLevel = id === "codex";
  return { id, label: id, supportsMcp: true, supportsHooks: true, supportsHeadlessExec, supportsReasoningLevel };
}

describe("resolveEngine", () => {
  test("auto-resolves when exactly one installed agent supports headless exec", () => {
    const agents = [agent("claude-code", true, "/bin/claude"), agent("cursor", true, "/bin/cursor")];
    const capsById = new Map([
      ["claude-code", capabilities("claude-code", true)],
      ["cursor", capabilities("cursor", false)],
    ]);

    const result = resolveEngine(agents, capsById);

    expect(result).toEqual({ status: "resolved", id: "claude-code", executable: "/bin/claude" });
  });

  test("reports engine-unavailable when no installed agent supports headless exec", () => {
    const agents = [agent("cursor", true, "/bin/cursor")];
    const capsById = new Map([["cursor", capabilities("cursor", false)]]);

    expect(resolveEngine(agents, capsById)).toEqual({ status: "engine-unavailable" });
  });

  test("reports engine-ambiguous when two or more candidates support headless exec", () => {
    const agents = [agent("claude-code", true, "/bin/claude"), agent("codex", true, "/bin/codex")];
    const capsById = new Map([
      ["claude-code", capabilities("claude-code", true)],
      ["codex", capabilities("codex", true)],
    ]);

    const result = resolveEngine(agents, capsById);

    expect(result.status).toBe("engine-ambiguous");
    if (result.status === "engine-ambiguous") {
      expect(result.candidates).toEqual([
        { id: "claude-code", executable: "/bin/claude" },
        { id: "codex", executable: "/bin/codex" },
      ]);
    }
  });

  test("resolves to the explicitly requested engine when it is a valid candidate", () => {
    const agents = [agent("claude-code", true, "/bin/claude"), agent("codex", true, "/bin/codex")];
    const capsById = new Map([
      ["claude-code", capabilities("claude-code", true)],
      ["codex", capabilities("codex", true)],
    ]);

    const result = resolveEngine(agents, capsById, "codex");

    expect(result).toEqual({ status: "resolved", id: "codex", executable: "/bin/codex" });
  });

  test("reports engine-invalid when the requested engine is not a real candidate, even with only one real candidate", () => {
    const agents = [agent("claude-code", true, "/bin/claude")];
    const capsById = new Map([["claude-code", capabilities("claude-code", true)]]);

    const result = resolveEngine(agents, capsById, "not-a-real-engine");

    expect(result.status).toBe("engine-invalid");
    if (result.status === "engine-invalid") {
      expect(result.requestedId).toBe("not-a-real-engine");
      expect(result.candidates).toEqual([{ id: "claude-code", executable: "/bin/claude" }]);
    }
  });

  test("never proposes an agent that is not installed or lacks an executable path", () => {
    const agents = [agent("claude-code", false)];
    const capsById = new Map([["claude-code", capabilities("claude-code", true)]]);

    expect(resolveEngine(agents, capsById)).toEqual({ status: "engine-unavailable" });
  });

  test("excludes an installed agent with no executable, even when capabilities report headless support", () => {
    const agents = [agent("claude-code", true)];
    const capsById = new Map([["claude-code", capabilities("claude-code", true)]]);

    expect(resolveEngine(agents, capsById)).toEqual({ status: "engine-unavailable" });
  });

  test("excludes an installed agent with an executable whose id is missing from capabilitiesById", () => {
    const agents = [agent("claude-code", true, "/bin/claude")];
    const capsById = new Map<string, ReturnType<typeof capabilities>>();

    expect(resolveEngine(agents, capsById)).toEqual({ status: "engine-unavailable" });
  });
});
