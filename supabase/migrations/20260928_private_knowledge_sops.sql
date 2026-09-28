-- ============================================================================
-- private_knowledge: allow source = 'sops' (Shiny Jets SOP library).
--
-- 20260928_private_knowledge.sql created the column with an inline, unnamed
-- CHECK (source IN ('recipes', 'beyond-shiny')); Postgres names it
-- private_knowledge_source_check. This drops whatever CHECK constraint(s) on
-- private_knowledge reference `source` and re-adds one named constraint that
-- also allows 'sops'. 'recipes' stays the internal value for Shiny Jets methods.
--
-- Access is unchanged: RLS on, no policies, no anon/authenticated grants,
-- service_role only. SOP content is NOT in this repo; seed it with:
--   node scripts/upsert-private-knowledge.mjs --only sops --dir /home/box/private-knowledge
--
-- Safe to run more than once.
-- ============================================================================

BEGIN;

DO $mig$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.private_knowledge'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%source%'
  LOOP
    EXECUTE format('ALTER TABLE public.private_knowledge DROP CONSTRAINT %I', c.conname);
  END LOOP;
END
$mig$;

ALTER TABLE public.private_knowledge
  ADD CONSTRAINT private_knowledge_source_check
  CHECK (source IN ('recipes', 'beyond-shiny', 'sops'));

COMMENT ON TABLE public.private_knowledge IS
  'Server-only proprietary Detailing AI knowledge (Shiny Jets methods [source recipes], Shiny Jets SOPs [source sops], Beyond Shiny full text). RLS on, no policies; service_role only.';

COMMIT;

-- Verify:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'public.private_knowledge'::regclass AND contype = 'c';
--   -> CHECK ((source = ANY (ARRAY['recipes'::text, 'beyond-shiny'::text, 'sops'::text])))
