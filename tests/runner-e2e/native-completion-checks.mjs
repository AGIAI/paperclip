// Independent, credential-free admission for the native completion comparison.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  NATIVE_COMPLETION_SOURCE_CONTRACT, NATIVE_COMPLETION_SOURCE_FILES,
  nativeCompletionSourceFingerprint, nativeSourceSha256,
} from "./native-completion-source-contract.mjs";

const root = resolve(import.meta.dirname, "../..");
export const NATIVE_COMPLETION_PREFLIGHT_SCHEMA = "paperclip.native-completion-preflight.v1";
export const NATIVE_COMPLETION_CELL_IDS = ["runner-codex", "runner-acpx-claude", "runner-opencode"].flatMap(profile =>
  ["assigned-skill-explicit-invocation", "native-blocked-report"].map(task => `native-completion.${profile}.local.${task}`));
export function nativeCompletionGates(variant) {
  if (!["candidate", "historical"].includes(variant)) throw new Error("Unknown native completion source variant");
  return [
    { id: "NC-schemas", name: "Variant-native completion schemas", cwd: "packages/paperclip-runner",
      files: ["src/contracts/completion-result.test.ts"],
      required: ["distinguishes user-facing answer content", "propagates answer and wait descriptions", "requires a reason code for verification that was not run"] },
    { id: "NC-tools", name: "Native tool delivery and retained provider catalogs", cwd: "packages/paperclip-runner", files: [
      "src/drivers/codex/codex-app-server-driver.lifecycle.test.ts", "src/drivers/runner-tool-bridge.test.ts",
      "src/drivers/opencode/mcp-bridge.test.ts", "src/live/runnerd-codex-transport.test.ts"],
      testPattern: "binds to loopback|preserves stock Codex instructions on|includes ACPX terminal tools|preserves answer and internal wait descriptions",
      required: ["runner semantic MCP bridge binds to loopback", "OpenCode MCP bridge binds to loopback",
        "preserves stock Codex instructions on task recovery", "preserves stock Codex instructions on prepared recovery",
        "preserves stock Codex instructions on direct recovery", "includes ACPX terminal tools in the authenticated bridge catalog",
        ...(variant === "candidate" ? ["codex", "opencode", "claude_managed", "aws_agentcore", "acpx"].map(provider =>
          `preserves answer and internal wait descriptions in the serialized native ${provider} tool catalog`) : [])] },
    { id: "NC-resume", name: "Variant-native fingerprint and checkpoint refresh", cwd: ".",
      files: ["server/src/services/native-runtime/native-session-resume.test.ts"], testPattern: "refreshes retained",
      required: ["refreshes retained 'completion descriptions'", "refreshes retained 'task-bound human-input description'",
        ...(variant === "candidate" ? ["native completion tool guidance"] : [])] },
    { id: "NC-eval", name: "Independent native oracle, defaults, admission and attempt policy", cwd: ".",
      config: "tests/runner-e2e/vitest.config.ts", files: [
        "tests/runner-e2e/native-completion-scoring.test.ts", "tests/runner-e2e/native-completion-defaults.test.ts",
        "tests/runner-e2e/native-completion-admission.test.ts", "tests/runner-e2e/automatic-retry.test.ts",
        "tests/runner-e2e/context-integrity.test.ts", "tests/runner-e2e/context-integrity-evidence.test.ts",
        "tests/runner-e2e/context-integrity-flow-logs.test.ts"],
      required: ["allows toolchain paths and excludes every present or future credential",
        "retains credential-free prerequisites inside the exact campaign root",
        "retains the first transient_infrastructure failure without a second attempt",
        "retains the first provider_variance failure without a second attempt"] },
  ];
}
export const NATIVE_COMPLETION_COMMAND_GATE_IDS = ["NC-node", "NC-typecheck", "NC-manifest", "NC-discovery"];
export function gradeNativeCompletionGate(gate, report, exitCode) {
  const assertions = (report?.testResults ?? []).flatMap(file => file.assertionResults ?? []);
  const requirements = gate.required.map(name => ({ name, passed: assertions.some(assertion =>
    assertion.fullName?.includes(name) && assertion.status === "passed") }));
  const files = gate.files.map(file => ({ file, passed: (report?.testResults ?? []).some(result =>
    result.name?.endsWith(file) && result.status === "passed" && result.assertionResults?.some(assertion => assertion.status === "passed") &&
    result.assertionResults.every(assertion => assertion.status === "passed" || (gate.testPattern && assertion.status === "skipped" &&
      !gate.required.some(name => assertion.fullName?.includes(name))))) }));
  return { id: gate.id, name: gate.name, passed: exitCode === 0 && requirements.every(row => row.passed) && files.every(row => row.passed),
    exitCode, files, requirements, total: report?.numTotalTests ?? 0, passedTests: report?.numPassedTests ?? 0,
    failedTests: report?.numFailedTests ?? 0, pendingTests: report?.numPendingTests ?? 0 };
}

export function gradeNativeCompletionDiscovery(output, exitCode) {
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  const rows = lines.slice(1).map(line => line.split("\t"));
  const ids = rows.map(row => row[0]);
  return { passed: exitCode === 0 && lines[0] === "ID\tSUITE\tGENERATION\tPROVIDER\tMODEL\tCREDENTIALS" &&
    rows.length === 6 && new Set(ids).size === 6 && NATIVE_COMPLETION_CELL_IDS.every(id => ids.includes(id)) &&
    rows.every(row => row.length === 6 && row[1] === "native-completion" && row[2] === "native" && row[4]?.trim() && row[5]?.trim()),
    executionIds: ids, expectedCells: 6, expectedTurns: 6, maximumAttemptsPerCell: 1 };
}
export function nativeCompletionPrerequisiteEnvironment(source) {
  return Object.fromEntries(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT", "LANG", "LC_ALL",
    "CARGO_HOME", "RUSTUP_HOME", "CI", "GITHUB_ACTIONS"].flatMap(name => source[name] === undefined ? [] : [[name, source[name]]]));
}
function git(args) { return spawnSync("git", args, { cwd: root, encoding: "utf8" }); }
function currentSource() {
  const source = nativeCompletionSourceFingerprint();
  const head = git(["rev-parse", "HEAD"]), ancestor = git(["merge-base", "--is-ancestor", source.baseSha, "HEAD"]);
  const tracked = git(["ls-files", "--error-unmatch", "--", ...NATIVE_COMPLETION_SOURCE_FILES]);
  const clean = git(["diff", "--quiet", "HEAD"]);
  const status = git(["status", "--porcelain", "--untracked-files=normal"]);
  return { ...source, sha: head.status === 0 ? head.stdout.trim() : null,
    layering: ancestor.status === 0, immutable: tracked.status === 0 && clean.status === 0 && status.status === 0 && status.stdout.trim() === "" };
}
function buildOutputFingerprint() {
  const hash = createHash("sha256");
  function visit(relative) {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(relative, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) { const bytes = readFileSync(join(root, file)); hash.update(JSON.stringify([file, bytes.length])).update(bytes); }
      else throw new Error(`Unexpected build output: ${file}`);
    }
  }
  for (const directory of ["packages/shared/dist", "packages/plugins/sdk/dist", "packages/paperclip-runner/dist"]) {
    if (!existsSync(join(root, directory, "index.js"))) throw new Error(`Missing prerequisite build output: ${directory}`);
    visit(directory);
  }
  return hash.digest("hex");
}
export function assertNativeCompletionPreflightReceipt(report, current) {
  const expected = [...nativeCompletionGates(current.variant).map(gate => gate.id), ...NATIVE_COMPLETION_COMMAND_GATE_IDS];
  if (report?.schema !== NATIVE_COMPLETION_PREFLIGHT_SCHEMA || report.passed !== true || report.providerCalls !== 0 ||
      report.live !== "not_run" || report.sourceSha !== current.sha || !/^[a-f0-9]{40}$/.test(current.sha ?? "") ||
      ![current.fingerprint, current.fixtureFingerprint, current.manifestFingerprint, current.buildOutputFingerprint]
        .every(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) ||
      report.sourceFingerprint !== current.fingerprint || report.fixtureFingerprint !== current.fixtureFingerprint ||
      report.manifestFingerprint !== current.manifestFingerprint || report.variant !== current.variant ||
      report.baseSha !== NATIVE_COMPLETION_SOURCE_CONTRACT.baseSha || report.archiveSha !== NATIVE_COMPLETION_SOURCE_CONTRACT.archiveSha ||
      report.layering !== true || current.layering !== true || report.immutable !== true || current.immutable !== true ||
      !Array.isArray(report.sourceErrors) || report.sourceErrors.length !== 0 || current.sourceErrors?.length !== 0 ||
      report.setup?.passed !== true || report.setup.sdkExitCode !== 0 || report.setup.runnerTypeScriptExitCode !== 0 ||
      report.setup.buildOutputFingerprint !== current.buildOutputFingerprint ||
      !Array.isArray(report.setup.evidence) || report.setup.evidence.length !== 2 ||
      ["setup-sdk.txt", "setup-runner-typescript.txt"].some(file => report.setup.evidence.filter(row =>
        row.file === file && /^[a-f0-9]{64}$/.test(row.sha256 ?? "")).length !== 1) ||
      !Array.isArray(report.gates) || report.gates.length !== expected.length ||
      expected.some(id => report.gates.filter(gate => gate.id === id && gate.passed === true && gate.exitCode === 0).length !== 1) ||
      report.expectedCells !== 6 || report.expectedTurns !== 6 || report.maximumAttemptsPerCell !== 1) {
    throw new Error("Native completion requires passing prerequisites for this exact immutable source SHA, variant and fingerprint.");
  }
  return report;
}
function runCommand(command, args, env, timeout = 10 * 60_000, cwd = root) {
  return spawnSync(command, args, { cwd, env, encoding: "utf8", timeout });
}
function capture(output, name, run) {
  const file = `${name}.txt`, bytes = `${run?.stdout ?? ""}\n${run?.stderr ?? ""}`;
  writeFileSync(join(output, file), bytes);
  return { file, sha256: nativeSourceSha256(bytes) };
}
export function assertRetainedNativeCompletionEvidence(output, evidence) {
  if (!evidence || typeof evidence.file !== "string" || !/^[A-Za-z0-9_.-]+$/.test(evidence.file) ||
      nativeSourceSha256(readFileSync(join(output, evidence.file))) !== evidence.sha256)
    throw new Error("Native completion retained prerequisite evidence changed or is unavailable.");
  return readFileSync(join(output, evidence.file), "utf8");
}
function manifestCommands(env) {
  return ["generate-capability-contract.mjs", "check-capability-inventory.mjs"].map(file => runCommand(process.execPath,
    [join(root, "packages/paperclip-runner/scripts", file), ...(file.startsWith("generate-") ? ["--check"] : [])], env));
}

export function main(args = process.argv.slice(2)) {
  if (args.includes("--list")) {
    console.log(JSON.stringify({ variants: ["candidate", "historical"], gates: nativeCompletionGates("candidate"),
      commands: NATIVE_COMPLETION_COMMAND_GATE_IDS, cells: NATIVE_COMPLETION_CELL_IDS, providerCalls: 0 }, null, 2)); return;
  }
  if (args.some(arg => !arg.startsWith("--output-dir=") && !arg.startsWith("--verify=")))
    throw new Error("Use --list, --output-dir=<path> or --verify=<receipt>; never paid providers.");
  const source = currentSource(), env = nativeCompletionPrerequisiteEnvironment(process.env);
  const verify = args.find(arg => arg.startsWith("--verify="))?.slice("--verify=".length);
  if (verify) {
    const report = assertNativeCompletionPreflightReceipt(JSON.parse(readFileSync(verify, "utf8")), {
      ...source, buildOutputFingerprint: buildOutputFingerprint(),
    });
    const output = resolve(verify, "..");
    for (const evidence of report.setup.evidence) assertRetainedNativeCompletionEvidence(output, evidence);
    for (const gate of nativeCompletionGates(source.variant)) {
      const retained = report.gates.find(row => row.id === gate.id);
      const grade = gradeNativeCompletionGate(gate, JSON.parse(assertRetainedNativeCompletionEvidence(output, retained.evidence)), 0);
      if (!grade.passed) throw new Error(`Missing or failed retained native prerequisite assertions: ${gate.id}`);
    }
    for (const id of NATIVE_COMPLETION_COMMAND_GATE_IDS) {
      const retained = report.gates.find(row => row.id === id), text = assertRetainedNativeCompletionEvidence(output, retained.evidence);
      if (id === "NC-node" && (!/# fail 0\b/.test(text) || !/# tests [1-9]\d*\b/.test(text)))
        throw new Error("Missing passing native admission calibrations.");
      if (id === "NC-discovery" && !gradeNativeCompletionDiscovery(text.split("\n\n")[0], 0).passed)
        throw new Error("Native completion six-cell discovery changed.");
      if (id === "NC-manifest" && manifestCommands(env).some(run => run.status !== 0))
        throw new Error("Generated native capability manifests are stale.");
    }
    console.log(JSON.stringify(report)); return report;
  }
  const output = resolve(args.find(arg => arg.startsWith("--output-dir="))?.slice("--output-dir=".length) ??
    join(root, "tests/runner-e2e/results", `native-completion-preflight-${new Date().toISOString().replaceAll(":", "-")}`));
  mkdirSync(output, { recursive: true });
  const report = { schema: NATIVE_COMPLETION_PREFLIGHT_SCHEMA, sourceSha: source.sha, sourceFingerprint: source.fingerprint,
    fixtureFingerprint: source.fixtureFingerprint, manifestFingerprint: source.manifestFingerprint,
    variant: source.variant, baseSha: source.baseSha, archiveSha: source.archiveSha,
    sourceErrors: source.sourceErrors, immutable: source.immutable, layering: source.layering,
    measuredAt: new Date().toISOString(), providerCalls: 0, live: "not_run", expectedCells: 6, expectedTurns: 6, maximumAttemptsPerCell: 1,
    setup: { passed: false, sdkExitCode: null, runnerTypeScriptExitCode: null, evidence: [] }, gates: [], passed: false };
  if (!source.sha || source.sourceErrors.length || !source.layering || !source.immutable) {
    writeFileSync(join(output, "preflight.json"), JSON.stringify(report, null, 2) + "\n");
    console.error("Native completion source admission failed; commit the exact native-only source and fixtures before qualification.");
    process.exitCode = 1; return report;
  }
  const sdk = runCommand(process.execPath, [join(root, "scripts/ensure-plugin-build-deps.mjs")], env, 5 * 60_000);
  report.setup.sdkExitCode = sdk.status; report.setup.evidence.push(capture(output, "setup-sdk", sdk));
  const runner = sdk.status === 0 ? runCommand("pnpm", ["--filter", "@paperclipai/paperclip-runner", "build:typescript"], env) : null;
  report.setup.runnerTypeScriptExitCode = runner?.status ?? null;
  report.setup.evidence.push(capture(output, "setup-runner-typescript", runner));
  report.setup.passed = sdk.status === 0 && runner?.status === 0;
  if (report.setup.passed) {
    report.setup.buildOutputFingerprint = buildOutputFingerprint();
    for (const gate of nativeCompletionGates(source.variant)) {
      console.log(`Checking ${gate.id}: ${gate.name}`);
      const file = `${gate.id}.json`, run = runCommand(process.execPath, [join(root, "node_modules/vitest/vitest.mjs"), "run", ...gate.files,
        ...(gate.config ? ["--config", gate.config] : []), ...(gate.testPattern ? ["--testNamePattern", gate.testPattern] : []),
        "--reporter=default", "--reporter=json", `--outputFile.json=${join(output, file)}`], env, 10 * 60_000, resolve(root, gate.cwd));
      capture(output, gate.id, run);
      let result; try { result = JSON.parse(readFileSync(join(output, file), "utf8")); } catch { /* Missing discovery fails closed. */ }
      report.gates.push({ ...gradeNativeCompletionGate(gate, result, run.status),
        evidence: existsSync(join(output, file)) ? { file, sha256: nativeSourceSha256(readFileSync(join(output, file))) } : null });
    }
    const commands = [
      { id: "NC-node", command: process.execPath, args: ["--test", "--test-reporter=tap", "tests/runner-e2e/native-completion-checks.test.mjs", "tests/runner-e2e/native-completion-source-contract.test.mjs"] },
      { id: "NC-typecheck", command: process.execPath, args: ["node_modules/typescript/bin/tsc", "-p", "tests/runner-e2e/tsconfig.json"] },
      { id: "NC-discovery", command: process.execPath, args: ["--import", "./server/node_modules/tsx/dist/loader.mjs", "tests/runner-e2e/launch.ts", "--list", "--suite", "native-completion"] },
    ];
    for (const command of commands) {
      console.log(`Checking ${command.id}`);
      const run = runCommand(command.command, command.args, env);
      report.gates.push({ id: command.id, passed: run.status === 0 &&
        (command.id !== "NC-discovery" || gradeNativeCompletionDiscovery(run.stdout, run.status).passed) &&
        (command.id !== "NC-node" || /# fail 0\b/.test(run.stdout) && /# tests [1-9]\d*\b/.test(run.stdout)),
        exitCode: run.status, evidence: capture(output, command.id, run) });
    }
    const manifest = manifestCommands(env), combined = { stdout: manifest.map(run => run.stdout ?? "").join("\n"), stderr: manifest.map(run => run.stderr ?? "").join("\n") };
    report.gates.push({ id: "NC-manifest", passed: manifest.every(run => run.status === 0),
      exitCode: manifest.find(run => run.status !== 0)?.status ?? 0, evidence: capture(output, "NC-manifest", combined) });
    const after = currentSource();
    report.passed = report.gates.every(gate => gate.passed) && after.immutable && after.layering &&
      after.sha === source.sha && after.fingerprint === source.fingerprint && after.sourceErrors.length === 0 &&
      buildOutputFingerprint() === report.setup.buildOutputFingerprint;
  }
  writeFileSync(join(output, "preflight.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Native completion prerequisite evidence: ${join(output, "preflight.json")}`);
  if (!report.passed) process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
