import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import request from "supertest";
import WebSocket from "ws";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agents, authUsers, companies, companyMemberships, createDb, issues, projectAccessMembers, projects, startEmbeddedPostgresTestDatabase } from "@paperclipai/db";
import { authorizationService, canActorReadIssuePrivacy, issueReadSqlCondition, type AuthorizationActor } from "../services/authorization.js";

// Review probes against unmodified PR 10633 head 605b5af. Assertions encode the
// approved privacy contract; failures are evidence, not implementation changes.
describe("private task production review", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => {
    process.env.PAPERCLIP_ISSUE_PRIVACY_MODE = "enforce";
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-private-review-");
    db = createDb(tempDb.connectionString);
  }, 60000);
  afterAll(async () => { await tempDb?.cleanup(); });

  async function fixture() {
    const [company] = await db.insert(companies).values({ name: randomUUID(), issuePrefix: `T${randomUUID().slice(0, 5)}` }).returning();
    const owner = randomUUID(), outsider = randomUUID();
    await db.insert(authUsers).values([owner, outsider].map(id => ({ id, name: id, email: `${id}@example.test`, createdAt: new Date(), updatedAt: new Date() })));
    await db.insert(companyMemberships).values([owner, outsider].map(principalId => ({ companyId: company.id, principalType: "user", principalId, status: "active", membershipRole: "operator" })));
    const [agent] = await db.insert(agents).values({ companyId: company.id, name: "Shared agent", role: "engineer", adapterType: "process", adapterConfig: {}, runtimeConfig: {}, permissions: {} }).returning();
    const actor = (userId: string): AuthorizationActor => ({ type: "board", userId, source: "session", companyIds: [company.id] });
    return { company, owner, outsider, agent, actor };
  }

  it("a shared agent cannot read an owner's private task on behalf of an unauthorized coworker", async () => {
    const f = await fixture();
    const id = randomUUID();
    const [issue] = await db.insert(issues).values({ id, companyId: f.company.id, title: "Private email", visibility: "private", privacyRootIssueId: id, responsibleUserId: f.owner, assigneeAgentId: f.agent.id }).returning();
    const authz = authorizationService(db);
    const resource = { type: "issue" as const, companyId: f.company.id, issueId: id };
    expect((await authz.decide({ actor: f.actor(f.outsider), action: "issue:read", resource })).allowed).toBe(false);
    expect((await authz.decide({ actor: { type: "agent", agentId: f.agent.id, companyId: f.company.id, source: "agent_jwt", onBehalfOfUserId: f.outsider }, action: "issue:read", resource })).allowed).toBe(false);
  });

  it("list SQL and direct checks agree after a project becomes open", async () => {
    const f = await fixture();
    const [project] = await db.insert(projects).values({ companyId: f.company.id, name: "Previously private", visibility: "open" }).returning();
    await db.insert(projectAccessMembers).values({ companyId: f.company.id, projectId: project.id, subjectType: "user", subjectId: f.outsider });
    const id = randomUUID();
    const [issue] = await db.insert(issues).values({ id, companyId: f.company.id, title: "Still individually private", visibility: "private", privacyRootIssueId: id, responsibleUserId: f.owner, projectId: project.id }).returning();
    expect(await canActorReadIssuePrivacy(db, f.actor(f.outsider), issue)).toBe(false);
    const found = await db.select({ id: issues.id }).from(issues).where(and(eq(issues.id, id), await issueReadSqlCondition(db, f.actor(f.outsider))));
    expect(found).toEqual([]);
  });

  it("making a parent private also protects existing descendants", async () => {
    const f = await fixture();
    const { issueService } = await import("../services/issues.js");
    const svc = issueService(db);
    const parent = await svc.create(f.company.id, { title: "Parent", createdByUserId: f.owner });
    const child = await svc.create(f.company.id, { title: "Existing child", parentId: parent.id, createdByUserId: f.owner });
    await svc.update(parent.id, { visibility: "private" });
    const updated = await svc.getById(child.id);
    expect(updated?.visibility).toBe("private");
  });

  it("reparenting an open issue under a private task inherits privacy", async () => {
    const f = await fixture();
    const { issueService } = await import("../services/issues.js");
    const svc = issueService(db);
    const parent = await svc.create(f.company.id, { title: "Parent", createdByUserId: f.owner, visibility: "private" });
    const child = await svc.create(f.company.id, { title: "Moved child", createdByUserId: f.owner });
    const updated = await svc.update(child.id, { parentId: parent.id });
    expect(updated?.visibility).toBe("private");
  });

  it("an unauthorized board user cannot fetch a private issue through PATCH", async () => {
    const f = await fixture();
    const id = randomUUID();
    await db.insert(issues).values({ id, companyId: f.company.id, title: "Confidential acquisition", description: "Private email content", status: "backlog", visibility: "private", privacyRootIssueId: id, responsibleUserId: f.owner, createdByUserId: f.owner });
    const { issueRoutes } = await import("../routes/issues.js");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.actor = f.actor(f.outsider) as Express.Request["actor"]; next(); });
    app.use("/api", issueRoutes(db, {} as any));
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(err.status ?? 500).json({ error: err.message }); });
    await request(app).get(`/api/issues/${id}`).expect(404);
    const response = await request(app).patch(`/api/issues/${id}`).send({ priority: "low" });
    expect({ status: response.status, title: response.body.title }).toEqual({ status: 404, title: undefined });
  });

  it("live WebSocket delivery does not disclose a private run to an unauthorized member", async () => {
    const f = await fixture();
    const id = randomUUID();
    await db.insert(issues).values({ id, companyId: f.company.id, title: "Private email", visibility: "private", privacyRootIssueId: id, responsibleUserId: f.owner });
    expect((await authorizationService(db).decide({ actor: f.actor(f.outsider), action: "issue:read", resource: { type: "issue", companyId: f.company.id, issueId: id } })).allowed).toBe(false);
    const { setupLiveEventsWebSocketServer } = await import("../realtime/live-events-ws.js");
    const { publishLiveEvent } = await import("../services/live-events.js");
    const server = createServer();
    const wss = setupLiveEventsWebSocketServer(server, db, { deploymentMode: "authenticated", resolveCloudActor: async () => ({ userId: f.outsider, companyIds: [f.company.id] }) });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/companies/${f.company.id}/events/ws`);
    try {
      await once(socket, "open");
      const message = once(socket, "message");
      publishLiveEvent({ companyId: f.company.id, type: "heartbeat.run.log", payload: { issueId: id, runId: randomUUID(), agentId: f.agent.id, chunk: "PRIVATE_EMAIL_CANARY" } });
      const result = await Promise.race([message.then(([data]) => data.toString()), new Promise<string>(resolve => setTimeout(() => resolve(""), 150))]);
      expect(result).not.toContain("PRIVATE_EMAIL_CANARY");
    } finally {
      socket.terminate();
      await new Promise<void>(resolve => (wss as any).close(resolve));
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
