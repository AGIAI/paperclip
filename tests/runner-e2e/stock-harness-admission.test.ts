import { beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { prepareStockHarnessPreflight, stockPreflightEnvironment, verifyStockHarnessPreflight } from "./stock-harness-admission.js";
import { CREDENTIAL_NAMES } from "./types.js";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
const spawn = vi.mocked(spawnSync);
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
    expect(() => prepareStockHarnessPreflight()).toThrow("before provider execution");
    expect(spawn).toHaveBeenCalledTimes(1);
  });
  it("verifies retained evidence after a passing prerequisite subprocess", () => {
    spawn.mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>);
    spawn.mockReturnValueOnce({ status: 0, stdout: '{"passed":true}' } as ReturnType<typeof spawnSync>);
    const receipt = prepareStockHarnessPreflight();
    expect(receipt).toMatch(/stock-harness-preflight-.*\/preflight.json$/);
    expect(spawn.mock.calls[1]?.[1]).toContain(`--verify=${receipt}`);
  });
  it("allows Cargo dependency resolution only on the disposable GitHub runner", () => {
    vi.stubEnv("GITHUB_ACTIONS", "true");
    spawn.mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>);
    spawn.mockReturnValueOnce({ status: 0, stdout: '{}' } as ReturnType<typeof spawnSync>);
    prepareStockHarnessPreflight();
    expect(spawn.mock.calls[0]?.[1]).toContain("--allow-rust-network");
  });
  it("refuses failed receipt verification", () => {
    spawn.mockReturnValue({ status: 1, stderr: "stale source" } as ReturnType<typeof spawnSync>);
    expect(() => verifyStockHarnessPreflight("/fixture/preflight.json")).toThrow("stale source");
  });
});
