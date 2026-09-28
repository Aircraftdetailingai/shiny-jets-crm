-- ============================================================================
-- private_knowledge — server-only store for proprietary Detailing AI content
-- (Brett's shop recipes + the full Beyond Shiny book text).
--
-- Only the service role can read or write this table:
--   * RLS is enabled with NO policies (anon/authenticated get zero rows even
--     if a grant slipped through), and
--   * all privileges are revoked from anon, authenticated and PUBLIC.
-- The service role bypasses RLS, so the Next.js server (SUPABASE_SERVICE_ROLE_KEY)
-- can still read it. Never add a policy or a grant for anon/authenticated.
--
-- Content is NOT in this repo. Seed/update it with:
--   node scripts/upsert-private-knowledge.mjs --dir /home/box/private-knowledge
--
-- Safe to run more than once.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.private_knowledge (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text        NOT NULL UNIQUE,
  source      text        NOT NULL CHECK (source IN ('recipes', 'beyond-shiny')),
  title       text        NOT NULL,
  section     text,
  keywords    text[]      NOT NULL DEFAULT '{}',
  content     text        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS private_knowledge_source_idx ON public.private_knowledge (source);

-- Keep updated_at fresh on every UPDATE (the upsert script also sets it).
CREATE OR REPLACE FUNCTION public.private_knowledge_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS private_knowledge_touch_updated_at ON public.private_knowledge;
CREATE TRIGGER private_knowledge_touch_updated_at
  BEFORE UPDATE ON public.private_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.private_knowledge_touch_updated_at();

-- Lock it down: RLS on, no policies, no client-role privileges.
ALTER TABLE public.private_knowledge ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.private_knowledge FROM PUBLIC;
REVOKE ALL ON TABLE public.private_knowledge FROM anon;
REVOKE ALL ON TABLE public.private_knowledge FROM authenticated;
REVOKE ALL ON FUNCTION public.private_knowledge_touch_updated_at() FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.private_knowledge TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.private_knowledge_id_seq TO service_role;

COMMENT ON TABLE public.private_knowledge IS
  'Server-only proprietary Detailing AI knowledge (shop recipes, Beyond Shiny full text). RLS on, no policies; service_role only.';

COMMIT;

-- Verify (expect rls_enabled = true, zero policies, no anon/authenticated grants):
--   SELECT relrowsecurity AS rls_enabled FROM pg_class WHERE oid = 'public.private_knowledge'::regclass;
--   SELECT count(*) AS policies FROM pg_policies WHERE schemaname = 'public' AND tablename = 'private_knowledge';
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema = 'public' AND table_name = 'private_knowledge' ORDER BY 1, 2;
