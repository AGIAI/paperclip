import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { agents, companies, createDb, heartbeatRuns } from "@paperclipai/db";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { cancellationIntentId, claimCancellationRequest, startupCancellationFence } from "../services/native-runtime/native-cancellation-request.js";

describe("atomic caller cancellation request ownership", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => { database = await startEmbeddedPostgresTestDatabase("caller-stop-"); db = createDb(database.connectionString); }, 90_000);
  afterAll(async () => { await database?.cleanup(); });
  async function fixture() {
    const companyId = randomUUID(), agentId = randomUUID(), runId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Stop claims", issuePrefix: randomUUID().slice(0, 8) });
    await db.insert(agents).values({ id: agentId, companyId, name: "Stop target" });
    await db.insert(heartbeatRuns).values({ id: runId, companyId, agentId, invocationSource: "on_demand", status: "running", runtimeMode: "native" });
    return { companyId, runId };
  }
  const defaultFence = (runId: string) => db.update(heartbeatRuns).set({ resultJson: sql`coalesce(${heartbeatRuns.resultJson}, '{}'::jsonb) || jsonb_build_object('startupCancellation', ${startupCancellationFence(new Date().toISOString())})` }).where(eq(heartbeatRuns.id, runId));
  it("allows exactly one of two concurrent identities and idempotent same-ID retries", async () => {
    const { companyId, runId } = await fixture(), a = randomUUID(), b = randomUUID();
    const results = await Promise.allSettled([claimCancellationRequest(db, runId, companyId, a, "board-user"), claimCancellationRequest(db, runId, companyId, b, "board-user")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const winner = results[0].status === "fulfilled" ? a : b;
    await expect(claimCancellationRequest(db, runId, companyId, winner, "other-board-user")).rejects.toMatchObject({ status: 409 });
    const copies = await Promise.all([claimCancellationRequest(db, runId, companyId, winner, "board-user"), claimCancellationRequest(db, runId, companyId, winner, "board-user")]);
    expect(copies[0].resultJson).toEqual(copies[1].resultJson);
    await expect(claimCancellationRequest(db, runId, randomUUID(), winner, "board-user")).rejects.toMatchObject({ status: 409 });
  });
  it("does not overwrite a caller claim when default Stop races after it", async () => {
    const { companyId, runId } = await fixture(), id = randomUUID();
    const claimed = await claimCancellationRequest(db, runId, companyId, id, "board-user");
    await Promise.all([defaultFence(runId), claimCancellationRequest(db, runId, companyId, id, "board-user")]);
    const [run] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, runId));
    expect(run.resultJson).toEqual(claimed.resultJson);
  });
  it("rejects a default Stop that won first, without replacing its marker", async () => {
    const { companyId, runId } = await fixture(); await defaultFence(runId);
    const [before] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, runId));
    await expect(claimCancellationRequest(db, runId, companyId, randomUUID(), "board-user")).rejects.toMatchObject({ status: 409 });
    const [after] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, runId));
    expect(after.resultJson).toEqual(before.resultJson);
  });
  it("accepts only the original acknowledged identity on a terminal run", async () => {
    const { companyId, runId } = await fixture(), id = randomUUID();
    const run = await claimCancellationRequest(db, runId, companyId, id, "board-user");
    await db.update(heartbeatRuns).set({ status: "cancelled", resultJson: { ...run.resultJson, nativeCancellation: { schema: "paperclip.native-cancellation.v1", intentId: cancellationIntentId(id), runId, companyId, scope: "run", dispatched: true, dispatchState: "acknowledged", intentAuditId: randomUUID(), acknowledgementAuditId: randomUUID() } } }).where(eq(heartbeatRuns.id, runId));
    await expect(claimCancellationRequest(db, runId, companyId, id, "board-user")).resolves.toMatchObject({ status: "cancelled" });
    await expect(claimCancellationRequest(db, runId, companyId, randomUUID(), "board-user")).rejects.toMatchObject({ status: 409 });
    await db.update(heartbeatRuns).set({ resultJson: { ...run.resultJson, nativeCancellation: { intentId: cancellationIntentId(id) } } }).where(eq(heartbeatRuns.id, runId));
    await expect(claimCancellationRequest(db, runId, companyId, id, "board-user")).rejects.toMatchObject({ status: 409 });
  });
});
