import { spawn } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";

/** Resolve the public server dependency, without importing/starting the server. */
export async function resolvePiProvisioner(serverUrl: string): Promise<string> {
  const url = new URL(serverUrl);
  if (url.protocol !== "file:" || url.search || url.hash) throw new Error("Pi setup requires an installed Paperclip server");
  const entry = await realpath(fileURLToPath(url));
  if (!entry.endsWith("/dist/index.js")) throw new Error("Pi setup requires the published server layout");
  const root = resolve(dirname(entry), "..");
  const manifest = join(root, "package.json");
  const info = await lstat(manifest);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 65536 || JSON.parse(await readFile(manifest, "utf8")).name !== "@paperclipai/server") throw new Error("Pi setup server package identity is invalid");
  const provisioner = join(root, "dist/vendor/paperclip-runner/cli/provision-pi.cjs");
  if (await realpath(provisioner) !== provisioner || !(await lstat(provisioner)).isFile()) throw new Error("Pi setup entrypoint escapes its server package");
  return provisioner;
}

export async function setupPiRuntime(): Promise<void> {
  const provisioner = await resolvePiProvisioner(import.meta.resolve("@paperclipai/server"));
  // Only the explicit setup command can download pinned public dependencies.
  // Do not forward provider credentials, proxy/npm config, HOME or NODE_OPTIONS.
  const child = spawn(process.execPath, [provisioner], {
    stdio: "inherit", env: { PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: "C.UTF-8" },
  });
  const cancel = () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); };
  process.on("SIGINT", cancel); process.on("SIGTERM", cancel);
  try {
    await new Promise<void>((accept, reject) => {
      let spawnError: Error | undefined;
      child.on("error", error => { spawnError = error; });
      child.once("close", (code, signal) => {
        if (spawnError) reject(spawnError);
        else if (code !== 0 || signal) reject(new Error("Pi setup did not finish. Review its error; an existing invalid installation is never replaced automatically."));
        else accept();
      });
    });
  } finally { process.off("SIGINT", cancel); process.off("SIGTERM", cancel); }
}

export function registerRuntimeCommands(program: Command): void {
  program.command("runtime").description("Manage explicitly installed agent runtimes")
    .command("setup <provider>")
    .description("Install and verify the pinned Pi runtime for this host (public downloads; no model calls)")
    .action(async (provider: string) => {
      if (provider !== "pi") throw new Error("Supported explicit runtime setup: paperclipai runtime setup pi");
      await setupPiRuntime();
    });
}
