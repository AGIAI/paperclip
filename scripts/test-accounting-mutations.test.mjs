import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

for (const scenario of ["success", "baseline", "survives", "missing"]) {
  test(`mutation gate retains evidence: ${scenario}`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mutation-evidence-test-"));
    try {
      await mkdir(path.join(root, "scripts"));
      await mkdir(path.join(root, "node_modules/vitest"), { recursive: true });
      await copyFile(path.resolve("scripts/test-accounting-mutations.mjs"), path.join(root, "scripts/test-accounting-mutations.mjs"));
      await writeFile(path.join(root, "node_modules/vitest/vitest.mjs"), `
import { writeFileSync } from 'node:fs';
const name = process.env.PAPERCLIP_ACCOUNTING_MUTATION;
const scenario = process.env.MUTATION_EVIDENCE_TEST_SCENARIO;
const titles = { deduplication: 'deduplicates a retried receipt', company: 'isolates company reporting', projection: 'conserves agent projections', threshold: 'stops at the exact budget boundary' };
console.log(name ? 'ACCOUNTING_MUTATION_APPLIED ' + name : 'baseline diagnostics');
if (name && scenario === 'missing') process.exit(1);
const fail = name ? scenario !== 'survives' : scenario === 'baseline';
const assertionResults = Object.values(titles).map(title => ({ title, status: fail && (!name || title === titles[name]) ? 'failed' : 'passed' }));
writeFileSync(process.argv.find(arg => arg.startsWith('--outputFile=')).slice(13), JSON.stringify({ testResults: [{ assertionResults }] }));
process.exit(fail ? 1 : 0);
`);
      const result = spawnSync(process.execPath, ["scripts/test-accounting-mutations.mjs"], { cwd: root,
        env: { ...process.env, MUTATION_EVIDENCE_TEST_SCENARIO: scenario }, encoding: "utf8" });
      assert.equal(result.status, scenario === "success" ? 0 : 1, result.stderr);
      const report = JSON.parse(await readFile(path.join(root, "coverage/accounting/mutations.json"), "utf8"));
      assert.equal(report.evidence.at(-1).result, { success: "killed", baseline: "baseline_failed", survives: "survived_or_invalid", missing: "error" }[scenario]);
      const last = report.evidence.at(-1).mutation;
      assert.ok((await readFile(path.join(root, `coverage/accounting/mutations/${last}.log`), "utf8")).length);
      if (scenario !== "missing") assert.ok(JSON.parse(await readFile(path.join(root, `coverage/accounting/mutations/${last}.json`), "utf8")).testResults.length);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
