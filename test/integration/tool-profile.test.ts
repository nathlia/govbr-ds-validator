/**
 * 2.17.1 (NAT-106): perfil de ferramentas desconhecido falha rápido (createServer lança; o processo
 * stdio sai com código ≠ 0 e uma linha no stderr, nada no stdout) e o perfil efetivo fica visível no
 * serverInfo do initialize — sem mudar o tools/list de nenhum perfil.
 */
import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, resolveToolProfile, TOOL_PROFILES, UnknownToolProfileError, type ToolProfile } from "../../src/server.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const reportsDir = () => mkdtempSync(join(tmpdir(), "govbr-profile-"));

describe("tool profile resolution", () => {
  const envBefore = process.env.GOVBR_VALIDATOR_TOOL_PROFILE;
  afterEach(() => {
    if (envBefore === undefined) delete process.env.GOVBR_VALIDATOR_TOOL_PROFILE;
    else process.env.GOVBR_VALIDATOR_TOOL_PROFILE = envBefore;
  });

  it("empty or unset keeps the full default", () => {
    expect(resolveToolProfile(undefined)).toBe("full");
    expect(resolveToolProfile("")).toBe("full");
  });

  it.each(["knowledge_free", "Full", "evaluaton", " evaluation"])("rejects unknown profile %j with a typed error", (bad) => {
    expect(() => resolveToolProfile(bad)).toThrow(UnknownToolProfileError);
    try {
      resolveToolProfile(bad);
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownToolProfileError);
      const e = err as UnknownToolProfileError;
      expect(e.code).toBe("unknown-tool-profile");
      expect(e.profile).toBe(bad);
      expect(e.message).toContain(`"${bad}"`);
      expect(e.message).toContain(TOOL_PROFILES.join(", "));
    }
  });

  it("createServer throws on an unknown profile from options or env", () => {
    expect(() => createServer({ reportsDir: reportsDir(), toolProfile: "knowledge_free" as ToolProfile })).toThrow(UnknownToolProfileError);
    process.env.GOVBR_VALIDATOR_TOOL_PROFILE = "knowledge_free";
    expect(() => createServer({ reportsDir: reportsDir() })).toThrow(/unknown tool profile "knowledge_free".*knowledge-free/);
  });

  it.each(TOOL_PROFILES)("profile %s starts and reports itself in serverInfo", async (profile) => {
    const server = createServer({ reportsDir: reportsDir(), toolProfile: profile, knowledgeLock: "call" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: `profile-${profile}`, version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const info = client.getServerVersion() as { name: string; description?: string };
      expect(info.name).toBe("govbr-ds-validator");
      expect(info.description).toBe(`toolProfile=${profile}`);
      expect((await client.listTools()).tools.length).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });

  it("stdio entry exits non-zero with one stderr line and empty stdout", () => {
    const res = spawnSync(process.execPath, [join(ROOT, "node_modules/tsx/dist/cli.mjs"), join(ROOT, "src/index.ts")], {
      cwd: ROOT,
      env: { ...process.env, GOVBR_VALIDATOR_TOOL_PROFILE: "knowledge_free", GOVBR_VALIDATOR_REPORTS_DIR: reportsDir() },
      input: "",
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(res.status).not.toBe(0);
    expect(res.status).not.toBeNull();
    expect(res.stdout).toBe("");
    const lines = res.stderr.trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('unknown tool profile "knowledge_free"');
    expect(lines[0]).toContain("valid: full, evaluation, normative, deterministic, evidence, knowledge-free");
  }, 60_000);
});
