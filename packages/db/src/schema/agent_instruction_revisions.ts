import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";

/** Append-only content. Base64 preserves every UTF-8 byte, including NUL and BOM. */
export const agentInstructionRevisions = pgTable(
  "agent_instruction_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull(),
    agentId: uuid("agent_id").notNull(),
    entryFile: text("entry_file").notNull(),
    contentBase64: text("content_base64").notNull(),
    contentHash: text("content_hash").notNull(),
    byteLength: integer("byte_length").notNull(),
    parentRevisionId: uuid("parent_revision_id"),
    baseRevisionId: uuid("base_revision_id"),
    restoredFromRevisionId: uuid("restored_from_revision_id"),
    actorAgentId: uuid("actor_agent_id"),
    actorUserId: text("actor_user_id"),
    responsibleUserId: text("responsible_user_id"),
    sourceRunId: uuid("source_run_id"),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    owner: foreignKey({
      columns: [t.companyId, t.agentId],
      foreignColumns: [agents.companyId, agents.id],
    }).onDelete("cascade"),
    identity: unique("agent_instruction_revisions_identity_uq").on(
      t.companyId,
      t.agentId,
      t.entryFile,
      t.id,
    ),
    history: index("agent_instruction_revisions_history_idx").on(
      t.companyId,
      t.agentId,
      t.entryFile,
      t.createdAt,
      t.id,
    ),
  }),
);

export const agentInstructionHeads = pgTable(
  "agent_instruction_heads",
  {
    companyId: uuid("company_id").notNull(),
    agentId: uuid("agent_id").notNull(),
    entryFile: text("entry_file").notNull(),
    revisionId: uuid("revision_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    identity: unique("agent_instruction_heads_identity_uq").on(
      t.companyId,
      t.agentId,
      t.entryFile,
    ),
    revision: foreignKey({
      columns: [t.companyId, t.agentId, t.entryFile, t.revisionId],
      foreignColumns: [
        agentInstructionRevisions.companyId,
        agentInstructionRevisions.agentId,
        agentInstructionRevisions.entryFile,
        agentInstructionRevisions.id,
      ],
    }).onDelete("cascade"),
  }),
);
