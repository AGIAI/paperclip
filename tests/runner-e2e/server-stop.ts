import type { ChildProcess } from "node:child_process";
import { createProcessTreeOwner } from "./process-tree-owner.js";

// The wrapper receives Playwright's group signal; only it signals Paperclip.
export const runnerE2EServerDetached = process.platform !== "win32";
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function createRunnerE2EServerStopper(options: {
  gracefulTimeoutMs: number;
  forcedTimeoutMs: number;
  hasSpawnError: (child: ChildProcess) => boolean;
  markExpectedStop: (child: ChildProcess) => void;
  log: (message: string) => void;
  createOwner?: typeof createProcessTreeOwner;
}) {
  type State = {
    owner: ReturnType<typeof createProcessTreeOwner>;
    promise?: Promise<void>;
    gracefulDeadline?: number;
    gracefulSent: boolean;
    groupSignals: Set<number>;
    escalationLogged: boolean;
  };
  const states = new WeakMap<ChildProcess, State>();
  const exited = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null || options.hasSpawnError(child);
  function watch(child: ChildProcess) {
    let state = states.get(child);
    if (!state) {
      state = { owner: (options.createOwner ?? createProcessTreeOwner)(child), gracefulSent: false, groupSignals: new Set(), escalationLogged: false };
      states.set(child, state);
    }
    return state;
  }
  async function stopOnce(child: ChildProcess, state: State, signal: NodeJS.Signals) {
    await state.owner.observe();
    state.gracefulDeadline ??= Date.now() + options.gracefulTimeoutMs;
    if (!exited(child) && !state.gracefulSent) {
      child.kill(signal);
      state.gracefulSent = true;
    }
    while (Date.now() < state.gracefulDeadline) {
      await state.owner.observe();
      if (exited(child)) {
        if (!state.owner.liveGroups().length) { state.owner.stopObserving(); return; }
        // The leader is gone. Retire only descendants whose start identities
        // we observed while they belonged to this server, including private groups.
        const unsignaled = new Set(state.owner.liveGroups().map(group => group.processGroupId).filter(pid => !state.groupSignals.has(pid)));
        for (const pid of await state.owner.signal("SIGTERM", unsignaled)) state.groupSignals.add(pid);
      }
      await wait(25);
    }
    if (!state.escalationLogged) {
      options.log(`\nPaperclip did not stop within ${options.gracefulTimeoutMs}ms; sending SIGKILL\n`);
      state.escalationLogged = true;
    }
    if (runnerE2EServerDetached) await state.owner.signal("SIGKILL");
    else if (!exited(child)) child.kill("SIGKILL");
    const deadline = Date.now() + options.forcedTimeoutMs;
    do {
      await state.owner.observe();
      if (exited(child) && !state.owner.liveGroups().length) { state.owner.stopObserving(); return; }
      await wait(25);
    } while (Date.now() < deadline);
    throw new Error("Paperclip server or observed descendants did not exit after SIGKILL");
  }
  const stop = (child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): Promise<void> => {
    options.markExpectedStop(child);
    const state = watch(child);
    state.promise ??= Promise.resolve().then(() => stopOnce(child, state, signal)).catch(error => {
      // Retain the signal/deadline phase, but let final cleanup recover from an
      // inspection/signaling failure without delivering another graceful signal.
      state.promise = undefined;
      throw error;
    });
    return state.promise;
  };
  return Object.assign(stop, { watch: (child: ChildProcess) => watch(child).owner.observe() });
}
