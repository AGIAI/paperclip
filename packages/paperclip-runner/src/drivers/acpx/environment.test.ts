import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

import { createSanitizedAcpxSpawnInput } from "./environment.js";

describe("ACPX launch environment", () => {
  it("projects only the selected agent's credentials and runtime allowlist", () => {
    const source = {
      PATH: "/bin",
      LC_ALL: "C.UTF-8",
      HTTPS_PROXY: "https://proxy.example",
      OPENAI_API_KEY: "openai-secret",
      ANTHROPIC_API_KEY: "anthropic-secret",
      OPENROUTER_API_KEY: "openrouter-secret",
      PAPERCLIP_ACPX_CODEX_AUTH_JSON_SECRET:
        '{"tokens":{"access_token":"managed-secret"}}',
      PAPERCLIP_RUNNER_BOOTSTRAP_TICKET: "transport-secret",
      PAPERCLIP_NATIVE_MCP_TOKEN: "bridge-secret",
      UNRELATED_SECRET: "not-visible",
    };

    const codex = createSanitizedAcpxSpawnInput(source, "codex");
    expect(codex.env).toEqual({
      PATH: "/bin",
      LC_ALL: "C.UTF-8",
      HTTPS_PROXY: "https://proxy.example",
      OPENAI_API_KEY: "openai-secret",
    });
    expect(createSanitizedAcpxSpawnInput(source, "claude").env).toEqual({
      PATH: "/bin",
      LC_ALL: "C.UTF-8",
      HTTPS_PROXY: "https://proxy.example",
      ANTHROPIC_API_KEY: "anthropic-secret",
    });
    expect(createSanitizedAcpxSpawnInput(source, "pi").env).toEqual({
      PATH: "/bin",
      LC_ALL: "C.UTF-8",
      HTTPS_PROXY: "https://proxy.example",
      OPENROUTER_API_KEY: "openrouter-secret",
    });
    expect(codex.env).not.toHaveProperty("PAPERCLIP_NATIVE_MCP_TOKEN");
    expect(codex.env).not.toHaveProperty(
      "PAPERCLIP_ACPX_CODEX_AUTH_JSON_SECRET",
    );
    expect(Object.isFrozen(codex)).toBe(true);
    expect(Object.isFrozen(codex.env)).toBe(true);
  });

  it.each([
    ["pi", "OPENROUTER_API_KEY"], ["cursor", "CURSOR_API_KEY"],
    ["cursor", "CURSOR_AUTH_TOKEN"], ["copilot", "COPILOT_GITHUB_TOKEN"],
  ] as const)("requires an explicit %s credential binding for %s", (agent, name) => {
    vi.stubEnv(name, "ambient-secret");
    expect(createSanitizedAcpxSpawnInput(undefined, agent).env[name]).toBeUndefined();
    expect(createSanitizedAcpxSpawnInput({ [name]: "bound-secret" }, agent).env[name]).toBe("bound-secret");
  });

  it("drops alternate credentials, provider injection and configuration overrides", () => {
    const source = {
      CURSOR_API_KEY: "cursor-key", CURSOR_AUTH_TOKEN: "cursor-token", COPILOT_GITHUB_TOKEN: "copilot-key",
      GH_TOKEN: "gh-key", GITHUB_TOKEN: "github-key", COPILOT_PROVIDER_BASE_URL: "https://unapproved.invalid",
      COPILOT_MODEL: "ambient-model", CURSOR_CONFIG_DIR: "/ambient/cursor", PI_CODING_AGENT_DIR: "/ambient/pi",
      PAPERCLIP_PI_ENTRYPOINT: "/unverified/pi.js", NODE_OPTIONS: "--import=/unverified/hook.js",
      COPILOT_PKG_CACHE_HOME: "/unverified/cache", COPILOT_ALLOW_ALL: "true",
    };
    expect(createSanitizedAcpxSpawnInput(source, "cursor").env).toEqual({ CURSOR_API_KEY: "cursor-key", CURSOR_AUTH_TOKEN: "cursor-token" });
    expect(createSanitizedAcpxSpawnInput(source, "copilot").env).toEqual({ COPILOT_GITHUB_TOKEN: "copilot-key" });
    expect(createSanitizedAcpxSpawnInput(source, "pi").env).toEqual({});
  });

  it("rejects unsafe or unbounded retained values", () => {
    expect(() =>
      createSanitizedAcpxSpawnInput({ PATH: "bad\0path" }, "codex"),
    ).toThrow("null byte");
    expect(() =>
      createSanitizedAcpxSpawnInput(
        {
          OPENAI_API_KEY: "x".repeat(64 * 1024),
        },
        "codex",
      ),
    ).toThrow("bounded launch size");
  });
});
