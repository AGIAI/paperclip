import type { ChildProcess } from "node:child_process";

// The wrapper receives Playwright's group signal; only it signals Paperclip.
export const runnerE2EServerDetached = process.platform !== "win32";

export function createRunnerE2EServerStopper(options: {
  gracefulTimeoutMs: number;
  forcedTimeoutMs: number;
  hasSpawnError: (child: ChildProcess) => boolean;
  markExpectedStop: (child: ChildProcess) => void;
  log: (message: string) => void;
}) {
  const stops = new WeakMap<ChildProcess, Promise<void>>();
  const exited = (child: ChildProcess) =>
    child.exitCode !== null || child.signalCode !== null || options.hasSpawnError(child);

  function waitForExit(child: ChildProcess, timeoutMs: number) {
    if (exited(child)) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const finish = (didExit: boolean) => {
        clearTimeout(timer);
        child.off("exit", onExit);
        child.off("error", onExit);
        resolve(didExit);
      };
      const onExit = () => finish(true);
      const timer = setTimeout(() => finish(false), timeoutMs);
      child.once("exit", onExit);
      child.once("error", onExit);
    });
  }

  async function stopOnce(child: ChildProcess, signal: NodeJS.Signals) {
    if (exited(child)) return;
    try { child.kill(signal); }
    catch (error) { if (!exited(child)) throw error; }
    if (await waitForExit(child, options.gracefulTimeoutMs)) return;
    options.log(`\nPaperclip did not stop within ${options.gracefulTimeoutMs}ms; sending SIGKILL\n`);
    try {
      // This still-live direct child leads the private group we spawned. Kill
      // its group only on timeout, so descendants cannot outlive escalation.
      if (runnerE2EServerDetached && child.pid) process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch (error) { if (!exited(child)) throw error; }
    if (!(await waitForExit(child, options.forcedTimeoutMs))) {
      throw new Error("Paperclip server did not exit after SIGKILL");
    }
  }

  return (child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): Promise<void> => {
    options.markExpectedStop(child);
    let stop = stops.get(child);
    if (!stop) {
      // Publish ownership before invoking any callback or delivering a signal.
      stop = Promise.resolve().then(() => stopOnce(child, signal));
      stops.set(child, stop);
    }
    return stop;
  };
}
