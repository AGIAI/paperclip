import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { DURABLE_PRP_CONTROL_PLANE_MAX_STATE_BYTES } from "../../vendor/paperclip-runner/index.js";

// These are read-only proof projections, never replacement journal contents.
// The raw writer limit still applies, including to bytes omitted from the proof.
export const NATIVE_JOURNAL_PROJECTION_BUDGET = 8 * 1024 * 1024;
const CHUNK = 48 * 1024; // divisible by three for the existing base64 fingerprint
const OMIT = Symbol("omitted");
const REF = Symbol("raw JSON span");
type Span = { [REF]: true; start: number; end: number };
type Mode = "keep" | "skip" | "span";
type Select = (path: string[]) => Mode;
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const isSpan = (v: unknown): v is Span => object(v) && REF in v;
const full: Select = () => "keep";
const stateFields = new Set([
  "schema",
  "identity",
  "tickets",
  "leases",
  "commands",
  "committedEvents",
  "ackedSourceSeq",
  "connectionCount",
  "commandDeliveryCounts",
  "runAttachTemplate",
  "warmTransition",
  "completedWarmTransition",
  "replayDeliveries",
  "duplicateCommandResults",
  "freshBootstraps",
  "malformedFrames",
]);
const essentialEvents = new Set([
  "session.started",
  "session.resumed",
  "session.reconciled",
  "turn.accepted",
  "semantic_tool.input",
  "semantic_tool.result",
  "mcp_app.tool_input",
  "harness.diagnostic",
]);

/** One synchronous scanner can execute at a time. All retained nodes/strings,
 * including later materialized spans, share the same conservative byte budget. */
class Budget {
  used = 0;
  charge(bytes: number) {
    this.used += bytes;
    if (this.used > NATIVE_JOURNAL_PROJECTION_BUDGET)
      throw new Error("native_journal_projection_budget_exceeded");
  }
}

class JsonScanner {
  private buffer = Buffer.allocUnsafe(CHUNK);
  private begin = -1;
  private length = 0;
  offset: number;
  constructor(
    private fd: number,
    private end: number,
    private budget: Budget,
    start = 0,
    private digest?: ReturnType<typeof createHash>,
  ) {
    this.offset = start;
  }
  private peek(): number {
    if (this.offset >= this.end) return -1;
    if (this.offset < this.begin || this.offset >= this.begin + this.length) {
      this.begin = this.offset;
      this.length = readSync(
        this.fd,
        this.buffer,
        0,
        Math.min(CHUNK, this.end - this.offset),
        this.offset,
      );
      if (!this.length) throw new Error("native_state_file_changed");
      this.digest?.update(this.buffer.subarray(0, this.length));
    }
    return this.buffer[this.offset - this.begin]!;
  }
  private space() {
    while ([32, 9, 10, 13].includes(this.peek())) this.offset++;
  }
  private expect(byte: number) {
    if (this.peek() !== byte) throw new Error("native_journal_invalid_json");
    this.offset++;
  }
  private token(start: number, end: number, key = false): unknown {
    const size = end - start;
    if (key && size > 4096)
      throw new Error("native_journal_projection_budget_exceeded");
    this.budget.charge(size * 3 + 64);
    const bytes = Buffer.allocUnsafe(size);
    let count = 0;
    while (count < size) {
      const read = readSync(this.fd, bytes, count, size - count, start + count);
      if (!read) throw new Error("native_state_file_changed");
      count += read;
    }
    return JSON.parse(bytes.toString("utf8"));
  }
  private string(capture: boolean, key = false): unknown {
    const start = this.offset;
    this.expect(34);
    for (;;) {
      const c = this.peek();
      this.offset++;
      if (c === 34) break;
      if (c < 32) throw new Error("native_journal_invalid_json");
      if (c === 92) {
        const escape = this.peek();
        this.offset++;
        if (escape === 117) {
          for (let n = 0; n < 4; n++) {
            const hex = this.peek();
            if (
              !(
                (hex >= 48 && hex <= 57) ||
                (hex >= 65 && hex <= 70) ||
                (hex >= 97 && hex <= 102)
              )
            )
              throw new Error("native_journal_invalid_json");
            this.offset++;
          }
        } else if (![34, 92, 47, 98, 102, 110, 114, 116].includes(escape))
          throw new Error("native_journal_invalid_json");
      }
    }
    return capture ? this.token(start, this.offset, key) : OMIT;
  }
  value(path: string[], select: Select, depth = 0, forced?: Mode): unknown {
    if (depth > 128)
      throw new Error("native_journal_projection_budget_exceeded");
    this.space();
    const start = this.offset,
      mode = forced ?? select(path),
      c = this.peek();
    if (mode === "span") {
      this.value(path, select, depth, "skip");
      this.budget.charge(96);
      return { [REF]: true, start, end: this.offset } satisfies Span;
    }
    const keep = mode === "keep";
    if (keep) this.budget.charge(64);
    if (c === 34) return this.string(keep);
    if (c === 123 || c === 91) {
      const array = c === 91;
      this.offset++;
      this.space();
      const result: unknown[] | Record<string, unknown> = array ? [] : {};
      const close = array ? 93 : 125;
      if (this.peek() === close) {
        this.offset++;
        return keep ? result : OMIT;
      }
      let index = 0;
      for (;;) {
        this.space();
        let key: string;
        if (array) key = String(index++);
        else {
          const parsed = this.string(keep, true);
          key = keep ? (parsed as string) : "";
          this.space();
          this.expect(58);
        }
        const child = this.value(
          keep ? [...path, key] : path,
          select,
          depth + 1,
          keep ? undefined : "skip",
        );
        if (keep && child !== OMIT)
          Object.defineProperty(result, key, {
            value: child,
            configurable: true,
            enumerable: true,
            writable: true,
          });
        this.space();
        if (this.peek() === close) {
          this.offset++;
          return keep ? result : OMIT;
        }
        this.expect(44);
      }
    }
    for (const [first, literal, value] of [
      [116, "true", true],
      [102, "false", false],
      [110, "null", null],
    ] as const) {
      if (c === first) {
        for (const ch of literal) this.expect(ch.charCodeAt(0));
        return keep ? value : OMIT;
      }
    }
    let number = "";
    while (
      this.peek() >= 0 &&
      ![32, 9, 10, 13, 44, 93, 125].includes(this.peek())
    ) {
      if (number.length >= 128) throw new Error("native_journal_invalid_json");
      number += String.fromCharCode(this.peek());
      this.offset++;
    }
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(number))
      throw new Error("native_journal_invalid_json");
    return keep ? JSON.parse(number) : OMIT;
  }
  parse(select: Select): unknown {
    const result = this.value([], select);
    this.space();
    if (this.offset !== this.end)
      throw new Error("native_journal_invalid_json");
    return result;
  }
}

function unchanged(
  before: ReturnType<typeof fstatSync>,
  after: ReturnType<typeof fstatSync>,
) {
  if (
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    before.ino !== after.ino
  )
    throw new Error("native_state_file_changed");
}

export function readNativeJournalProjection(
  path: string,
  purpose: "identity" | "evidence" = "evidence",
) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (
      !before.isFile() ||
      before.size > DURABLE_PRP_CONTROL_PLANE_MAX_STATE_BYTES
    )
      throw new Error("native_journal_too_large");
    const budget = new Budget(),
      digest = createHash("sha256");
    const select: Select = (parts) => {
      if (
        parts.length === 1 &&
        (purpose === "identity"
          ? !["schema", "identity"].includes(parts[0]!)
          : !stateFields.has(parts[0]!))
      )
        return "skip";
      if (
        parts[0] === "commands" &&
        parts.length === 3 &&
        ["payload", "result"].includes(parts[2]!)
      )
        return "span";
      if (
        parts[0] === "committedEvents" &&
        parts.length === 5 &&
        parts.slice(2).join("/") === "envelope/payload/payload"
      )
        return "span";
      return "keep";
    };
    const value = new JsonScanner(fd, before.size, budget, 0, digest).parse(
      select,
    );
    const materialize = (v: unknown, selection: Select): unknown =>
      isSpan(v)
        ? new JsonScanner(fd, v.end, budget, v.start).parse(selection)
        : v;
    // A projection preserves original primitive/array/object types. It must not
    // turn malformed authority into a valid empty object.
    const fields =
      (names: string[]): Select =>
      (parts) =>
        parts.length === 1 && !names.includes(parts[0]!) ? "skip" : "keep";
    if (object(value)) {
      if (Array.isArray(value.commands))
        for (const command of value.commands) {
          if (!object(command)) continue;
          const complete =
            command.type === "run.attach" ||
            command.type === "semantic_tool.result";
          if ("payload" in command)
            command.payload = materialize(
              command.payload,
              complete
                ? full
                : fields(
                    command.type === "run.prepare"
                      ? ["completionContract"]
                      : [],
                  ),
            );
          if ("result" in command)
            command.result = materialize(
              command.result,
              complete
                ? full
                : command.type === "turn.start"
                  ? (parts) =>
                      (parts.length === 1 && parts[0] !== "result") ||
                      (parts.length === 2 && parts[1] !== "providerTurnId")
                        ? "skip"
                        : "keep"
                  : fields([]),
            );
        }
      if (Array.isArray(value.committedEvents))
        for (const entry of value.committedEvents) {
          if (
            !object(entry) ||
            !object(entry.envelope) ||
            !object(entry.envelope.payload)
          )
            continue;
          const event = entry.envelope.payload;
          if ("payload" in event)
            event.payload = materialize(
              event.payload,
              essentialEvents.has(String(event.eventType))
                ? full
                : fields(["processId"]),
            );
        }
    }
    unchanged(before, fstatSync(fd));
    return {
      value,
      sha256: digest.digest("hex"),
      byteSize: before.size,
      retainedBudgetBytes: budget.used,
    };
  } finally {
    closeSync(fd);
  }
}

/** Hash the complete source, including discarded history, without retaining it. */
export function scanNativeStateFile(
  path: string,
  maximum: number,
  consume?: (chunk: Buffer) => void,
) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > maximum)
      throw new Error("native_state_file_too_large");
    const buffer = Buffer.allocUnsafe(CHUNK),
      digest = createHash("sha256");
    let offset = 0;
    while (offset < before.size) {
      const length = Math.min(CHUNK, before.size - offset);
      let count = 0;
      while (count < length) {
        const read = readSync(
          fd,
          buffer,
          count,
          length - count,
          offset + count,
        );
        if (!read) throw new Error("native_state_file_changed");
        count += read;
      }
      const chunk = buffer.subarray(0, count);
      digest.update(chunk);
      consume?.(chunk);
      offset += count;
    }
    unchanged(before, fstatSync(fd));
    return { sha256: digest.digest("hex"), byteSize: before.size };
  } finally {
    closeSync(fd);
  }
}
