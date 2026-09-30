import type { ChildProcess } from "node:child_process";
import { expect, it } from "vitest";
import { createProcessTreeOwner } from "./process-tree-owner.js";
import type { ProcessObservation } from "./process-tree.js";

function row(pid: number, parentPid: number, processGroupId: number, started = `start-${pid}`, state = "S"): ProcessObservation {
  return { pid, parentPid, processGroupId, started, state, kind: "node" };
}
function fixture(initial: ProcessObservation[]) {
  let table = [row(process.pid, 1, 10), ...initial];
  const root = { pid: 100, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null };
  const signals: Array<[number, NodeJS.Signals]> = [];
  const owner = createProcessTreeOwner(root as ChildProcess, {
    readTable: async () => table,
    signalGroup: (pid, signal) => { signals.push([pid, signal]); },
  });
  return { root, owner, signals, replace: (rows: ProcessObservation[]) => { table = [row(process.pid, 1, 10), ...rows]; } };
}

it.skipIf(process.platform === "win32")("revalidates PID/start before signaling and refuses a recycled group", async () => {
  const f = fixture([row(100, process.pid, 100), row(200, 100, 200)]);
  try {
    await f.owner.observe();
    f.replace([row(100, process.pid, 100), row(200, 1, 200, "new-start")]);
    await expect(f.owner.signal("SIGKILL")).rejects.toThrow("identity became uncertain");
    expect(f.signals).toEqual([]);
  } finally { f.owner.stopObserving(); }
});

it.skipIf(process.platform === "win32")("retains observed descendants when the root exits and excludes the caller group", async () => {
  const f = fixture([row(100, process.pid, 100), row(200, 100, 200), row(300, 100, 10), row(999, process.pid, 999)]);
  try {
    await f.owner.observe();
    f.root.exitCode = 1;
    f.replace([row(200, 1, 200), row(300, 1, 10), row(999, process.pid, 999)]);
    await f.owner.signal("SIGTERM");
    expect(f.signals).toEqual([[200, "SIGTERM"]]);
  } finally { f.owner.stopObserving(); }
});

it.skipIf(process.platform === "win32")("treats an unreaped zombie as stopped without signaling a replacement", async () => {
  const f = fixture([row(100, process.pid, 100), row(200, 100, 200)]);
  try {
    await f.owner.observe();
    f.root.exitCode = 1;
    f.replace([row(200, 1, 200, "start-200", "Z")]);
    await f.owner.signal("SIGKILL");
    expect(f.owner.liveGroups()).toEqual([]);
    expect(f.signals).toEqual([]);
  } finally { f.owner.stopObserving(); }
});

it.skipIf(process.platform === "win32")("sends launcher grace only to the root while retaining nested groups for escalation", async () => {
  const f = fixture([row(100, process.pid, 100), row(200, 100, 200), row(300, 200, 300)]);
  try {
    await f.owner.observe();
    await f.owner.signal("SIGTERM", f.owner.gracefulRoots());
    expect(f.signals).toEqual([[100, "SIGTERM"]]);
    f.root.exitCode = 1;
    f.replace([row(200, 1, 200), row(300, 200, 300)]);
    await f.owner.observe();
    expect([...f.owner.gracefulRoots()]).toEqual([200]);
    await f.owner.signal("SIGKILL");
    expect(f.signals.slice(1).map(([pid]) => pid).sort()).toEqual([200, 300]);
  } finally { f.owner.stopObserving(); }
});
