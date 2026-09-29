import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  QUALIFIED_ACPX_PROFILES,
  resolveQualifiedAcpxProfile,
} from "./qualified-profiles.js";

describe("qualified ACPX profiles", () => {
  it.each(Object.values(QUALIFIED_ACPX_PROFILES))(
    "keeps the Rust admission digest synchronized with the current $agent profile",
    (profile) => {
      const rust = readFileSync(new URL("../../../runner/crates/runner-core/src/acpx_provider_backend.rs", import.meta.url), "utf8");
      const start = rust.indexOf(`"${profile.agent}" => (`);
      expect(start).toBeGreaterThan(0);
      const end = rust.indexOf("\n            ),", start);
      expect(end).toBeGreaterThan(start);
      const admission = rust.slice(start, end);
      expect(admission).toContain(JSON.stringify(profile.agentServerPackage));
      expect(admission).toContain(JSON.stringify(profile.agentServerVersion));
      expect(admission).toContain(JSON.stringify(profile.commandDigest));
    },
  );

  it("binds each agent to one immutable package and model declaration", () => {
    for (const agent of ["pi", "claude", "codex", "grok"] as const) {
      const profile = QUALIFIED_ACPX_PROFILES[agent];
      expect(profile.agent).toBe(agent);
      expect(profile.commandDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(Object.isFrozen(profile)).toBe(true);
      expect(
        resolveQualifiedAcpxProfile(agent, profile.qualificationModel),
      ).toEqual(profile);
    }
  });

  it.each(["claude-opus-5-5", "claude-fable-5-1", "custom-model-not-in-catalog"])("accepts the exact Claude model %s", (model) => {
    expect(resolveQualifiedAcpxProfile("claude", model)).toMatchObject({
      qualificationModel: model, reportedModelId: model,
      commandDigest: QUALIFIED_ACPX_PROFILES.claude.commandDigest,
    });
  });

  it("rejects unqualified model substitutions", () => {
    expect(() =>
      resolveQualifiedAcpxProfile("codex", "some-other-model"),
    ).toThrow("requires exact model");
  });

  it("binds Codex ACP to the CLI runtime it launches", () => {
    expect(QUALIFIED_ACPX_PROFILES.codex).toMatchObject({
      agentRuntimePackage: "@openai/codex",
      agentRuntimeVersion: "0.156.0",
    });
  });

  it("binds Claude ACP to the SDK and native CLI runtime it launches", () => {
    expect(QUALIFIED_ACPX_PROFILES.claude).toMatchObject({
      agentRuntimePackage: "@anthropic-ai/claude-agent-sdk",
      agentRuntimeVersion: "0.3.280",
    });
  });
});
