import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { stockHarnessSourceDigest } from "./stock-harness.js";

vi.mock("node:fs", async importOriginal => ({ ...await importOriginal<typeof import("node:fs")>(), readFileSync: vi.fn() }));

describe("stock harness instruction revision", () => {
  it.each([
    "server/src/onboarding-assets/default/AGENTS.md", "packages/adapter-utils/src/server-utils.ts",
    "packages/shared/src/connection-intent-guidance.ts", "packages/paperclip-runner/src/contracts/completion-result.ts",
    "packages/paperclip-runner/src/drivers/codex/codex-driver-values.ts",
    "packages/paperclip-runner/src/drivers/runner-tool-bridge.ts",
    "packages/paperclip-runner/src/drivers/opencode/mcp-bridge.ts",
    "server/src/services/native-runtime/native-session-resume.ts",
    "tests/runner-e2e/native-completion-case.ts",
  ])(
    "changes when the evaluated %s changes", source => {
      vi.mocked(readFileSync).mockImplementation(() => Buffer.from("unchanged"));
      const original = stockHarnessSourceDigest();
      vi.mocked(readFileSync).mockImplementation(file => Buffer.from(String(file).endsWith(source) ? "changed instructions" : "unchanged"));
      expect(stockHarnessSourceDigest()).not.toBe(original);
    });
});
