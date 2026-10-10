-- Copy fixes for rows saved before the catalog spelling was corrected,
-- plus a note on ACH encryption.
--
-- ACH routing and account numbers are encrypted in the app (AES-256-GCM,
-- prefix enc1:) with the server env var BANK_DATA_ENCRYPTION_KEY. SQL cannot
-- see that key, so this migration does not rewrite or blank existing values.
-- The next authenticated read of /api/user/me?include_remit=1 rewrites any
-- leftover plaintext digits to ciphertext. Until the key is set, old rows
-- stay readable and new non-empty values are refused.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'detailers' AND column_name = 'ach_routing_number'
  ) THEN
    EXECUTE $c$COMMENT ON COLUMN public.detailers.ach_routing_number IS 'AES-256-GCM ciphertext (enc1:) when BANK_DATA_ENCRYPTION_KEY is set. Legacy rows may still hold plaintext digits until the next authenticated read.'$c$;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'detailers' AND column_name = 'ach_account_number'
  ) THEN
    EXECUTE $c$COMMENT ON COLUMN public.detailers.ach_account_number IS 'AES-256-GCM ciphertext (enc1:) when BANK_DATA_ENCRYPTION_KEY is set. Legacy rows may still hold plaintext digits until the next authenticated read.'$c$;
  END IF;
END $$;

-- Type-aware typo repair. Only known catalog/intake columns, and only rows
-- that still contain the misspelling.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name IN (
        'services', 'detailer_services', 'packages', 'intake_flows',
        'service_addons', 'addons', 'suggested_services'
      )
      AND c.data_type IN ('text', 'character varying', 'json', 'jsonb')
      AND c.column_name IN (
        'name', 'description', 'service_name', 'label', 'title',
        'questions', 'flow_nodes', 'flow_edges', 'options', 'content'
      )
  LOOP
    IF r.data_type IN ('text', 'character varying') THEN
      EXECUTE format(
        'UPDATE %I SET %I = replace(replace(%I, %L, %L), %L, %L) WHERE %I LIKE %L OR %I LIKE %L',
        r.table_name, r.column_name, r.column_name,
        'Exteriro', 'Exterior', 'Verfied Finish', 'Verified Finish',
        r.column_name, '%Exteriro%', r.column_name, '%Verfied Finish%'
      );
    ELSIF r.data_type = 'jsonb' THEN
      EXECUTE format(
        'UPDATE %I SET %I = replace(replace(%I::text, %L, %L), %L, %L)::jsonb WHERE %I::text LIKE %L OR %I::text LIKE %L',
        r.table_name, r.column_name, r.column_name,
        'Exteriro', 'Exterior', 'Verfied Finish', 'Verified Finish',
        r.column_name, '%Exteriro%', r.column_name, '%Verfied Finish%'
      );
    ELSIF r.data_type = 'json' THEN
      EXECUTE format(
        'UPDATE %I SET %I = replace(replace(%I::text, %L, %L), %L, %L)::json WHERE %I::text LIKE %L OR %I::text LIKE %L',
        r.table_name, r.column_name, r.column_name,
        'Exteriro', 'Exterior', 'Verfied Finish', 'Verified Finish',
        r.column_name, '%Exteriro%', r.column_name, '%Verfied Finish%'
      );
    END IF;
  END LOOP;
END $$;
