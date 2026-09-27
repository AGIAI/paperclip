import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
// The fixture reads bounded private evidence independently of production admission.
const MAX_JOURNAL_EVIDENCE_BYTES = 192 * 1024 * 1024;

/** Read-only size oracle; retained journal contents never enter public evidence. */
export async function largeJournalEvidence(input: {
  stateRoot: string;
  runId: string;
  minimumBytes: number;
}): Promise<{ journalBytes: number; minimumBytes: number }> {
  const matches: number[] = [];
  for (const entry of await readdir(input.stateRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
    const filename = path.join(input.stateRoot, entry.name, "control-plane", "control-plane-state.json");
    const metadata = await lstat(filename).catch(() => null);
    if (!metadata?.isFile() || metadata.size > MAX_JOURNAL_EVIDENCE_BYTES) continue;
    const state = JSON.parse(await readFile(filename, "utf8")) as {
      schema?: string;
      identity?: { runId?: string };
    };
    if (state.schema === "paperclip.runner.durable.control-plane-state.v1" && state.identity?.runId === input.runId) {
      matches.push(metadata.size);
    }
  }
  if (matches.length !== 1 || matches[0]! <= input.minimumBytes) {
    throw new Error(`Large-journal boundary not reached: expected one matching journal above ${input.minimumBytes} bytes; observed ${JSON.stringify(matches)}`);
  }
  return { journalBytes: matches[0]!, minimumBytes: input.minimumBytes };
}
