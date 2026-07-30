-- Cue Phase 3 shared team knowledge-base migration.
-- Additive-only: introduces a per-document visibility scope so an org's
-- documents can be either shared across the whole team (`org`, the default)
-- or kept private to the uploading user (`personal`). RAG retrieval and the
-- document lists apply this scope on top of the existing `org_id` tenant filter.
-- Existing rows default to `org`, preserving Phase-2 org-wide behavior.
-- Safe to re-run: enum creation is guarded via DO/EXCEPTION, the column and
-- index use IF NOT EXISTS.

DO $$ BEGIN
  CREATE TYPE "public"."document_visibility" AS ENUM('personal', 'org');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "visibility" "document_visibility" NOT NULL DEFAULT 'org';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "documents_org_visibility_idx"
  ON "documents" ("org_id", "visibility");
