import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ACPX_QUALIFICATION_ENV, resolveAcpxQualification } from "./acpx-qualification.js";
import type { NativeExecutionInput } from "../../vendor/paperclip-runner/index.js";

const provider = { kind: "acpx", agent: "cursor", model: "exact-model", permissionMode: "approve-all" } as NativeExecutionInput["provider"];
const authorize = (value: unknown) => ({ [ACPX_QUALIFICATION_ENV]: JSON.stringify(value) });
describe("host ACPX qualification admission", () => {
  it("keeps normal candidate execution closed and admits only the exact operator pair", () => {
    expect(resolveAcpxQualification(provider, {})).toBeUndefined();
    expect(resolveAcpxQualification(provider, authorize([{ agent: "cursor", model: "exact-model" }]))).toBe("cursor");
    for (const entries of [[{ agent: "copilot", model: "exact-model" }], [{ agent: "cursor", model: "other-model" }]]) {
      expect(() => resolveAcpxQualification(provider, authorize(entries))).toThrow("exact model");
    }
  });
  it.each([[], {}, [{ agent: "cursor", model: "" }], [{ agent: "cursor", model: " exact-model" }],
    [{ agent: "cursor", model: "exact-model", allowAll: true }], [{ agent: "claude", model: "exact-model" }],
    [{ agent: "cursor", model: "exact-model" }, { agent: "cursor", model: "exact-model" }],
  ])("rejects malformed or broad authorization %j", entries => {
    expect(() => resolveAcpxQualification(provider, authorize(entries))).toThrow("Invalid ACPX");
  });
  it("does not alter existing qualified providers", () => {
    expect(resolveAcpxQualification({ ...provider, agent: "codex" } as typeof provider, authorize([]))).toBeUndefined();
  });
  it("binds the executor to host process environment rather than agent configuration", () => {
    const source = readFileSync(new URL("./native-session-executor.ts", import.meta.url), "utf8");
    expect(source).toContain("resolveAcpxQualification(input.execution.provider, process.env)");
    expect(source).not.toContain("resolveAcpxQualification(input.execution.provider, effectiveRunnerEnvironment)");
  });
});
