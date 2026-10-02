import { beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { prepareStockHarnessPreflight, stockPreflightEnvironment, verifyStockHarnessPreflight, requiresStockHarnessPrerequisites, effectiveAutomaticRetries } from "./stock-harness-admission.js";
import { CREDENTIAL_NAMES } from "./types.js";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
const spawn = vi.mocked(spawnSync);
const campaignDirectory = "/fixture/results/gha-1-1-stock-harness.fixture";
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

describe("stock harness credential-free admission", () => {
  it("allows toolchain paths and excludes every present or future credential", () => {
    const source = { PATH: "/bin", HOME: "/home/fixture", CARGO_HOME: "/cargo", CI: "true",
      GH_TOKEN: "secret", FUTURE_PROVIDER_API_KEY: "secret", ...Object.fromEntries(CREDENTIAL_NAMES.map(name => [name, "secret"])) };
    expect(stockPreflightEnvironment(source)).toEqual({ PATH: "/bin", HOME: "/home/fixture", CARGO_HOME: "/cargo", CI: "true" });
  });
  it("rejects missing receipts without invoking a process", () => {
    expect(() => verifyStockHarnessPreflight(undefined)).toThrow("no prerequisite receipt");
    expect(spawn).not.toHaveBeenCalled();
  });
  it("fails before provider execution when the prerequisite subprocess fails", () => {
    spawn.mockReturnValue({ status: 1 } as ReturnType<typeof spawnSync>);
    expect(() => prepareStockHarnessPreflight(campaignDirectory)).toThrow("before provider execution");
    expect(spawn).toHaveBeenCalledTimes(1);
  });
  it("verifies retained evidence after a passing prerequisite subprocess", () => {
    spawn.mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>);
    spawn.mockReturnValueOnce({ status: 0, stdout: '{"passed":true}' } as ReturnType<typeof spawnSync>);
    const receipt = prepareStockHarnessPreflight(campaignDirectory);
    expect(receipt).toMatch(/^\/fixture\/results\/gha-1-1-stock-harness\.fixture\/stock-harness-prerequisites\/[^/]+\/preflight.json$/);
    expect(spawn.mock.calls[1]?.[1]).toContain(`--verify=${receipt}`);
  });
  it("allows Cargo dependency resolution only on the disposable GitHub runner", () => {
    vi.stubEnv("GITHUB_ACTIONS", "true");
    spawn.mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>);
    spawn.mockReturnValueOnce({ status: 0, stdout: '{}' } as ReturnType<typeof spawnSync>);
    prepareStockHarnessPreflight(campaignDirectory);
    expect(spawn.mock.calls[0]?.[1]).toContain("--allow-rust-network");
  });
  it("refuses failed receipt verification", () => {
    spawn.mockReturnValue({ status: 1, stderr: "stale source" } as ReturnType<typeof spawnSync>);
    expect(() => verifyStockHarnessPreflight("/fixture/preflight.json")).toThrow("stale source");
  });
});

describe("frozen hiring comparison admission", () => {
  it("admits stock and hiring suites without expanding other campaigns", () => {
    expect(requiresStockHarnessPrerequisites("stock-harness")).toBe(true);
    expect(requiresStockHarnessPrerequisites("hiring-templates")).toBe(true);
    expect(requiresStockHarnessPrerequisites("chat")).toBe(false);
  });
  it("never retries a hiring model attempt, including infrastructure failures", () => {
    for (const configured of [0, 1]) expect(effectiveAutomaticRetries("hiring-templates", configured)).toBe(0);
    expect(effectiveAutomaticRetries("stock-harness", 1)).toBe(1);
  });
});
