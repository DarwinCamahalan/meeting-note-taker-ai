-- Cue Phase 1 bootstrap migration.
-- Hand-authored (non-diffable bits): pgvector extension, uuidv7() shim,
-- pgcrypto (for gen_random_uuid used by the shim), enums, tables, and the
-- HNSW ANN index. Additive-only; safe to re-run guards via IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS "vector";
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint

-- UUIDv7 (time-ordered) shim: Postgres 16 has no native uuidv7().
-- Embeds a millisecond unix timestamp in the high bytes of a random v4 UUID
-- and stamps the version (7) + variant bits. Swap for `pg_uuidv7` where the
-- managed provider allows it.
CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
          FROM 1 FOR 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$ LANGUAGE sql VOLATILE;
--> statement-breakpoint

CREATE TYPE "public"."data_region" AS ENUM('us', 'eu');
--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'pro', 'team', 'enterprise');
--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'member', 'billing');
--> statement-breakpoint
CREATE TYPE "public"."session_mode" AS ENUM('interview_prep', 'interview_live', 'sales', 'support', 'meeting_notes');
--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('created', 'active', 'ended', 'processing', 'failed', 'purged');
--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('resume', 'job_description', 'knowledge_base', 'product_doc', 'other');
--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('awaiting_upload', 'uploaded', 'parsing', 'embedding', 'ready', 'failed');
--> statement-breakpoint
CREATE TYPE "public"."usage_kind" AS ENUM('live_minutes', 'stt_seconds', 'llm_input_tokens', 'llm_output_tokens', 'rag_query');
--> statement-breakpoint

CREATE TABLE "orgs" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "plan" "plan" DEFAULT 'free' NOT NULL,
  "data_region" "data_region" NOT NULL,
  "is_personal" boolean DEFAULT false NOT NULL,
  "stripe_customer_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz,
  CONSTRAINT "orgs_slug_uk" UNIQUE("slug")
);
--> statement-breakpoint

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "email" text NOT NULL,
  "clerk_user_id" text NOT NULL,
  "display_name" text,
  "avatar_url" text,
  "data_region" "data_region" NOT NULL,
  "training_opt_out" boolean DEFAULT true NOT NULL,
  "totp_enabled" boolean DEFAULT false NOT NULL,
  "last_active_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz,
  CONSTRAINT "users_email_uk" UNIQUE("email"),
  CONSTRAINT "users_clerk_uk" UNIQUE("clerk_user_id")
);
--> statement-breakpoint

CREATE TABLE "org_members" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "org_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" "org_role" DEFAULT 'member' NOT NULL,
  "joined_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "org_members_uk" UNIQUE("org_id", "user_id")
);
--> statement-breakpoint

CREATE TABLE "devices" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "user_id" uuid NOT NULL,
  "platform" text NOT NULL,
  "app_version" text,
  "device_fingerprint" text NOT NULL,
  "public_key" text,
  "last_seen_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "devices_fingerprint_uk" UNIQUE("device_fingerprint")
);
--> statement-breakpoint

CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "org_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "mode" "session_mode" NOT NULL,
  "status" "session_status" DEFAULT 'created' NOT NULL,
  "disclosed" boolean DEFAULT false NOT NULL,
  "title" text,
  "language" text DEFAULT 'en' NOT NULL,
  "duration_seconds" integer DEFAULT 0 NOT NULL,
  "started_at" timestamptz,
  "ended_at" timestamptz,
  "purge_after" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "transcripts" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "session_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "language" text DEFAULT 'en' NOT NULL,
  "segment_count" integer DEFAULT 0 NOT NULL,
  "summary" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "transcript_segments" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "transcript_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "speaker" text DEFAULT 'unknown' NOT NULL,
  "content" text NOT NULL,
  "start_ms" integer NOT NULL,
  "end_ms" integer NOT NULL,
  "is_final" boolean DEFAULT true NOT NULL,
  "confidence" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "documents" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "org_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "kind" "document_kind" NOT NULL,
  "title" text NOT NULL,
  "storage_key" text NOT NULL,
  "mime_type" text,
  "byte_size" integer,
  "status" "document_status" DEFAULT 'awaiting_upload' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "document_chunks" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "document_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "chunk_index" integer NOT NULL,
  "content" text NOT NULL,
  "token_count" integer,
  "embedding" vector(1024) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "org_id" uuid NOT NULL,
  "stripe_subscription_id" text NOT NULL,
  "stripe_price_id" text NOT NULL,
  "tier" text NOT NULL,
  "status" text NOT NULL,
  "seats" numeric DEFAULT '1' NOT NULL,
  "trial_ends_at" timestamptz,
  "current_period_end" timestamptz NOT NULL,
  "cancel_at_period_end" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "subs_stripe_uk" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint

CREATE TABLE "entitlements" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "org_id" uuid NOT NULL,
  "feature" text NOT NULL,
  "limits" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "entitlements_org_feature_uk" UNIQUE("org_id", "feature")
);
--> statement-breakpoint

CREATE TABLE "usage_events" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "org_id" uuid NOT NULL,
  "session_id" uuid,
  "kind" "usage_kind" NOT NULL,
  "quantity" numeric NOT NULL,
  "unit" text NOT NULL,
  "occurred_at" timestamptz DEFAULT now() NOT NULL,
  "reported_to_stripe_at" timestamptz
);
--> statement-breakpoint

CREATE TABLE "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "org_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "ip" text,
  "user_agent" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "orgs_region_idx" ON "orgs" USING btree ("data_region");
--> statement-breakpoint
CREATE INDEX "org_members_user_idx" ON "org_members" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "sessions_org_idx" ON "sessions" USING btree ("org_id", "started_at");
--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id", "started_at");
--> statement-breakpoint
CREATE INDEX "sessions_purge_idx" ON "sessions" USING btree ("purge_after");
--> statement-breakpoint
CREATE INDEX "transcripts_session_idx" ON "transcripts" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "segments_transcript_idx" ON "transcript_segments" USING btree ("transcript_id", "start_ms");
--> statement-breakpoint
CREATE INDEX "documents_org_idx" ON "documents" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX "chunks_doc_idx" ON "document_chunks" USING btree ("document_id", "chunk_index");
--> statement-breakpoint
CREATE INDEX "chunks_org_idx" ON "document_chunks" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX "chunks_embedding_hnsw" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);
--> statement-breakpoint
CREATE INDEX "subs_org_idx" ON "subscriptions" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX "usage_org_time_idx" ON "usage_events" USING btree ("org_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX "usage_unreported_idx" ON "usage_events" USING btree ("reported_to_stripe_at");
--> statement-breakpoint
CREATE INDEX "audit_org_time_idx" ON "audit_logs" USING btree ("org_id", "created_at");
