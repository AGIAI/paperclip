import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { largeJournalEvidence } from "./journal-evidence.js";

describe("large journal boundary evidence", () => {
  it("requires one correctly owned journal over the boundary and returns only sizes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "journal-evidence-"));
    const directory = path.join(root, "a".repeat(64), "control-plane");
    await mkdir(directory, { recursive: true });
    const filename = path.join(directory, "control-plane-state.json");
    const state = { schema: "paperclip.runner.durable.control-plane-state.v1", identity: { runId: "expected-run" }, commands: [] };
    try {
      await writeFile(filename, JSON.stringify(state));
      await expect(largeJournalEvidence({ stateRoot: root, runId: "expected-run", minimumBytes: 1024 })).rejects.toThrow("boundary not reached");
      await writeFile(filename, JSON.stringify({ ...state, commands: [{ payload: "x".repeat(2048) }] }));
      const evidence = await largeJournalEvidence({ stateRoot: root, runId: "expected-run", minimumBytes: 1024 });
      expect(Object.keys(evidence)).toEqual(["journalBytes", "minimumBytes"]);
      expect(evidence.journalBytes).toBeGreaterThan(2048);
      await expect(largeJournalEvidence({ stateRoot: root, runId: "another-run", minimumBytes: 1024 })).rejects.toThrow("boundary not reached");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
