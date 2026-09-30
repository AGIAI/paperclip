import type { ChildProcess } from "node:child_process";
import {
  observeDescendantProcessTree, readProcessTable, revalidateObservedProcessGroups,
  refreshContinuouslyLiveProcessGroups, safeProcessGroupTerminationOrder,
  type ObservedProcessGroup, type ProcessObservation,
} from "./process-tree.js";

export function createProcessTreeOwner(root: ChildProcess, options: {
  readTable?: () => Promise<ProcessObservation[] | null>;
  signalGroup?: (pid: number, signal: NodeJS.Signals) => void;
} = {}) {
  let groups: ObservedProcessGroup[] = [];
  let table: ProcessObservation[] = [];
  let rootStarted: string | undefined;
  let observing: Promise<void> | undefined;
  const readTable = options.readTable ?? readProcessTable;
  const signalGroup = options.signalGroup ?? ((pid, signal) => process.kill(-pid, signal));
  const exited = () => root.exitCode !== null || root.signalCode !== null || !root.pid;
  const running = (candidate: ProcessObservation) => !candidate.state?.startsWith("Z");

  function observe(): Promise<void> {
    if (process.platform === "win32") return Promise.resolve();
    if (observing) return observing;
    observing = (async () => {
      const next = await readTable();
      if (!next) throw new Error("Could not inspect owned process identities");
      const callerGroup = next.find(row => row.pid === process.pid)?.processGroupId;
      if (callerGroup === undefined) throw new Error("Cleanup caller group identity is unavailable");
      const rootRow = next.find(row => row.pid === root.pid);
      if (!rootStarted && !exited()) rootStarted = rootRow?.started;
      const retained = revalidateObservedProcessGroups(groups, next);
      // Never acquire a recycled group from its numeric ID alone.
      const lost = groups.filter(group => !retained.includes(group) && next.some(row => row.processGroupId === group.processGroupId && running(row)));
      if (lost.length) throw new Error("Owned process group identity became uncertain");
      const refreshed = refreshContinuouslyLiveProcessGroups(retained, next)
        .filter(group => group.processGroupId !== callerGroup);
      const anchors = refreshed.flatMap(group => group.members.map(member => member.pid));
      if (rootRow && rootStarted === rootRow.started) anchors.push(rootRow.pid);
      const byGroup = new Map(refreshed.map(group => [group.processGroupId, group]));
      for (const pid of anchors) {
        for (const group of observeDescendantProcessTree(next, pid).groups) {
          if (group.processGroupId !== callerGroup) byGroup.set(group.processGroupId, group);
        }
      }
      groups = [...byGroup.values()];
      table = next;
    })().finally(() => { observing = undefined; });
    return observing;
  }
  const timer = process.platform === "win32" ? undefined : setInterval(() => {
    void observe().catch(() => { /* Stop must obtain a fresh successful inspection. */ });
  }, 250);
  timer?.unref();
  void observe().catch(() => {});

  function liveGroups() {
    return groups.filter(group => table.some(row => row.processGroupId === group.processGroupId && running(row)));
  }
  async function signal(signal: NodeJS.Signals, selected?: ReadonlySet<number>) {
    await observe();
    const currentProcessGroupId = table.find(row => row.pid === process.pid)?.processGroupId ?? null;
    if (currentProcessGroupId === null) throw new Error("Cleanup caller group identity is unavailable");
    const live = liveGroups();
    const ordered = safeProcessGroupTerminationOrder({ rootProcessGroupId: root.pid ?? -1, currentProcessGroupId, groups: live });
    const signaled: number[] = [];
    for (const pid of ordered) {
      if (selected && !selected.has(pid)) continue;
      try { signalGroup(pid, signal); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      signaled.push(pid);
    }
    return signaled;
  }
  function gracefulRoots() {
    const live = liveGroups();
    const ids = new Set(live.map(group => group.processGroupId));
    if (root.pid && ids.has(root.pid)) return new Set([root.pid]);
    // After the launcher's leader exits, request shutdown only from the
    // outermost remaining owners; their wrappers still own child signaling.
    const byPid = new Map(table.map(row => [row.pid, row]));
    return new Set(live.filter(group => !table.some(row => {
      if (row.processGroupId !== group.processGroupId) return false;
      const seen = new Set<number>();
      let parent = byPid.get(row.parentPid);
      while (parent && !seen.has(parent.pid)) {
        seen.add(parent.pid);
        if (parent.processGroupId !== group.processGroupId && ids.has(parent.processGroupId)) return true;
        parent = byPid.get(parent.parentPid);
      }
      return false;
    })).map(group => group.processGroupId));
  }
  return { observe, signal, liveGroups, gracefulRoots, stopObserving: () => { if (timer) clearInterval(timer); } };
}


/** Give the launcher/wrapper chain sole graceful-signal ownership, then retire
 * only still-observed descendants. Used on normal exit as well as cancellation. */
export async function stopOwnedProcessTree(
  child: ChildProcess,
  owner: ReturnType<typeof createProcessTreeOwner>,
  gracefulMs = 45_000,
  forcedMs = 5_000,
): Promise<void> {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  if (process.platform === "win32") {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  } else {
    await owner.observe();
    await owner.signal("SIGTERM", owner.gracefulRoots());
  }
  const stopped = async () => {
    await owner.observe();
    return (child.exitCode !== null || child.signalCode !== null) && owner.liveGroups().length === 0;
  };
  const deadline = Date.now() + gracefulMs;
  while (Date.now() < deadline) {
    if (await stopped()) return;
    await wait(50);
  }
  if (process.platform === "win32") {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  } else await owner.signal("SIGKILL");
  const forcedDeadline = Date.now() + forcedMs;
  do {
    if (await stopped()) return;
    await wait(50);
  } while (Date.now() < forcedDeadline);
  throw new Error("Observed launcher descendants remained after bounded cleanup");
}
