import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDefaultAgentInstructionsBundle } from "../../server/src/services/default-agent-instructions.js";
import { validateCatalog } from "../../packages/teams-catalog/src/catalog-builder.js";
import { hiringTemplateDefinitionDigest } from "./hiring-template-cases.js";
import { stockHarnessGates } from "./stock-harness-checks.mjs";

const root = new URL("../../", import.meta.url);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const context = JSON.parse(await readFile(new URL("./hiring-comparison-context.json", import.meta.url), "utf8"));
async function variant() {
  const loader = "server/src/services/default-agent-instructions.ts";
  const actual = hash(await readFile(new URL(loader, root)));
  const expected = context.productionSourceHashes[loader];
  expect([expected.candidate, expected.baseline]).toContain(actual);
  return actual === expected.candidate ? "candidate" : "baseline";
}
describe("frozen hiring comparison source admission", () => {
  it("validates the selected CEO files against this variant's loader", async () => {
    const current = await variant();
    const files = await loadDefaultAgentInstructionsBundle("ceo");
    expect(Object.keys(files)).toEqual(current === "candidate" ? ["AGENTS.md"] : ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"]);
    for (const [name, content] of Object.entries(files)) {
      expect(content).toBe(await readFile(new URL(`server/src/onboarding-assets/ceo/${name}`, root), "utf8"));
    }
    for (const path of context.restoredProductionFiles) {
      expect(hash(await readFile(new URL(path, root))), path).toBe(context.productionSourceHashes[path][current]);
    }
    expect(hiringTemplateDefinitionDigest).toBe(context.hiringFixtureDigest);
  });
  it("matches the canonical team catalog to this variant's production sources", async () => {
    const catalog = await validateCatalog(fileURLToPath(new URL("packages/teams-catalog/", root)));
    expect(catalog.errors).toEqual([]);
  });
  it("excludes exactly the four candidate-only CEO selection assertions and retains other boundaries", () => {
    const gate = stockHarnessGates.find(gate => gate.id === "SH-2");
    const filter = new RegExp(gate.testPattern);
    expect(context.excludedCandidateOnlyAssertions).toHaveLength(4);
    for (const name of context.excludedCandidateOnlyAssertions) expect(filter.test(`agent skill routes ${name}`)).toBe(false);
    for (const name of ["materializes minimal default instructions for non-CEO agents with no prompt template", "gives a CEO hire the core paperclip skills when none are requested", "omits the legacy operational skill from paperclip_runner CEO defaults", "materializes a managed AGENTS.md for directly created local agents"]) expect(filter.test(name)).toBe(true);
  });
});
