-- ============================================================================
-- Detailing AI: projects + long-chat summaries (Brett, Oct 3 2026)
--
-- * Projects (e.g. "Brightwork", "N123AB King Air", "Interiors") group a user's chats and carry
--   optional notes (aircraft, products they own) that are added to every chat in the project.
--   Chats with no project show under "Unsorted" (project_id NULL). Deleting a project moves its
--   chats to Unsorted.
-- * Long chats: a rolling summary of turns older than the recent window (summary,
--   summary_through_at), and a summary carried over when the user starts a fresh chat
--   (carried_summary, carried_from).
-- * Service role only: RLS on, NO policies, no grants for anon/authenticated (same as
--   detailing_ai_conversations). The app scopes every query to detailer_id + user_id.
-- Requires 20261005_ask_brett_escalations.sql. Safe to run more than once.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.detailing_ai_projects (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  detailer_id uuid        NOT NULL REFERENCES public.detailers(id) ON DELETE CASCADE,
  user_id     text        NOT NULL,
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  notes       text        CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS detailing_ai_projects_owner_idx ON public.detailing_ai_projects (detailer_id, user_id, name);
ALTER TABLE public.detailing_ai_projects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.detailing_ai_projects FROM PUBLIC;
REVOKE ALL ON public.detailing_ai_projects FROM anon;
REVOKE ALL ON public.detailing_ai_projects FROM authenticated;

ALTER TABLE public.detailing_ai_conversations
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.detailing_ai_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS summary_through_at timestamptz,
  ADD COLUMN IF NOT EXISTS carried_summary text,
  ADD COLUMN IF NOT EXISTS carried_from uuid;
CREATE INDEX IF NOT EXISTS detailing_ai_conversations_project_idx ON public.detailing_ai_conversations (project_id);

COMMIT;
