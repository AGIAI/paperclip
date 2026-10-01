import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { piControlTasks } from "./pi-controls-cases.js";
import { piControlFixture } from "./pi-controls-test-fixture.js";
import { runPiControlsFlow } from "./pi-controls-flow.js";

const harness = vi.hoisted(() => ({ target: "", prompt: "", message: "", mutation: false, incomplete: false }));
vi.mock("./user-actions.js", () => ({
  createTaskThroughUi: async (input: { prompt: string }) => { harness.prompt = input.prompt; },
  submitTaskReply: async (_page: unknown, body: string) => { harness.message = body; return Date.now(); },
}));
vi.mock("./copilot-local-fixtures.js", async importOriginal => {
  const actual = await importOriginal<typeof import("./copilot-local-fixtures.js")>();
  return { ...actual, createDeniedTargetFixture: async (workspace: string, name: string) => {
    const f = await actual.createDeniedTargetFixture(workspace, name); harness.target = f.targetRelativePath;
    return { ...f, watcher: { finish: () => ({ ...f.watcher.finish(), complete: !harness.incomplete && f.watcher.finish().complete, targetMutationCount: harness.mutation ? 1 : 0 }) } };
  }, observeRunProcesses: () => ({ sample: () => ({ captured: true, live: [], journal: [] }) }) };
});
vi.mock("@playwright/test", () => ({ expect: (actual: any, message?: string) => ({
  toBe: (value: unknown) => expect(actual, message).toBe(value),
  toBeVisible: async () => {}, toBeEnabled: async () => {},
  toHaveCount: async (value: number) => { if (typeof actual.count === "function") expect(actual.count()).toBe(value); },
}) }));

async function exercise(taskId: string, remote: boolean, failure?: "mutation" | "incomplete" | "missing-ack") {
  harness.target = ""; harness.prompt = ""; harness.message = ""; harness.mutation = failure === "mutation"; harness.incomplete = failure === "incomplete";
  const task = piControlTasks.find(t => t.id === taskId)!, stopCase = taskId === "pending-permission-stop";
  const workspacePath = await mkdtemp(join(tmpdir(), "pi-controls-fixture-"));
  const saved = new Map<string, any>(), localCleanup: Array<() => Promise<any>> = [], remoteCleanup: Array<() => Promise<any>> = [];
  let f = piControlFixture(`pi-control-fixture.txt`), stops = 0, staleDeclines = 0, browserSteers = 0, browserDeclines = 0;
  let steeringMarker = "", published = false, remoteSequence = 0;
  const sync = () => {
    const target = remote ? "pi-control-fixture.txt" : harness.target;
    f.scope.target = target; f.tool.target = target; f.issue.title = task.buildTitle("fixture");
  };
  const queue = () => ({ queueId: "queue", targetRunId: "run", revision: "revision", protocol: "paperclip_runner_v1", steeringDisposition: "available", entries: harness.message ? [{ comment: { id: "comment", body: harness.message } }] : [] });
  const api = {
    post: async (path: string, body: any) => {
      if (path.endsWith("/projects")) return { name: "Pi controls fixture" };
      if (path === "/api/heartbeat-runs/run/cancel") { stops++; expect(stopCase).toBe(true); return f.cancel(body.cancellationRequestId); }
      throw new Error(`Unexpected mutation ${path}`);
    },
    patch: async (_path: string, value: any) => value,
    get: async (path: string) => {
      sync();
      if (path === "/api/health") return { deploymentMode: "local_trusted" };
      if (path === "/api/auth/get-session") return { session: { userId: "local-board", id: "paperclip:local_implicit:local-board" } };
      if (path === "/api/agents/agent") return { adapterConfig: {} };
      if (path.endsWith("/issues?limit=100")) return [f.issue];
      if (path === "/api/issues/issue") return f.issue;
      if (path.endsWith("/heartbeat-runs?limit=100")) return [f.run];
      if (path === "/api/heartbeat-runs/run") return f.run;
      if (path.includes("/events?")) return f.events;
      if (path.endsWith("/queued-comments")) return queue();
      if (path.endsWith("/comments")) return f.run.status === "succeeded" ? [{ id: "final", createdByRunId: "run", body: steeringMarker }] : [];
      throw new Error(`Unexpected read ${path}`);
    },
    request: { post: async (path: string, options: any) => {
      expect(path).toBe("/api/heartbeat-runs/run/runtime-requests/request/resolve");
      expect(f.run.status).toBe("cancelled"); expect(options.data.resolution.action).toBe("decline"); staleDeclines++;
      return { status: () => 409 };
    } },
  };
  const waiters: Array<{ predicate: (request: any) => boolean; resolve: (request: any) => void }> = [];
  function postBrowser(path: string, body: unknown) {
    const request = { url: () => `http://fixture${path}`, method: () => "POST", postDataJSON: () => body };
    const waiter = waiters.find(w => w.predicate(request)); if (!waiter) throw new Error("Browser request was not awaited");
    waiter.resolve(request); waiters.splice(waiters.indexOf(waiter), 1);
  }
  const locator = (kind = "other"): any => ({
    filter: () => locator(kind), last: () => locator(kind), getByText: () => locator(),
    count: () => kind === "loading" ? 0 : kind === "card" ? 1 : kind === "deny" ? (f.run.status === "running" ? 1 : 0) : 1,
    getByRole: (_role: string, options: { name: string }) => locator(options.name === "Deny" ? "deny" : "other"),
    getByTestId: () => locator(),
    click: async () => {
      if (kind === "steer") {
        browserSteers++; expect(f.run.status).toBe("running"); expect(f.events.some(e => e.eventType.startsWith("runtime_request.") && e.eventType !== "runtime_request.created")).toBe(false);
        steeringMarker = /PI-STEER-[a-f0-9]{32}/.exec(harness.message)?.[0] ?? "";
        expect(steeringMarker).not.toBe(""); expect(harness.prompt).not.toContain(steeringMarker);
        f.steer();
        if (failure === "missing-ack") f.run.resultJson.queuedSteeringAcknowledgements = {};
        postBrowser("/api/issues/issue/queued-comments/comment/steer", { queueId: "queue", targetRunId: "run", revision: "revision" });
      } else if (kind === "deny") {
        browserDeclines++; expect(browserSteers).toBe(1); expect(stopCase).toBe(false); f.finish();
        postBrowser("/api/heartbeat-runs/run/runtime-requests/request/resolve", { turnId: "turn", requestKind: "permission_approval", resolution: { action: "decline" } });
      } else throw new Error(`Unexpected click ${kind}`);
    },
  });
  const page = { goto: async () => {}, reload: async () => {}, getByText: () => locator(),
    getByTestId: (id: string) => locator(id === "task-chat-runtime-request" ? "card" : id.startsWith("task-chat-queued-steer-") ? "steer" : id === "task-chat-history-loading" ? "loading" : "other"),
    waitForRequest: (predicate: (request: any) => boolean) => new Promise(resolve => waiters.push({ predicate, resolve })) };
  // The real shared remote oracle is exercised. Poisoned local copyback cannot
  // satisfy these remote observations or retirement assertions.
  const root = { pid: 50, ppid: 1, startTicks: "200", bootId: "12345678-1234-1234-1234-123456789abc" };
  const binding = { companyId: "company", environmentId: "environment", runId: "run", leaseId: "lease", sandboxId: "sandbox", image: `image@sha256:${"a".repeat(64)}`, remoteCwd: "/home/daytona/workspace" };
  const snapshot = (retired = false) => ({
    binding, observedAtMs: ++remoteSequence, receivedAtMs: remoteSequence + 1, observedMonotonicNs: String(remoteSequence), complete: true, workspace: {},
    targets: { "pi-control-fixture.txt": { absent: true, sha256: null, complete: true, mutationCount: retired && harness.mutation ? 1 : 0, parent: { dev: "1", ino: "2" } } },
    watcher: { complete: !(retired && harness.incomplete), targetMutationCount: retired && harness.mutation ? 1 : 0, workspaceMutationCount: 0 },
    processes: { captured: true, root, journal: [root], live: retired ? [] : [50] },
    setup: { path: ".paperclip-eval-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.txt", sha256: published ? `sha256:${"b".repeat(64)}` : null, published }, attached: null,
  });
  let seal: ReturnType<typeof snapshot> | undefined;
  const fixture = { binding, remoteCwd: binding.remoteCwd, actionFile: ".paperclip-eval-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.txt", snapshot: async () => snapshot(), finish: async () => seal ??= snapshot(true), close: vi.fn() };
  const remoteBootstrap = remote ? { prompt: () => "Read bootstrap only", bindAndRelease: async (input: any) => {
    expect(input.targets).toEqual(["pi-control-fixture.txt"]); harness.prompt = await input.actionPrompt(fixture); published = true; return fixture;
  } } : undefined;
  try {
    if (remote) await writeFile(join(workspacePath, "pi-control-fixture.txt"), "WRONG HOST COPYBACK");
    const call = runPiControlsFlow({ page, api, fixtures: { company: { id: "company", issuePrefix: "PI" }, agent: { id: "agent", name: "Pi" }, environment: { id: "environment" } },
      execution: { task, suite: { id: "pi-controls" }, environment: { id: remote ? "daytona" : "local" }, profile: { qualificationCandidate: "pi" } }, workspacePath, nonce: "fixture", deadlineAt: Date.now() + 1000,
      observe: () => {}, capture: async () => {}, evidence: async (name: string, value: unknown) => saved.set(name, structuredClone(value)), remoteBootstrap,
      registerCleanupAssertion: (fn: () => Promise<any>) => localCleanup.push(fn), registerBeforeEnvironmentTeardownAssertion: (fn: () => Promise<any>) => remoteCleanup.push(fn) } as any);
    if (failure === "missing-ack") { await expect(call).rejects.toThrow("acknowledgement"); expect(browserDeclines).toBe(0); }
    else if (remote && failure) await expect(call).rejects.toThrow();
    else {
      const result = await call; expect(result.checks.every(c => c.passed)).toBe(true); expect(saved.has("api-state.json")).toBe(true);
      expect(stops).toBe(stopCase ? 1 : 0); expect(staleDeclines).toBe(stopCase ? 1 : 0);
      expect(browserSteers).toBe(stopCase ? 0 : 1); expect(browserDeclines).toBe(stopCase ? 0 : 1);
    }
    expect(remote ? localCleanup : remoteCleanup).toHaveLength(0);
    const cleanups = remote ? remoteCleanup : localCleanup; expect(cleanups).toHaveLength(1);
    if (failure) await expect(cleanups[0]!()).rejects.toThrow();
    else expect((await cleanups[0]!())[0].passed).toBe(true);
    if (remote) { expect(fixture.close).toHaveBeenCalledOnce(); expect(saved.get("pi-control-cleanup.json").retirement?.filesystemAfterRetirementObserved ?? false).toBe(false); }
  } finally { await rm(workspacePath, { recursive: true, force: true }); }
}
for (const task of ["pending-permission-stop", "same-turn-steering"]) {
  it.each([false, true])(`${task} drives actual flow and cleanup with remote=%s`, remote => exercise(task, remote));
}
it.each(["mutation", "incomplete"] as const)("fails local cleanup on %s despite an absent final target", failure => exercise("pending-permission-stop", false, failure));
it.each(["mutation", "incomplete"] as const)("fails remote lifetime proof on %s despite an absent target", failure => exercise("same-turn-steering", true, failure));
it("never denies the native write before the steering acknowledgement exists", () => exercise("same-turn-steering", false, "missing-ack"));
