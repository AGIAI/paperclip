import { afterEach, expect, it, vi } from "vitest";
import { createRemoteNativeBootstrap } from "./remote-native-bootstrap.js";
import type { RemoteFixtureApi, RemoteNativeFixture } from "./remote-native-fixtures.js";

afterEach(() => vi.useRealTimers());

function harness(timeoutMs = 5000) {
  const order: string[] = [];
  const issue = { id: "issue", companyId: "company", assigneeAgentId: "agent" };
  const run = { id: "run", companyId: "company", agentId: "agent", status: "running", executionStage: "preparing" };
  const leases = [{ id: "lease", heartbeatRunId: "run", issueId: "issue", status: "active", providerLeaseId: "sandbox" }];
  const api = { get: vi.fn(async (path: string) => path === "/api/issues/issue" ? issue : path === "/api/heartbeat-runs/run" ? run : leases) };
  const fixture = {
    binding: { companyId: "company", environmentId: "env", runId: "run", leaseId: "lease", sandboxId: "sandbox", remoteCwd: "/workspace" },
    baseline: { complete: true },
    publishAction: vi.fn(async () => { order.push("publish"); }),
    close: vi.fn(async () => { order.push("close"); }),
  } as unknown as RemoteNativeFixture;
  const bind = vi.fn(async () => { order.push("armed"); return fixture; });
  const input = {
    api: api as unknown as RemoteFixtureApi, daytona: { get: vi.fn() }, companyId: "company", environmentId: "env", agentId: "agent",
    image: `image@sha256:${"a".repeat(64)}`, nodeSha256: `sha256:${"b".repeat(64)}`, runnerdSha256: `sha256:${"c".repeat(64)}`,
    deadlineAt: Date.now() + timeoutMs, evidence: vi.fn(async (_name: string, _data: unknown) => { order.push("evidence"); }),
  };
  const bootstrap = createRemoteNativeBootstrap(input, bind);
  const request = { issueId: "issue", runId: "run", targets: ["target.txt"], actionPrompt: async (actual: RemoteNativeFixture) => {
    expect(actual).toBe(fixture); await Promise.resolve(); order.push("baseline"); return "PRIVATE ACTUAL ACTION";
  } };
  return { bootstrap, input, bind, api, issue, run, leases, fixture, request, order };
}

it("withholds actual work until exact run admission, armed observer and awaited baseline", async () => {
  const h = harness(); const prompt = h.bootstrap.prompt("nonce");
  expect(prompt).not.toContain("PRIVATE ACTUAL ACTION");
  expect(prompt).toContain("native file-read tool");
  expect(h.bind).not.toHaveBeenCalled();
  expect(await h.bootstrap.bindAndRelease(h.request)).toBe(h.fixture);
  expect(h.order).toEqual(["armed", "baseline", "evidence", "publish"]);
  expect(h.bind).toHaveBeenCalledWith(expect.objectContaining({
    sdkVersion: "0.203.0", targets: ["target.txt"],
    authority: { companyId: "company", environmentId: "env", runId: "run", leaseId: "lease", sandboxId: "sandbox", image: h.input.image },
  }));
  expect(h.fixture.publishAction).toHaveBeenCalledWith(expect.stringMatching(/^\.paperclip-eval-action-[a-f0-9]{36}\.txt$/u), "PRIVATE ACTUAL ACTION");
  expect(JSON.stringify(h.input.evidence.mock.calls)).not.toContain("PRIVATE ACTUAL ACTION");
  await expect(h.bootstrap.bindAndRelease(h.request)).rejects.toThrow("one unconsumed");
});

it.each(["issue-company", "issue-agent", "issue-id", "run-company", "run-agent", "run-id", "run-terminal", "ambiguous-lease"])("rejects %s before observer execution or action delivery", async variant => {
  const h = harness(); h.bootstrap.prompt("nonce");
  if (variant === "issue-company") h.issue.companyId = "other";
  if (variant === "issue-agent") h.issue.assigneeAgentId = "other";
  if (variant === "issue-id") h.issue.id = "other";
  if (variant === "run-company") h.run.companyId = "other";
  if (variant === "run-agent") h.run.agentId = "other";
  if (variant === "run-id") h.run.id = "other";
  if (variant === "run-terminal") h.run.status = "succeeded";
  if (variant === "ambiguous-lease") h.leases.push({ ...h.leases[0]!, id: "second" });
  await expect(h.bootstrap.bindAndRelease(h.request)).rejects.toThrow();
  expect(h.bind).not.toHaveBeenCalled(); expect(h.fixture.publishAction).not.toHaveBeenCalled();
});

it("waits through queued admission without publishing early", async () => {
  const h = harness(); h.bootstrap.prompt("nonce"); h.run.status = "queued";
  const original = h.api.get.getMockImplementation()!; let count = 0;
  h.api.get.mockImplementation(async path => {
    if (path === "/api/heartbeat-runs/run" && ++count === 2) h.run.status = "running";
    return original(path);
  });
  await h.bootstrap.bindAndRelease(h.request);
  expect(count).toBe(2); expect(h.fixture.publishAction).toHaveBeenCalledTimes(1);
});

it.each(["", "x".repeat(16385)])("rejects empty or over-bound action after closing only its observer", async action => {
  const h = harness(); h.bootstrap.prompt("nonce");
  await expect(h.bootstrap.bindAndRelease({ ...h.request, actionPrompt: () => action })).rejects.toThrow("empty or too large");
  expect(h.fixture.publishAction).not.toHaveBeenCalled(); expect(h.fixture.close).toHaveBeenCalledTimes(1);
});

it("retains uncertain delivery and cleanup failure without retrying publication", async () => {
  const h = harness(); h.bootstrap.prompt("nonce");
  vi.mocked(h.fixture.publishAction).mockRejectedValue(new Error("uncertain delivery"));
  vi.mocked(h.fixture.close).mockRejectedValue(new Error("cleanup failed"));
  await expect(h.bootstrap.bindAndRelease(h.request)).rejects.toThrow("observer cleanup is unproven");
  await expect(h.bootstrap.bindAndRelease(h.request)).rejects.toThrow("one unconsumed");
  expect(h.fixture.publishAction).toHaveBeenCalledTimes(1);
});

it("rejects ambiguous bootstrap delivery and reused nonces", async () => {
  const h = harness(); h.bootstrap.prompt("first");
  expect(() => h.bootstrap.prompt("first")).toThrow("reused"); h.bootstrap.prompt("second");
  await expect(h.bootstrap.bindAndRelease(h.request)).rejects.toThrow("one unconsumed");
  expect(h.api.get).not.toHaveBeenCalled();
});

it.each(["nodeSha256", "runnerdSha256", "image"])("requires immutable %s before any remote call", field => {
  const h = harness();
  expect(() => createRemoteNativeBootstrap({ ...h.input, [field]: "ambient-latest" }, h.bind)).toThrow("immutable");
  expect(h.input.daytona.get).not.toHaveBeenCalled();
});


it("admits a cold building_snapshot lease after 20 seconds within the unchanged case deadline", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const h = harness(60_000); h.bootstrap.prompt("cold");
  const original = h.api.get.getMockImplementation()!;
  let sandboxState = "building_snapshot";
  h.api.get.mockImplementation(async path => path.endsWith("/leases") && sandboxState === "building_snapshot" ? [] : original(path));
  const delivery = h.bootstrap.bindAndRelease(h.request);
  await vi.advanceTimersByTimeAsync(25_000);
  expect(h.bind).not.toHaveBeenCalled(); expect(h.fixture.publishAction).not.toHaveBeenCalled();
  sandboxState = "started";
  await vi.advanceTimersByTimeAsync(100);
  await expect(delivery).resolves.toBe(h.fixture);
  expect(h.bind).toHaveBeenCalledWith(expect.objectContaining({ deadlineAt: 60_000 }));
  expect(h.input.daytona.get).not.toHaveBeenCalled();
});

it.each(["failed", "cancelled", "succeeded"])("stops waiting immediately when provisioning run becomes %s", async status => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const h = harness(60_000); h.bootstrap.prompt("terminal"); h.leases.length = 0;
  const delivery = expect(h.bootstrap.bindAndRelease(h.request)).rejects.toThrow("stopped before observer setup");
  await vi.advanceTimersByTimeAsync(1000); h.run.status = status;
  await vi.advanceTimersByTimeAsync(100); await delivery;
  expect(Date.now()).toBeLessThan(h.input.deadlineAt);
  expect(h.bind).not.toHaveBeenCalled(); expect(h.fixture.publishAction).not.toHaveBeenCalled();
  expect(h.input.evidence).toHaveBeenCalledWith("remote-native-bootstrap-startup-run.json", expect.objectContaining({ runStatus: status, deadlineReached: false }));
});

it("rechecks run ownership while waiting for the lease", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const h = harness(); h.bootstrap.prompt("owner"); h.leases.length = 0;
  const delivery = expect(h.bootstrap.bindAndRelease(h.request)).rejects.toThrow("ownership is unproven");
  await vi.advanceTimersByTimeAsync(100); h.run.companyId = "foreign";
  await vi.advanceTimersByTimeAsync(100); await delivery;
  expect(h.bind).not.toHaveBeenCalled(); expect(h.fixture.publishAction).not.toHaveBeenCalled();
});

it.each(["foreign-run", "foreign-issue", "inactive", "missing-provider"])("never admits %s and stops at the authored deadline with bounded state", async variant => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const h = harness(1000); h.bootstrap.prompt("timeout");
  if (variant === "foreign-run") h.leases[0]!.heartbeatRunId = "foreign";
  if (variant === "foreign-issue") h.leases[0]!.issueId = "foreign";
  if (variant === "inactive") h.leases[0]!.status = "released";
  if (variant === "missing-provider") h.leases[0]!.providerLeaseId = "";
  h.run.executionStage = "PRIVATE".repeat(10_000);
  const delivery = expect(h.bootstrap.bindAndRelease(h.request)).rejects.toThrow("Timed out waiting for owned native qualification lease");
  await vi.advanceTimersByTimeAsync(1000); await delivery;
  expect(Date.now()).toBe(1000); expect(h.bind).not.toHaveBeenCalled();
  expect(h.fixture.publishAction).not.toHaveBeenCalled();
  const state = h.input.evidence.mock.calls[0]![1];
  expect(state).toMatchObject({ executionStage: "unknown", activeOwnedLeaseCount: 0, deadlineReached: true });
  expect(Buffer.byteLength(JSON.stringify(state))).toBeLessThan(512);
  expect(JSON.stringify(state)).not.toContain("PRIVATE");
});

it("rejects a second same-run lease even if only one lease is active", async () => {
  const h = harness(); h.bootstrap.prompt("ambiguous");
  h.leases.push({ ...h.leases[0]!, id: "old", status: "released" });
  await expect(h.bootstrap.bindAndRelease(h.request)).rejects.toThrow("Ambiguous native qualification lease");
  expect(h.bind).not.toHaveBeenCalled(); expect(h.fixture.publishAction).not.toHaveBeenCalled();
});

it("does not start observation after the case deadline", async () => {
  const h = harness(0); h.bootstrap.prompt("expired");
  await expect(h.bootstrap.bindAndRelease(h.request)).rejects.toThrow("Timed out waiting");
  expect(h.api.get).not.toHaveBeenCalled(); expect(h.bind).not.toHaveBeenCalled();
});
