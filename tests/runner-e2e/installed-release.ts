import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";

/** Test supervisor only: launch the actual public CLI, with its own module root. */
export function installedReleaseLaunch(cliPath: string) {
  if (!path.isAbsolute(cliPath)) throw new Error("Installed release CLI must be an absolute path");
  const cli = realpathSync(cliPath);
  const root = path.resolve(path.dirname(cli), "..");
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  if (path.basename(cli) !== "index.js" || path.basename(path.dirname(cli)) !== "dist" ||
      manifest.name !== "paperclipai" || typeof manifest.version !== "string") {
    throw new Error("Installed release must use paperclipai/dist/index.js from its public package");
  }
  return { cli, cwd: root, args: [cli, "onboard", "--yes", "--run"], version: manifest.version };
}

/** Install the public plugin from the same consumer, without a workspace loader. */
export function installedReleaseDaytonaPlugin(cliPath: string): string {
  const cli = installedReleaseLaunch(cliPath);
  const plugin = realpathSync(path.join(path.dirname(cli.cwd), "@paperclipai/plugin-daytona"));
  const manifest = JSON.parse(readFileSync(path.join(plugin, "package.json"), "utf8"));
  if (manifest.name !== "@paperclipai/plugin-daytona" ||
      manifest.paperclipPlugin?.manifest !== "./dist/manifest.js" ||
      manifest.paperclipPlugin?.worker !== "./dist/worker.js" ||
      manifest.exports?.["."]?.import !== "./dist/index.js") {
    throw new Error("Installed release requires the public compiled Daytona plugin package");
  }
  realpathSync(path.join(plugin, "dist/manifest.js"));
  realpathSync(path.join(plugin, "dist/worker.js"));
  return plugin;
}

/** Qualification assets must never make a public installed product smoke pass. */
export function installedReleaseEnvironment(source: NodeJS.ProcessEnv, repositoryRoot: string, providerBin: string): NodeJS.ProcessEnv {
  if (source.PAPERCLIP_RUNNER_ACPX_QUALIFICATION) throw new Error("Installed release smoke requires production admission without qualification overrides");
  const result = { ...source };
  for (const key of Object.keys(result)) {
    if ((key.startsWith("PAPERCLIP_RUNNER_") && !key.startsWith("PAPERCLIP_RUNNER_E2E_")) ||
        key.startsWith("PAPERCLIP_ACPX_") || key.startsWith("PAPERCLIP_NATIVE_") ||
        key === "NODE_PATH" || key === "NODE_OPTIONS") delete result[key];
  }
  result.PATH = source.PATH?.split(path.delimiter).filter(entry =>
    entry && entry !== providerBin && entry !== repositoryRoot &&
    !entry.startsWith(`${repositoryRoot}${path.sep}`) && !entry.includes(`${path.sep}node_modules${path.sep}`),
  ).join(path.delimiter);
  return result;
}
