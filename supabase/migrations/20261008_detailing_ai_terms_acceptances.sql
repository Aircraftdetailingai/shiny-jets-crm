-- ============================================================================
-- Aircraft Detailing AI Terms acceptance (Brett, Oct 3 2026)
--
-- One row each time a user clicks "I agree" on the Aircraft Detailing AI Terms modal
-- (first Detailing AI visit, and again whenever lib/detailing-ai-terms.js TERMS_VERSION changes).
-- The Detailing AI chat is blocked until the user has a row for the current version.
--
-- * user_id      = the CRM login (JWT user id, text, same as detailing_ai_conversations.user_id)
-- * detailer_id  = the account (owner detailer row) the user belongs to
-- * terms_version, accepted_at = what was accepted and when (UTC)
-- * Service role only: RLS on, NO policies, no grants for anon/authenticated (same lock-down as
--   detailing_ai_conversations / private_knowledge). Rows are an audit trail: never updated.
--
-- Run after 20261007_ask_expert_paid.sql. Safe to run more than once.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.detailing_ai_terms_acceptances (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text        NOT NULL,
  detailer_id   uuid        REFERENCES public.detailers(id) ON DELETE SET NULL,
  user_email    text,
  terms_version text        NOT NULL CHECK (char_length(terms_version) BETWEEN 1 AND 40),
  accepted_at   timestamptz NOT NULL DEFAULT now(),
  user_agent    text,
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT detailing_ai_terms_acceptances_user_version_key UNIQUE (user_id, terms_version)
);

CREATE INDEX IF NOT EXISTS detailing_ai_terms_acceptances_account_idx
  ON public.detailing_ai_terms_acceptances (detailer_id, accepted_at DESC);

ALTER TABLE public.detailing_ai_terms_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.detailing_ai_terms_acceptances FROM PUBLIC;
REVOKE ALL ON public.detailing_ai_terms_acceptances FROM anon;
REVOKE ALL ON public.detailing_ai_terms_acceptances FROM authenticated;

COMMENT ON TABLE public.detailing_ai_terms_acceptances IS
  'Aircraft Detailing AI Terms acceptances (user_id, detailer_id, terms_version, accepted_at). Service role only.';

COMMIT;

-- Ask PostgREST to pick up the new table right away.
NOTIFY pgrst, 'reload schema';
