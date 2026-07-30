-- Cue Phase 3 enterprise migration.
-- Additive-only: per-org WorkOS SSO connections + org invitations. Reuses the
-- existing `org_role` enum and `audit_logs` table (not re-created here).
-- Safe to re-run: enum creation is guarded via DO/EXCEPTION, tables/indexes
-- via IF NOT EXISTS.

DO $$ BEGIN
  CREATE TYPE "public"."sso_provider" AS ENUM('saml', 'oidc', 'authkit');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."sso_connection_status" AS ENUM('draft', 'validating', 'active', 'inactive');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sso_connections" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "org_id" uuid NOT NULL,
  "provider" "sso_provider" NOT NULL,
  "workos_connection_id" text,
  "workos_organization_id" text NOT NULL,
  "domain" text NOT NULL,
  "status" "sso_connection_status" DEFAULT 'draft' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "sso_connections_domain_uk" UNIQUE("domain"),
  CONSTRAINT "sso_connections_workos_conn_uk" UNIQUE("workos_connection_id")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "invitations" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "org_id" uuid NOT NULL,
  "email" text NOT NULL,
  "role" "org_role" DEFAULT 'member' NOT NULL,
  "token" text NOT NULL,
  "status" "invite_status" DEFAULT 'pending' NOT NULL,
  "invited_by" uuid,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "invitations_token_uk" UNIQUE("token")
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "sso_connections_org_idx" ON "sso_connections" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitations_org_idx" ON "invitations" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitations_email_idx" ON "invitations" USING btree ("email");
