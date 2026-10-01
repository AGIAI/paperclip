import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "./auth.js";
import { companies } from "./companies.js";

// OAuth client/request metadata is instance-level authentication infrastructure.
// Authority and mutation receipts are always scoped to a company and a user.
export const mcpOauthClients = pgTable("mcp_oauth_clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mcpOauthGrants = pgTable("mcp_oauth_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().references(() => mcpOauthClients.id, { onDelete: "cascade" }),
  resource: text("resource").notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("mcp_oauth_grants_user_company_idx").on(t.userId, t.companyId),
]);

export const mcpOauthRequests = pgTable("mcp_oauth_requests", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => mcpOauthClients.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  resource: text("resource").notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull(),
  state: text("state"),
  challenge: text("challenge").notNull(),
  grantId: uuid("grant_id").references(() => mcpOauthGrants.id, { onDelete: "cascade" }),
  codeHash: text("code_hash"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mcp_oauth_requests_code_uq").on(t.codeHash),
  index("mcp_oauth_requests_expiry_idx").on(t.expiresAt),
]);

export const mcpOauthTokens = pgTable("mcp_oauth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  grantId: uuid("grant_id").notNull().references(() => mcpOauthGrants.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  kind: text("kind").$type<"access" | "refresh">().notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mcp_oauth_tokens_hash_uq").on(t.tokenHash),
  index("mcp_oauth_tokens_grant_idx").on(t.grantId),
  index("mcp_oauth_tokens_expiry_idx").on(t.expiresAt),
]);

export const mcpMutationReceipts = pgTable("mcp_mutation_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  grantId: uuid("grant_id").notNull().references(() => mcpOauthGrants.id, { onDelete: "cascade" }),
  operation: text("operation").notNull(),
  requestId: uuid("request_id").notNull(),
  argumentsHash: text("arguments_hash").notNull(),
  status: text("status").$type<"reserved" | "completed" | "unknown">().notNull().default("reserved"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mcp_mutation_receipts_request_uq").on(t.companyId, t.userId, t.operation, t.requestId),
  index("mcp_mutation_receipts_company_idx").on(t.companyId),
]);
