CREATE TABLE IF NOT EXISTS "mcp_event_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" text NOT NULL,
	"activity_id" uuid NOT NULL,
	"event" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_event_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"task_id" uuid NOT NULL,
	"arguments" jsonb NOT NULL,
	"delivery_material" jsonb NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"stopped_at" timestamp with time zone,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "mcp_event_deliveries" ADD CONSTRAINT "mcp_event_deliveries_subscription_id_mcp_event_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."mcp_event_subscriptions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "mcp_event_subscriptions" ADD CONSTRAINT "mcp_event_subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "mcp_event_subscriptions" ADD CONSTRAINT "mcp_event_subscriptions_grant_id_mcp_oauth_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."mcp_oauth_grants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_event_deliveries_activity_uq" ON "mcp_event_deliveries" USING btree ("subscription_id","activity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_event_deliveries_due_idx" ON "mcp_event_deliveries" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_event_subscriptions_expiry_idx" ON "mcp_event_subscriptions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_event_subscriptions_company_idx" ON "mcp_event_subscriptions" USING btree ("company_id");