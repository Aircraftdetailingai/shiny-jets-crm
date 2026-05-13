-- Backfill customer_aircraft from every historical invoice/quote/job that
-- carried aircraft details. Required because the CRM-side write paths only
-- started pinning to customer_aircraft in commit 49557a4-ish — every row
-- before that point recorded aircraft_model/tail_number on the
-- invoice/quote/job itself but never on the customer's aircraft list.
--
-- Strategy:
--   1. For each (detailer, customer_email) with at least one
--      invoice/quote/job carrying a tail_number, ensure a customer_accounts
--      shell row exists (email + name + phone + company, password_hash NULL —
--      the customer can claim the account later via magic link).
--   2. UPSERT one customer_aircraft row per (customer_account_id,
--      tail_number) pair, taking the most-recent non-null model/manufacturer
--      from across invoices/quotes/jobs. ON CONFLICT does nothing — manually-
--      entered nickname/notes/storage_* never get clobbered.
--
-- Safe to re-run: ON CONFLICT DO NOTHING + IF NOT EXISTS throughout.

-- ── Step 1: ensure customer_accounts shells exist for every email that has
-- aircraft data across invoices, quotes, and jobs.
INSERT INTO customer_accounts (email, name, phone, company)
SELECT
  LOWER(TRIM(src.email)) AS email,
  MAX(src.name) AS name,
  MAX(src.phone) AS phone,
  MAX(src.company) AS company
FROM (
  -- Invoices
  SELECT
    i.customer_email AS email,
    i.customer_name AS name,
    NULL::text AS phone,
    NULL::text AS company
  FROM invoices i
  WHERE i.customer_email IS NOT NULL
    AND TRIM(i.customer_email) <> ''
    AND (i.tail_number IS NOT NULL AND TRIM(i.tail_number) <> '')

  UNION ALL
  -- Quotes
  SELECT
    q.client_email AS email,
    q.client_name AS name,
    NULL::text AS phone,
    NULL::text AS company
  FROM quotes q
  WHERE q.client_email IS NOT NULL
    AND TRIM(q.client_email) <> ''
    AND (q.tail_number IS NOT NULL AND TRIM(q.tail_number) <> '')

  UNION ALL
  -- Jobs (some legacy paths use jobs.customer_email)
  SELECT
    j.customer_email AS email,
    j.customer_name AS name,
    NULL::text AS phone,
    NULL::text AS company
  FROM jobs j
  WHERE j.customer_email IS NOT NULL
    AND TRIM(j.customer_email) <> ''
    AND (j.tail_number IS NOT NULL AND TRIM(j.tail_number) <> '')
) src
WHERE NOT EXISTS (
  SELECT 1 FROM customer_accounts ca
  WHERE ca.email = LOWER(TRIM(src.email))
)
GROUP BY LOWER(TRIM(src.email))
ON CONFLICT (email) DO NOTHING;

-- ── Step 2: insert customer_aircraft rows by joining invoices/quotes/jobs
-- to customer_accounts by email. Use DISTINCT ON to pick the most-recent
-- non-null model per (account_id, tail) pair.
WITH tails AS (
  -- Invoices
  SELECT
    LOWER(TRIM(i.customer_email)) AS email,
    UPPER(TRIM(i.tail_number)) AS tail_number,
    NULLIF(TRIM(i.aircraft_model), '') AS aircraft_model,
    i.detailer_id,
    i.created_at AS observed_at
  FROM invoices i
  WHERE i.tail_number IS NOT NULL AND TRIM(i.tail_number) <> ''
    AND i.customer_email IS NOT NULL AND TRIM(i.customer_email) <> ''

  UNION ALL
  -- Quotes
  SELECT
    LOWER(TRIM(q.client_email)) AS email,
    UPPER(TRIM(q.tail_number)) AS tail_number,
    NULLIF(TRIM(q.aircraft_model), '') AS aircraft_model,
    q.detailer_id,
    q.created_at AS observed_at
  FROM quotes q
  WHERE q.tail_number IS NOT NULL AND TRIM(q.tail_number) <> ''
    AND q.client_email IS NOT NULL AND TRIM(q.client_email) <> ''

  UNION ALL
  -- Jobs
  SELECT
    LOWER(TRIM(j.customer_email)) AS email,
    UPPER(TRIM(j.tail_number)) AS tail_number,
    NULLIF(TRIM(j.aircraft_model), '') AS aircraft_model,
    j.detailer_id,
    j.created_at AS observed_at
  FROM jobs j
  WHERE j.tail_number IS NOT NULL AND TRIM(j.tail_number) <> ''
    AND j.customer_email IS NOT NULL AND TRIM(j.customer_email) <> ''
),
joined AS (
  SELECT
    ca.id AS customer_account_id,
    t.detailer_id,
    t.tail_number,
    t.aircraft_model,
    t.observed_at
  FROM tails t
  JOIN customer_accounts ca ON ca.email = t.email
),
deduped AS (
  SELECT DISTINCT ON (customer_account_id, tail_number)
    customer_account_id,
    detailer_id,
    tail_number,
    aircraft_model
  FROM joined
  ORDER BY customer_account_id, tail_number,
           (aircraft_model IS NULL) ASC,
           observed_at DESC
)
INSERT INTO customer_aircraft (customer_account_id, detailer_id, tail_number, model)
SELECT customer_account_id, detailer_id, tail_number, aircraft_model
FROM deduped
ON CONFLICT (customer_account_id, tail_number) DO NOTHING;
