import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import childProcess, { execFileSync } from "node:child_process";
import { captureDirectorySnapshot } from "@paperclipai/adapter-utils/workspace-restore-merge";
import { agentDirectoryBaselineDigest, agentDirectoryProbeProgram, observeLocalAgentDirectory, probeAgentDirectory } from "../services/agent-directory-probe.js";

describe("stable live agent directory observation", () => {
  let root: string;
  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "agent-directory-probe-")));
    fs.mkdirSync(join(root, "notes"));
    fs.writeFileSync(join(root, "AGENTS.md"), "Instructions\n");
    fs.writeFileSync(join(root, "notes", "memory.bin"), Buffer.from([0, 1, 255]));
  });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
  it("matches the complete materialized baseline and the actual remote Node program", async () => {
    const baseline = await captureDirectorySnapshot(root);
    const observed = probeAgentDirectory(root);
    expect(observed.digest).toBe(agentDirectoryBaselineDigest(baseline));
    const remote = JSON.parse(execFileSync(process.execPath, ["-e", agentDirectoryProbeProgram, root], { encoding: "utf8", env: {}, timeout: 10_000 }));
    expect(remote).toEqual(observed);
  });
  it("runs the local observation in its bounded credential-free child", async () => {
    expect(await observeLocalAgentDirectory(root)).toEqual(probeAgentDirectory(root));
  });
  it.each(["timeout", "oversized", "malformed"])("rejects %s local-child observations", async kind => {
    const stub = vi.spyOn(childProcess, "execFile").mockImplementation(((file: string, args: string[], options: object, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      expect(file).toBe(process.execPath);
      expect(args).toEqual(["-e", agentDirectoryProbeProgram, root]);
      expect(options).toMatchObject({ cwd: root, env: {}, timeout: 10_000, maxBuffer: 1024, killSignal: "SIGKILL" });
      callback(kind === "timeout" ? Object.assign(new Error("timed out"), { killed: true, signal: "SIGKILL" }) : null,
        kind === "oversized" ? "x".repeat(1025) : "{}", "");
      return {} as childProcess.ChildProcess;
    }) as typeof childProcess.execFile);
    await expect(observeLocalAgentDirectory(root)).rejects.toThrow();
    expect(stub).toHaveBeenCalledOnce();
  });
  it.each(["edit", "add", "remove", "mode"])("detects a legitimate %s", change => {
    const before = probeAgentDirectory(root);
    if (change === "edit") fs.writeFileSync(join(root, "AGENTS.md"), "New instructions\n");
    if (change === "add") fs.writeFileSync(join(root, "new.txt"), "New");
    if (change === "remove") fs.unlinkSync(join(root, "notes", "memory.bin"));
    if (change === "mode") fs.chmodSync(join(root, "AGENTS.md"), 0o700);
    expect(probeAgentDirectory(root).digest).not.toBe(before.digest);
  });
  it.each(["symlink", "hardlink", "reserved"])("rejects %s entries", kind => {
    if (kind === "symlink") fs.symlinkSync(join(root, "AGENTS.md"), join(root, "unsafe"));
    if (kind === "hardlink") fs.linkSync(join(root, "AGENTS.md"), join(root, "unsafe"));
    if (kind === "reserved") fs.mkdirSync(join(root, ".paperclip-runtime"));
    expect(() => probeAgentDirectory(root)).toThrow();
  });
  it("detects file mutation during a bounded read", () => {
    const read = fs.readSync;
    let changed = false;
    vi.spyOn(fs, "readSync").mockImplementation(((...args: Parameters<typeof read>) => {
      const result = Reflect.apply(read, fs, args);
      if (!changed) { changed = true; fs.appendFileSync(join(root, "AGENTS.md"), "Concurrent change"); }
      return result;
    }) as typeof read);
    expect(() => probeAgentDirectory(root)).toThrow(/changed|grew/);
  });
  it("fails on unreadable observations instead of reporting unchanged", () => {
    vi.spyOn(fs, "openSync").mockImplementation(() => { throw Object.assign(new Error("denied"), { code: "EACCES" }); });
    expect(() => probeAgentDirectory(root)).toThrow("denied");
  });
  it("does not let matching replacement bytes preserve the pinned root identity", () => {
    const before = probeAgentDirectory(root);
    const retired = `${root}-retired`;
    fs.renameSync(root, retired);
    try { fs.cpSync(retired, root, { recursive: true }); expect(probeAgentDirectory(root).identity).not.toBe(before.identity); }
    finally { fs.rmSync(retired, { recursive: true, force: true }); }
  });
  it("rejects excluded/incomplete baselines", async () => {
    const baseline = await captureDirectorySnapshot(root);
    expect(() => agentDirectoryBaselineDigest({ ...baseline, exclude: ["notes"] })).toThrow("Incomplete");
  });
});
