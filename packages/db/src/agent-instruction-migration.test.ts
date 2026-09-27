import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { applyPendingMigrations, inspectMigrations } from "./client.js";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./test-embedded-postgres.js";

const files = ["0285_legal_thunderbolts.sql", "0286_amusing_shiver_man.sql"];
const migrations = await Promise.all(files.map(async file => ({
  file, sql: await readFile(new URL(`./migrations/${file}`, import.meta.url), "utf8"),
})));
const support = await getEmbeddedPostgresTestSupport();
const describePostgres = support.supported ? describe : describe.skip;

describePostgres("instruction revision migrations", () => {
  it("replays over existing revisions and pending copies without losing bytes or company constraints", async () => {
    const database = await startEmbeddedPostgresTestDatabase("instruction-migration-replay-");
    const sql = postgres(database.connectionString, { max: 1, onnotice: () => {} });
    try {
      const companyId = randomUUID(), otherCompanyId = randomUUID(), agentId = randomUUID();
      const runId = randomUUID(), revisionId = randomUUID();
      const bytes = Buffer.from("\uFEFF# Saved\r\nExact bytes ☃\n");
      const contentBase64 = bytes.toString("base64");
      const contentHash = createHash("sha256").update(bytes).digest("hex");
      await sql`INSERT INTO companies (id, name, issue_prefix) VALUES
        (${companyId}, 'Instructions', 'INS'), (${otherCompanyId}, 'Other', 'OTH')`;
      await sql`INSERT INTO agents (id, company_id, name) VALUES (${agentId}, ${companyId}, 'Writer')`;
      await sql`INSERT INTO heartbeat_runs (id, company_id, agent_id) VALUES (${runId}, ${companyId}, ${agentId})`;
      await sql`INSERT INTO agent_instruction_revisions
        (id, company_id, agent_id, entry_file, content_base64, content_hash, byte_length, source, source_run_id)
        VALUES (${revisionId}, ${companyId}, ${agentId}, 'AGENTS.md', ${contentBase64}, ${contentHash}, ${bytes.length}, 'cleanup', ${runId})`;
      await sql`INSERT INTO agent_instruction_heads (company_id, agent_id, entry_file, revision_id)
        VALUES (${companyId}, ${agentId}, 'AGENTS.md', ${revisionId})`;
      await sql`INSERT INTO agent_instruction_working_copies
        (run_id, company_id, agent_id, responsible_user_id, entry_file, base_revision_id, base_hash, local_root, execution_root, location, state, candidate_base64, candidate_hash)
        VALUES (${runId}, ${companyId}, ${agentId}, 'editor', 'AGENTS.md', ${revisionId}, ${contentHash}, '/private/copy', '/private/copy', 'local', 'pending_commit', ${contentBase64}, ${contentHash})`;
      const before = {
        revisions: await sql`SELECT * FROM agent_instruction_revisions`,
        heads: await sql`SELECT * FROM agent_instruction_heads`,
        copies: await sql`SELECT * FROM agent_instruction_working_copies`,
      };
      for (const migration of migrations) {
        await sql`DELETE FROM drizzle.__drizzle_migrations WHERE hash = ${createHash("sha256").update(migration.sql).digest("hex")}`;
      }
      expect(await inspectMigrations(database.connectionString)).toMatchObject({ status: "needsMigrations", pendingMigrations: files });
      await applyPendingMigrations(database.connectionString);
      // Also replay the SQL directly with every object already present.
      await sql.begin(async tx => {
        for (const migration of migrations) for (const statement of migration.sql.split("--> statement-breakpoint")) {
          if (statement.trim()) await tx.unsafe(statement);
        }
      });
      expect(await sql`SELECT * FROM agent_instruction_revisions`).toEqual(before.revisions);
      expect(await sql`SELECT * FROM agent_instruction_heads`).toEqual(before.heads);
      expect(await sql`SELECT * FROM agent_instruction_working_copies`).toEqual(before.copies);
      await expect(sql`UPDATE agent_instruction_heads SET company_id = ${otherCompanyId} WHERE revision_id = ${revisionId}`)
        .rejects.toMatchObject({ code: "23503" });
      await expect(sql`UPDATE agent_instruction_working_copies SET company_id = ${otherCompanyId} WHERE run_id = ${runId}`)
        .rejects.toMatchObject({ code: "23503" });
    } finally {
      await sql.end();
      await database.cleanup();
    }
  }, 30_000);
});
