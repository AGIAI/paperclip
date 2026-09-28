import { createHash } from "node:crypto";
import { once } from "node:events";
import { chmod, copyFile, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { awaitVerifiedAcpxProviderExit, awaitVerifiedAcpxProviderOwnership, verifyNativeAcpxInstallation } from "./installation-integrity.js";
import { parseNativeAcpxDistributionEntries, type NativeAcpxDistributionInput, type NativeAcpxDistributionEntry } from "./native-distribution-integrity.js";

const roots: string[] = [];
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture(options: { node?: boolean; script?: string } = {}): Promise<NativeAcpxDistributionInput> {
  const root = await mkdtemp(join(tmpdir(), "native-acpx-test-")); roots.push(root);
  const entries: NativeAcpxDistributionEntry[] = [];
  if (options.node) {
    await copyFile(process.execPath, join(root, "runtime")); await chmod(join(root, "runtime"), 0o700);
    const bytes = await readFile(join(root, "runtime")); entries.push({ path: "runtime", sha256: hash(bytes), size: bytes.length, executable: true });
    // Homebrew's test-host Node uses an @rpath libnode dylib. Include that
    // dependency in this fixture's closure instead of relying on its old path.
    const libraryRoot = join(dirname(process.execPath), "..", "lib");
    for (const name of (await readdir(libraryRoot).catch(() => [] as string[])).filter(name => /^libnode\..*\.dylib$/.test(name))) {
      await copyFile(join(libraryRoot, name), join(root, name)); await chmod(join(root, name), 0o600);
      const library = await readFile(join(root, name)); entries.push({ path: name, sha256: hash(library), size: library.length, executable: false });
    }
    const script = options.script ?? 'console.log("qualified-entry");';
    await writeFile(join(root, "entry.cjs"), script, { mode: 0o600 });
    entries.push({ path: "entry.cjs", sha256: hash(script), size: Buffer.byteLength(script), executable: false });
  } else {
    const script = options.script ?? '#!/bin/sh\nprintf "native:%s:%s" "$1" "${COPILOT_PKG_CACHE_HOME:-none}"\n';
    await writeFile(join(root, "runtime"), script, { mode: 0o700 });
    entries.push({ path: "runtime", sha256: hash(script), size: Buffer.byteLength(script), executable: true });
  }
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const manifestPath = join(root, "closure.json");
  await writeFile(manifestPath, JSON.stringify({ entries }));
  return { distributionRoot: root, manifestPath, expectedClosureSha256: hash(JSON.stringify(entries)), executable: "runtime", ...(options.node ? { entrypoint: "entry.cjs" } : {}), fixedArguments: options.node ? [] : ["fixed"] };
}
async function output(child: ChildProcess): Promise<{ text: string; error: string; code: number | null }> {
  let text = ""; let error = "";
  child.stdout!.on("data", value => { text += String(value); });
  child.stderr!.on("data", value => { error += String(value); });
  const [code] = await once(child, "close") as [number | null];
  return { text, error, code };
}

describe("native ACPX execution closure", () => {
  it("rejects paths, ordering, oversized files and altered manifest pins", () => {
    const entry = { path: "runtime", sha256: "a".repeat(64), size: 10, executable: true };
    for (const entries of [[{ ...entry, path: "../escape" }], [{ ...entry, path: "/absolute" }], [entry, entry], [{ ...entry, size: 2 ** 40 }], [{ ...entry, unknown: 1 }]]) {
      expect(() => parseNativeAcpxDistributionEntries({ entries }, hash(JSON.stringify(entries)))).toThrow();
    }
    expect(() => parseNativeAcpxDistributionEntries({ entries: [entry] }, "b".repeat(64))).toThrow("manifest digest mismatch");
  });
  it("checks every file digest and refuses links at admission", async () => {
    const declaration = await fixture(); const installation = await verifyNativeAcpxInstallation(declaration);
    await writeFile(join(declaration.distributionRoot, "runtime"), "altered");
    await expect(installation.openCommand()).rejects.toThrow();
    await rm(join(declaration.distributionRoot, "runtime"));
    await symlink("closure.json", join(declaration.distributionRoot, "runtime"));
    await expect(installation.openCommand()).rejects.toThrow("symbolic link");
  });
  it("launches only fixed arguments from a frozen snapshot after installed files change", async () => {
    const declaration = await fixture(); const lease = await (await verifyNativeAcpxInstallation(declaration)).openCommand();
    expect(() => lease.spawn(["--untrusted-override"])).toThrow("fixed profile arguments");
    await writeFile(join(declaration.distributionRoot, "runtime"), "changed after lease");
    const result = await output(lease.spawn());
    expect(result).toEqual({ text: "native:fixed:none", error: "", code: 0 });
    expect(() => lease.spawn()).toThrow("closed");
    await lease.close();
  });
  it("gives packaged executables a fresh private extraction cache each launch", async () => {
    const declaration = { ...await fixture(), isolatedCacheEnvironmentName: "COPILOT_PKG_CACHE_HOME" as const };
    const install = await verifyNativeAcpxInstallation(declaration);
    const first = await output((await install.openCommand()).spawn([], { env: { COPILOT_PKG_CACHE_HOME: "/ambient/cache" } }));
    const second = await output((await install.openCommand()).spawn());
    expect(first.text).toMatch(/^native:fixed:.*paperclip-acpx-native-.*\/state$/);
    expect(first.text).not.toBe(second.text);
  });
  it("loads a pinned Node entrypoint while rejecting unqualified external modules", async () => {
    const declaration = await fixture({ node: true });
    const result = await output((await (await verifyNativeAcpxInstallation(declaration)).openCommand()).spawn());
    expect(result.code, result.error).toBe(0); expect(result.text).toBe("qualified-entry\n");
    const outside = join(declaration.distributionRoot, "outside.cjs"); await writeFile(outside, "module.exports='ambient';");
    const evil = await fixture({ node: true, script: `require(${JSON.stringify(outside)});` });
    const denied = await output((await (await verifyNativeAcpxInstallation(evil)).openCommand()).spawn());
    expect(denied.code).not.toBe(0); expect(denied.error).toContain("escaped its closed distribution");
  }, 30_000);
  it("uses the existing guardian ownership and provider-exit proof for native children", async () => {
    const declaration = await fixture({ script: '#!/bin/sh\nprintf "ready"\nwhile :; do sleep 1; done\n' });
    const fences = await Promise.all([listen(), listen()]);
    const fds = fences.map(server => (server as Server & { _handle?: { fd?: number } })._handle!.fd!);
    const owners: number[] = [];
    const child = (await (await verifyNativeAcpxInstallation(declaration)).openCommand()).spawn([], {}, {
      credentialFenceFds: [fds[0]!, fds[1]!], activateCredentialFenceOwner: async pid => { owners.push(pid); },
    });
    let stderr = ""; child.stderr!.on("data", value => { stderr += String(value); });
    try {
      await awaitVerifiedAcpxProviderOwnership(child);
      expect(owners).toEqual([child.pid]);
      const [chunk] = await once(child.stdout!, "data"); expect(String(chunk), stderr).toBe("ready");
      const exited = once(child, "exit"); child.kill(); await exited;
      await awaitVerifiedAcpxProviderExit(child);
    } finally {
      child.kill(); await Promise.all(fences.map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))));
    }
  }, 15_000);
});

async function listen(): Promise<Server> {
  const server = createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening"); return server;
}
