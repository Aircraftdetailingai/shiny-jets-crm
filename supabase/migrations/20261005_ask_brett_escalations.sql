-- ============================================================================
-- Ask Brett: Detailing AI escalations + separate conversations (Brett, Oct 3 2026)
--
-- When Detailing AI can't answer confidently it files the question here; Brett answers it
-- from the admin queue (/admin/ask-brett) and the answer shows in the user's chat thread
-- and is emailed to them.
--
-- * One row = one question from one account (detailer_id). The app only reads a user's
--   own account's rows; the queue is admin-only. Service role only: RLS on, NO policies,
--   no grants for anon/authenticated (same lock-down as private_knowledge).
-- * Photos attached to an escalation are kept in the private storage bucket
--   'detailing-ai-escalations' for 90 days (photos_expire_at), then removed by
--   /api/cron/ask-brett-retention.
-- * "Add to AI knowledge" saves the Q&A (no account data) to private_knowledge with
--   source 'brett-answers'.
--
-- Safe to run more than once.
-- ============================================================================

BEGIN;

-- Separate Detailing AI conversations (before this, the page had one in-memory feed that was
-- lost on reload). One row per chat; messages are a jsonb array of
-- {role, content, display, photo_count, suggestions, created_at}. Chat photos are NOT stored
-- here (only a count); escalation photos live in the bucket below.
CREATE TABLE IF NOT EXISTS public.detailing_ai_conversations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  detailer_id uuid        NOT NULL REFERENCES public.detailers(id) ON DELETE CASCADE,
  user_id     text        NOT NULL,
  title       text,
  messages    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS detailing_ai_conversations_owner_idx ON public.detailing_ai_conversations (detailer_id, user_id, updated_at DESC);
ALTER TABLE public.detailing_ai_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.detailing_ai_conversations FROM PUBLIC;
REVOKE ALL ON public.detailing_ai_conversations FROM anon;
REVOKE ALL ON public.detailing_ai_conversations FROM authenticated;

CREATE TABLE IF NOT EXISTS public.detailing_ai_escalations (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  detailer_id        uuid        NOT NULL REFERENCES public.detailers(id) ON DELETE CASCADE,
  conversation_id    uuid        REFERENCES public.detailing_ai_conversations(id) ON DELETE SET NULL,
  user_id            text,
  user_email         text,
  reason             text        NOT NULL DEFAULT 'other'
                     CHECK (reason IN ('unclear_photo', 'white_paint', 'not_in_knowledge', 'user_asked', 'other')),
  summary            text,
  question           text        NOT NULL,
  context            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  ai_reply           text,
  photo_paths        text[]      NOT NULL DEFAULT '{}',
  photos_expire_at   timestamptz,
  photos_deleted_at  timestamptz,
  ticket_hash        text,
  status             text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered')),
  answer             text,
  answered_by        text,
  answered_at        timestamptz,
  added_to_knowledge boolean     NOT NULL DEFAULT false,
  knowledge_slug     text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS detailing_ai_escalations_account_idx ON public.detailing_ai_escalations (detailer_id, created_at DESC);
ALTER TABLE public.detailing_ai_escalations
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.detailing_ai_conversations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS detailing_ai_escalations_conversation_idx ON public.detailing_ai_escalations (conversation_id);
CREATE INDEX IF NOT EXISTS detailing_ai_escalations_status_idx ON public.detailing_ai_escalations (status, created_at);
CREATE INDEX IF NOT EXISTS detailing_ai_escalations_expiry_idx ON public.detailing_ai_escalations (photos_expire_at) WHERE photos_deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS detailing_ai_escalations_ticket_idx ON public.detailing_ai_escalations (detailer_id, ticket_hash) WHERE ticket_hash IS NOT NULL;

ALTER TABLE public.detailing_ai_escalations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.detailing_ai_escalations FROM PUBLIC;
REVOKE ALL ON public.detailing_ai_escalations FROM anon;
REVOKE ALL ON public.detailing_ai_escalations FROM authenticated;

-- Shared knowledge: allow Brett-approved answers.
ALTER TABLE public.private_knowledge DROP CONSTRAINT IF EXISTS private_knowledge_source_check;
ALTER TABLE public.private_knowledge
  ADD CONSTRAINT private_knowledge_source_check CHECK (source IN ('recipes', 'beyond-shiny', 'brett-answers'));

-- Private photo bucket (no public URLs; the app hands out 1-hour signed links).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('detailing-ai-escalations', 'detailing-ai-escalations', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false;

COMMIT;
