// Deterministic prerequisite for the stock-harness Product E2E suite. No model
// calls or credentials. Reuse the existing protocol assertions, not model
// self-reports about what its system instructions contain.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
export const stockHarnessGates = [
  { id: "SH-1", name: "Native Codex additive instructions", cwd: "packages/paperclip-runner", files: [
    "src/drivers/codex/codex-app-server-driver.test.ts",
    "src/drivers/codex/codex-app-server-driver.lifecycle.test.ts",
    "src/live/runnerd-codex-transport.test.ts",
    "src/live/live-session.test.ts",
    "src/cli/eval-provider-runtime.test.ts",
  ], testPattern: "adds Paperclip developer instructions|preserves stock Codex instructions|captures exact provider frames and correlates|direct eval provider runtime|exposes native completion consistently on fresh and resumed sessions|passes caller-supplied native system instructions",
  required: ["adds Paperclip developer instructions", "preserves stock Codex instructions on task recovery",
    "preserves stock Codex instructions on prepared recovery", "preserves stock Codex instructions on direct recovery",
    "captures exact provider frames and correlates", "exposes native completion consistently on fresh and resumed sessions",
    "passes caller-supplied native system instructions"] },
  { id: "SH-2", name: "Production-default hire bundle", cwd: ".", files: [
    "server/src/__tests__/agent-skills-routes.test.ts",
    "server/src/services/onboarding-first-task-assets.test.ts",
  ], required: ["materializes minimal default instructions for non-CEO agents with no prompt template"] },
  { id: "SH-3", name: "Shared legacy startup and continuation", cwd: ".", files: [
    "packages/adapter-utils/src/server-utils.test.ts",
    "packages/adapter-utils/src/prompt-sections.test.ts",
    "packages/adapter-utils/src/acpx-engine/execute.test.ts",
    "packages/adapters/pi-local/src/server/execute.remote.test.ts",
    "packages/adapters/opencode-local/src/server/execute.test.ts",
    "packages/adapters/cursor-cloud/src/server/execute.test.ts",
    "server/src/__tests__/codex-local-execute.test.ts",
  ], required: ["keeps task and chat defaults to identity and connection guidance",
    "does not restore generic procedures on resume or with the legacy opt-in"] },
  // Hermes is not in the root Vitest project list. Run its package config so
  // the requested file cannot silently disappear from discovery.
  { id: "SH-3-hermes", name: "Hermes shared-prompt delivery", cwd: "packages/adapters/hermes",
    files: ["src/server/prompt-rendering.test.ts"],
    required: ["renders standard assignment wake with task authority", "renders scoped planning wake authority"] },
];

export function gradeGate(gate, report, exitCode) {
  const assertions = (report?.testResults ?? []).flatMap(file => file.assertionResults ?? []);
  const requirements = (gate.required ?? []).map(name => ({ name,
    passed: assertions.some(assertion => assertion.fullName?.includes(name) && assertion.status === "passed") }));
  const files = gate.files.map(file => ({ file,
    passed: (report?.testResults ?? []).some(result => result.name?.endsWith(file) && result.status === "passed" &&
      result.assertionResults?.some(assertion => assertion.status === "passed") &&
      result.assertionResults.every(assertion => assertion.status === "passed" ||
        (gate.testPattern && assertion.status === "skipped" && !(gate.required ?? []).some(name => assertion.fullName?.includes(name))))) }));
  return { id: gate.id, name: gate.name, passed: exitCode === 0 && requirements.every(row => row.passed) && files.every(row => row.passed),
    exitCode, files, requirements, total: report?.numTotalTests ?? 0, passedTests: report?.numPassedTests ?? 0,
    failedTests: report?.numFailedTests ?? 0, pendingTests: report?.numPendingTests ?? 0 };
}

export function main(args = process.argv.slice(2)) {
  if (args.includes("--list")) {
    console.log(JSON.stringify({ gates: stockHarnessGates, rust: "runtime_instructions_are_additive_for_codex_on_start_and_resume", live: "not invoked" }, null, 2));
    return;
  }
  if (args.length) throw new Error("Use --list or no arguments; this command never runs paid providers.");
  const output = join(root, "tests/runner-e2e/results", `stock-harness-preflight-${new Date().toISOString().replaceAll(":", "-")}`);
  mkdirSync(output, { recursive: true });
  const results = [];
  for (const gate of stockHarnessGates) {
    console.log(`Checking ${gate.id}: ${gate.name}`);
    const file = join(output, `${gate.id}.json`);
    const run = spawnSync(process.execPath, [join(root, "node_modules/vitest/vitest.mjs"), "run", ...gate.files,
      ...(gate.testPattern ? ["--testNamePattern", gate.testPattern] : []),
      "--reporter=default", "--reporter=json", `--outputFile.json=${file}`],
    { cwd: resolve(root, gate.cwd), stdio: "inherit", timeout: 10 * 60_000 });
    let report;
    try { report = JSON.parse(readFileSync(file, "utf8")); } catch { /* missing evidence fails closed below */ }
    results.push(gradeGate(gate, report, run.status));
  }
  const rust = spawnSync("cargo", ["test", "--offline", "-p", "paperclip-runner-core", "--test", "codex_provider",
    "runtime_instructions_are_additive_for_codex_on_start_and_resume", "--", "--exact"],
  { cwd: join(root, "packages/paperclip-runner/runner"), encoding: "utf8", timeout: 10 * 60_000 });
  const rustOutput = `${rust.stdout ?? ""}\n${rust.stderr ?? ""}`;
  writeFileSync(join(output, "rust.txt"), rustOutput);
  results.push({ id: "SH-1-rust", passed: rust.status === 0 && /test runtime_instructions_are_additive_for_codex_on_start_and_resume \.\.\. ok/.test(rustOutput), exitCode: rust.status });
  const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  const hash = createHash("sha256");
  const sources = new Set([
    ...stockHarnessGates.flatMap(gate => gate.files.map(file => join(gate.cwd, file))),
    "tests/runner-e2e/stock-harness.ts", "tests/runner-e2e/stock-harness-checks.mjs", "tests/runner-e2e/catalog.ts",
    "packages/adapter-utils/src/server-utils.ts", "server/src/onboarding-assets/default/AGENTS.md", "server/src/routes/agents.ts",
    "packages/paperclip-runner/src/drivers/codex/codex-app-server-driver-impl.ts",
    "packages/paperclip-runner/src/live/runnerd-codex-transport.ts",
    "packages/paperclip-runner/src/live/live-session.ts",
    "packages/paperclip-runner/runner/crates/runner-core/src/codex_provider.rs",
    "packages/paperclip-runner/runner/crates/runner-core/tests/codex_provider.rs",
  ]);
  const sourceErrors = [];
  for (const source of [...sources].sort()) {
    hash.update(source);
    try { hash.update(readFileSync(join(root, source))); }
    catch { sourceErrors.push(source); }
  }
  const report = { schema: "paperclip.stock-harness-preflight.v1", sourceSha: git.stdout?.trim() || null,
    sourceFingerprint: hash.digest("hex"), measuredAt: new Date().toISOString(), providerCalls: 0,
    live: "not_run", passed: sourceErrors.length === 0 && results.every(row => row.passed), sourceErrors, gates: results };
  writeFileSync(join(output, "preflight.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Stock harness prerequisite evidence: ${output}/preflight.json`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
