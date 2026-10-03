import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  nativeCompletionGates, gradeNativeCompletionGate, gradeNativeCompletionDiscovery,
  assertNativeCompletionPreflightReceipt, assertRetainedNativeCompletionEvidence, nativeCompletionPrerequisiteEnvironment,
  NATIVE_COMPLETION_PREFLIGHT_SCHEMA, NATIVE_COMPLETION_CELL_IDS, NATIVE_COMPLETION_COMMAND_GATE_IDS,
} from "./native-completion-checks.mjs";
import { nativeSourceSha256, NATIVE_COMPLETION_SOURCE_CONTRACT } from "./native-completion-source-contract.mjs";

const gate = { id: "NC-test", name: "Boundary", files: ["boundary.test.ts"], required: ["native assertion"] };
const report = () => ({ testResults: [{ name: "/repo/boundary.test.ts", status: "passed", assertionResults: [
  { fullName: "Boundary native assertion", status: "passed" }] }], numTotalTests: 1, numPassedTests: 1 });
test("native completion prerequisite gates exclude reduced manual and shared legacy assertions", () => {
  for (const variant of ["candidate", "historical"]) {
    const gates = nativeCompletionGates(variant);
    assert.deepEqual(gates.map(gate => gate.id), ["NC-schemas", "NC-tools", "NC-resume", "NC-eval"]);
    assert.ok(gates.every(gate => gate.files.length && gate.required.length));
    assert.ok(!gates.flatMap(gate => gate.files).some(file => /agent-skills-routes|onboarding-first-task-assets|server-utils\.test|prompt-sections/.test(file)));
  }
  assert.ok(nativeCompletionGates("candidate")[1].required.some(name => name.includes("serialized native codex")));
  assert.ok(!nativeCompletionGates("historical")[1].required.some(name => name.includes("serialized native codex")));
  assert.ok(!nativeCompletionGates("historical")[2].required.includes("native completion tool guidance"));
  assert.throws(() => nativeCompletionGates("unknown"));
});
test("native completion prerequisite admits an executed passing boundary", () => assert.equal(gradeNativeCompletionGate(gate, report(), 0).passed, true));
for (const status of ["pending", "skipped", "failed", "todo"]) test(`native completion prerequisite rejects a ${status} required assertion`, () => {
  const observation = report(); observation.testResults[0].assertionResults[0].status = status;
  assert.equal(gradeNativeCompletionGate(gate, observation, 0).passed, false);
});
test("native completion prerequisite rejects missing discovery, unrelated assertions and failed commands", () => {
  assert.equal(gradeNativeCompletionGate(gate, undefined, 0).passed, false);
  const different = report(); different.testResults[0].assertionResults[0].fullName = "Other";
  assert.equal(gradeNativeCompletionGate(gate, different, 0).passed, false);
  assert.equal(gradeNativeCompletionGate(gate, report(), 1).passed, false);
  assert.equal(gradeNativeCompletionGate({ ...gate, files: [...gate.files, "undiscovered.test.ts"] }, report(), 0).passed, false);
});
test("native completion prerequisite allows filtering unrelated assertions but never the required assertion", () => {
  const observation = report(); observation.testResults[0].assertionResults.push({ fullName: "Unrelated", status: "skipped" });
  assert.equal(gradeNativeCompletionGate({ ...gate, testPattern: "native assertion" }, observation, 0).passed, true);
  assert.equal(gradeNativeCompletionGate(gate, observation, 0).passed, false);
  observation.testResults[0].assertionResults[0].status = "skipped";
  assert.equal(gradeNativeCompletionGate({ ...gate, testPattern: "native assertion" }, observation, 0).passed, false);
});
const discovery = () => ["ID\tSUITE\tGENERATION\tPROVIDER\tMODEL\tCREDENTIALS", ...NATIVE_COMPLETION_CELL_IDS.map(id =>
  `${id}\tnative-completion\tnative\tprovider\tmodel\tAPI_KEY`)].join("\n");
test("native completion prerequisite discovers exactly six native single-turn cells", () => {
  assert.deepEqual(gradeNativeCompletionDiscovery(discovery(), 0), { passed: true, executionIds: NATIVE_COMPLETION_CELL_IDS,
    expectedCells: 6, expectedTurns: 6, maximumAttemptsPerCell: 1 });
});
for (const kind of ["missing", "duplicate", "legacy", "extra", "failed", "missing-model", "wrong-task"]) test(`native completion prerequisite rejects ${kind} discovery`, () => {
  let output = discovery();
  if (kind === "missing") output = output.split("\n").slice(0, -1).join("\n");
  if (kind === "duplicate") output = output.replace(NATIVE_COMPLETION_CELL_IDS[1], NATIVE_COMPLETION_CELL_IDS[0]);
  if (kind === "legacy") output = output.replace("\tnative\t", "\tlegacy\t");
  if (kind === "extra") output += `\n${output.split("\n")[1]}`;
  if (kind === "missing-model") output = output.replace("\tmodel\t", "\t\t");
  if (kind === "wrong-task") output = output.replace("assigned-skill-explicit-invocation", "other-case");
  assert.equal(gradeNativeCompletionDiscovery(output, kind === "failed" ? 1 : 0).passed, false);
});
test("native completion prerequisite excludes future credentials and auth overrides from every child", () => {
  assert.deepEqual(nativeCompletionPrerequisiteEnvironment({ PATH: "/bin", HOME: "/fixture", CI: "true",
    OPENAI_API_KEY: "secret", ANTHROPIC_API_KEY: "secret", FUTURE_TOKEN: "secret", NODE_OPTIONS: "secret", GH_TOKEN: "secret" }),
  { PATH: "/bin", HOME: "/fixture", CI: "true" });
});
const current = variant => ({ sha: "a".repeat(40), fingerprint: "b".repeat(64), fixtureFingerprint: "c".repeat(64),
  manifestFingerprint: "d".repeat(64), buildOutputFingerprint: "e".repeat(64), variant, immutable: true, layering: true, sourceErrors: [] });
const receipt = variant => ({ schema: NATIVE_COMPLETION_PREFLIGHT_SCHEMA, passed: true, providerCalls: 0, live: "not_run",
  sourceSha: current(variant).sha, sourceFingerprint: current(variant).fingerprint, fixtureFingerprint: current(variant).fixtureFingerprint,
  manifestFingerprint: current(variant).manifestFingerprint, variant,
  baseSha: NATIVE_COMPLETION_SOURCE_CONTRACT.baseSha, archiveSha: NATIVE_COMPLETION_SOURCE_CONTRACT.archiveSha, immutable: true, layering: true, sourceErrors: [],
  expectedCells: 6, expectedTurns: 6, maximumAttemptsPerCell: 1,
  setup: { passed: true, sdkExitCode: 0, runnerTypeScriptExitCode: 0, buildOutputFingerprint: current(variant).buildOutputFingerprint,
    evidence: ["setup-sdk.txt", "setup-runner-typescript.txt"].map(file => ({ file, sha256: "f".repeat(64) })) },
  gates: [...nativeCompletionGates(variant).map(gate => gate.id), ...NATIVE_COMPLETION_COMMAND_GATE_IDS].map(id => ({ id, passed: true, exitCode: 0 })) });
for (const variant of ["candidate", "historical"]) test(`native completion prerequisite admits only the exact immutable ${variant} receipt`, () => {
  assert.equal(assertNativeCompletionPreflightReceipt(receipt(variant), current(variant)).passed, true);
});
const negatives = [
  ["old SHA", r => { r.sourceSha = "f".repeat(40); }], ["changed source", r => { r.sourceFingerprint = "f".repeat(64); }],
  ["changed fixtures", r => { r.fixtureFingerprint = "f".repeat(64); }], ["stale manifests", r => { r.manifestFingerprint = "f".repeat(64); }],
  ["wrong variant", r => { r.variant = "historical"; }], ["wrong base", r => { r.baseSha = "f".repeat(40); }],
  ["wrong archive", r => { r.archiveSha = "f".repeat(40); }], ["dirty source", r => { r.immutable = false; }],
  ["wrong master layering", r => { r.layering = false; }], ["source errors", r => { r.sourceErrors.push("missing.ts"); }],
  ["paid provider calls", r => { r.providerCalls = 1; }], ["paid live run", r => { r.live = "run"; }],
  ["missing gate", r => { r.gates.pop(); }], ["duplicate gate", r => { r.gates[1] = r.gates[0]; }],
  ["failed gate", r => { r.gates[0].passed = false; }], ["nonzero exit", r => { r.gates[0].exitCode = 1; }],
  ["failed SDK build", r => { r.setup.sdkExitCode = 1; }], ["missing Runner build", r => { delete r.setup.runnerTypeScriptExitCode; }],
  ["changed build output", r => { r.setup.buildOutputFingerprint = "f".repeat(64); }],
  ["extra cells", r => { r.expectedCells = 7; }], ["extra turns", r => { r.expectedTurns = 7; }],
  ["additional attempts", r => { r.maximumAttemptsPerCell = 2; }],
  ["missing setup evidence", r => { r.setup.evidence.pop(); }],
  ["duplicate setup evidence", r => { r.setup.evidence[1] = r.setup.evidence[0]; }],
];
for (const [name, mutate] of negatives) test(`native completion prerequisite rejects ${name} before providers`, () => {
  const r = receipt("candidate"); mutate(r);
  assert.throws(() => assertNativeCompletionPreflightReceipt(r, current("candidate")), /exact immutable source SHA, variant and fingerprint/);
});
test("native completion prerequisite rejects a current dirty source and unavailable digests", () => {
  assert.throws(() => assertNativeCompletionPreflightReceipt(receipt("candidate"), { ...current("candidate"), immutable: false }));
  assert.throws(() => assertNativeCompletionPreflightReceipt(receipt("candidate"), { ...current("candidate"), fingerprint: null }));
});

test("native completion prerequisite rejects changed or missing retained evidence and unsafe paths", () => {
  const output = mkdtempSync(join(tmpdir(), "native-completion-retained-"));
  try {
    const bytes = '{"passing":"native assertions"}', evidence = { file: "NC-tools.json", sha256: nativeSourceSha256(bytes) };
    writeFileSync(join(output, evidence.file), bytes);
    assert.equal(assertRetainedNativeCompletionEvidence(output, evidence), bytes);
    writeFileSync(join(output, evidence.file), "Changed retained assertions");
    assert.throws(() => assertRetainedNativeCompletionEvidence(output, evidence), /changed or is unavailable/);
    assert.throws(() => assertRetainedNativeCompletionEvidence(output, { file: "missing.json", sha256: evidence.sha256 }));
    assert.throws(() => assertRetainedNativeCompletionEvidence(output, { file: "../elsewhere.json", sha256: evidence.sha256 }));
    assert.throws(() => assertRetainedNativeCompletionEvidence(output, null));
  } finally { rmSync(output, { recursive: true, force: true }); }
});
