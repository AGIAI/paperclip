import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readNativeJournalProjection,
  scanNativeStateFile,
  NATIVE_JOURNAL_PROJECTION_BUDGET,
} from "./native-journal-projection.js";
import { runnerdStateProvesIncompleteBootstrap } from "./native-session-executor.js";
const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture(raw: string) {
  const root = mkdtempSync(join(tmpdir(), "journal-projection-"));
  roots.push(root);
  mkdirSync(join(root, "control-plane"));
  const path = join(root, "control-plane/control-plane-state.json");
  writeFileSync(path, raw);
  return { root, path };
}
const event = (type: string, payload: unknown) => ({
  eventType: type,
  sourceSeq: 1,
  sourceEventId: "event-1",
  priority: 1,
  deliveryCount: 1,
  logicalEffectCount: 1,
  envelope: {
    runId: "run-1",
    normalizedSessionId: "session-1",
    payload: { eventType: type, runId: "run-1", payload },
  },
});
describe("bounded native journal proof projection", () => {
  it("does not materialize large tool history during a real controller admission read", () => {
    const { root } = fixture(
      JSON.stringify({
        schema: "paperclip.runner.durable.control-plane-state.v1",
        identity: { runId: "run-1" },
        connectionCount: 0,
        commands: [],
        committedEvents: [
          event("item.completed", { text: "x".repeat(24 * 1024 * 1024) }),
        ],
      }),
    );
    const parse = JSON.parse;
    const sizes: number[] = [];
    vi.spyOn(JSON, "parse").mockImplementation((text, reviver) => {
      sizes.push(text.length);
      return parse(text, reviver);
    });
    expect(runnerdStateProvesIncompleteBootstrap(root)).toBe(false);
    expect(Math.max(...sizes)).toBeLessThan(NATIVE_JOURNAL_PROJECTION_BUDGET);
  });
  it("hashes omitted bytes while retaining semantic and process proof", () => {
    const semantic = {
      semantic_tool: {
        operationId: "paperclip_finish",
        input: { summary: "exact" },
      },
    };
    const state = {
      schema: "schema",
      identity: { runId: "exact" },
      commands: [
        {
          type: "run.attach",
          payload: { nested: { prompt: "must retain" } },
          result: { status: "completed" },
        },
        {
          type: "turn.start",
          payload: { prompt: "discard" },
          result: { result: { providerTurnId: "turn" } },
        },
      ],
      committedEvents: [
        event("item.completed", {
          text: "x".repeat(3 * 1024 * 1024),
          processId: 42,
        }),
        event("semantic_tool.input", semantic),
      ],
    };
    const raw = JSON.stringify(state),
      { path } = fixture(raw),
      proof = readNativeJournalProjection(path);
    expect(proof.sha256).toBe(createHash("sha256").update(raw).digest("hex"));
    expect(proof.retainedBudgetBytes).toBeLessThan(32 * 1024);
    expect(proof.value).toMatchObject({
      commands: [
        {
          payload: state.commands[0]!.payload,
          result: state.commands[0]!.result,
        },
        { payload: {}, result: { result: { providerTurnId: "turn" } } },
      ],
      committedEvents: [
        { envelope: { payload: { payload: { processId: 42 } } } },
        { envelope: { payload: { payload: semantic } } },
      ],
    });
    expect(JSON.stringify(proof.value)).not.toContain('"text"');
  });
  it("preserves duplicate-key last-wins semantics and original malformed types", () => {
    const { path } = fixture(
      '{"schema":"old","schema":"new","identity":{"runId":"wrong","runId":"right","__proto__":{"polluted":true}},"commands":[{"type":"run.attach","payload":null,"result":[]},{"type":"turn.start","payload":"bad","result":false}],"committedEvents":[{"envelope":null}]}',
    );
    const proof = readNativeJournalProjection(path).value;
    expect(proof).toMatchObject({
      schema: "new",
      identity: { runId: "right" },
      commands: [
        { payload: null, result: [] },
        { payload: "bad", result: false },
      ],
      committedEvents: [{ envelope: null }],
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it.each([
    '{"identity":{},"ignored":"bad\\q"}',
    '{"identity":{},"ignored":[1,]}',
    '{"identity":{},"ignored":01}',
    '{"identity":{},"ignored":"unterminated}',
    '{"identity":{}} trailing',
    '{"identity":{},"ignored":{"x":1,}}',
  ])("rejects malformed JSON even in discarded bytes: %s", (raw) => {
    const { path } = fixture(raw);
    expect(() => readNativeJournalProjection(path, "identity")).toThrow();
  });
  it("rejects excessive essential evidence before parsing a large token", () => {
    const { path } = fixture(
      JSON.stringify({
        schema: "s",
        identity: { runId: "x".repeat(4 * 1024 * 1024) },
      }),
    );
    expect(() => readNativeJournalProjection(path)).toThrow(
      "native_journal_projection_budget_exceeded",
    );
  });
  it("bounds complete semantic evidence without silently dropping it", () => {
    const { path } = fixture(
      JSON.stringify({
        schema: "s",
        commands: [
          {
            type: "semantic_tool.result",
            payload: { input: "x".repeat(4 * 1024 * 1024) },
            result: null,
          },
        ],
      }),
    );
    expect(() => readNativeJournalProjection(path)).toThrow(
      "native_journal_projection_budget_exceeded",
    );
  });
  it("keeps the turn identity without materializing unrelated turn result text", () => {
    const { path } = fixture(
      JSON.stringify({
        commands: [
          {
            type: "turn.start",
            payload: {},
            result: {
              result: {
                providerTurnId: "turn-1",
                output: "x".repeat(12 * 1024 * 1024),
              },
            },
          },
        ],
      }),
    );
    const proof = readNativeJournalProjection(path);
    expect(proof.value).toMatchObject({
      commands: [{ result: { result: { providerTurnId: "turn-1" } } }],
    });
    expect(proof.retainedBudgetBytes).toBeLessThan(4096);
  });
  it("rejects excessive nesting even in discarded history", () => {
    const { path } = fixture(
      '{"ignored":' + "[".repeat(130) + "0" + "]".repeat(130) + "}",
    );
    expect(() => readNativeJournalProjection(path, "identity")).toThrow(
      "native_journal_projection_budget_exceeded",
    );
  });
  it("rejects symlinks and detects file changes during incremental scans", () => {
    const { path, root } = fixture('{"identity":{}}');
    const link = join(root, "link");
    symlinkSync(path, link);
    expect(() => readNativeJournalProjection(link)).toThrow();
    expect(() =>
      scanNativeStateFile(path, 1024, () =>
        writeFileSync(path, "changed and larger"),
      ),
    ).toThrow("native_state_file_changed");
  });
  it("streams byte-identical base64 chunks, including arbitrary tails", () => {
    for (const size of [0, 1, 2, 3, 49151, 49152, 49153, 100000]) {
      const { path } = fixture("x".repeat(size));
      let encoded = "";
      const proof = scanNativeStateFile(
        path,
        200000,
        (chunk) => (encoded += chunk.toString("base64")),
      );
      expect(encoded).toBe(readFileSync(path).toString("base64"));
      expect(proof.byteSize).toBe(size);
    }
  });
});
