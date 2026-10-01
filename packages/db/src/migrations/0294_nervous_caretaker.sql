CREATE TABLE IF NOT EXISTS "mcp_mutation_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"grant_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"request_id" uuid NOT NULL,
	"arguments_hash" text NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_oauth_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"resource" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_oauth_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"resource" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"state" text,
	"challenge" text NOT NULL,
	"grant_id" uuid,
	"code_hash" text,
	"decided_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"kind" text NOT NULL,
	"used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_mutation_receipts_company_id_companies_id_fk' AND conrelid = 'public.mcp_mutation_receipts'::regclass) THEN
    ALTER TABLE "mcp_mutation_receipts" ADD CONSTRAINT "mcp_mutation_receipts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_mutation_receipts_user_id_user_id_fk' AND conrelid = 'public.mcp_mutation_receipts'::regclass) THEN
    ALTER TABLE "mcp_mutation_receipts" ADD CONSTRAINT "mcp_mutation_receipts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_mutation_receipts_grant_id_mcp_oauth_grants_id_fk' AND conrelid = 'public.mcp_mutation_receipts'::regclass) THEN
    ALTER TABLE "mcp_mutation_receipts" ADD CONSTRAINT "mcp_mutation_receipts_grant_id_mcp_oauth_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."mcp_oauth_grants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_oauth_grants_company_id_companies_id_fk' AND conrelid = 'public.mcp_oauth_grants'::regclass) THEN
    ALTER TABLE "mcp_oauth_grants" ADD CONSTRAINT "mcp_oauth_grants_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_oauth_grants_user_id_user_id_fk' AND conrelid = 'public.mcp_oauth_grants'::regclass) THEN
    ALTER TABLE "mcp_oauth_grants" ADD CONSTRAINT "mcp_oauth_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_oauth_grants_client_id_mcp_oauth_clients_id_fk' AND conrelid = 'public.mcp_oauth_grants'::regclass) THEN
    ALTER TABLE "mcp_oauth_grants" ADD CONSTRAINT "mcp_oauth_grants_client_id_mcp_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_oauth_clients"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_oauth_requests_client_id_mcp_oauth_clients_id_fk' AND conrelid = 'public.mcp_oauth_requests'::regclass) THEN
    ALTER TABLE "mcp_oauth_requests" ADD CONSTRAINT "mcp_oauth_requests_client_id_mcp_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_oauth_clients"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_oauth_requests_grant_id_mcp_oauth_grants_id_fk' AND conrelid = 'public.mcp_oauth_requests'::regclass) THEN
    ALTER TABLE "mcp_oauth_requests" ADD CONSTRAINT "mcp_oauth_requests_grant_id_mcp_oauth_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."mcp_oauth_grants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_oauth_tokens_grant_id_mcp_oauth_grants_id_fk' AND conrelid = 'public.mcp_oauth_tokens'::regclass) THEN
    ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_grant_id_mcp_oauth_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."mcp_oauth_grants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_mutation_receipts_request_uq" ON "mcp_mutation_receipts" USING btree ("company_id","user_id","operation","request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_mutation_receipts_company_idx" ON "mcp_mutation_receipts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_oauth_grants_user_company_idx" ON "mcp_oauth_grants" USING btree ("user_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_oauth_requests_code_uq" ON "mcp_oauth_requests" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_oauth_requests_expiry_idx" ON "mcp_oauth_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_oauth_tokens_hash_uq" ON "mcp_oauth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_oauth_tokens_grant_idx" ON "mcp_oauth_tokens" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_oauth_tokens_expiry_idx" ON "mcp_oauth_tokens" USING btree ("expires_at");
