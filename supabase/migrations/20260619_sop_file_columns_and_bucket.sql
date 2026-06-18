-- Repo sync for Service SOPs Stage 1 file-upload extension. The schema in
-- this file was applied directly to production on 2026-06-19; this
-- migration is committed so the repo history reflects reality and
-- re-running against a fresh environment is a safe no-op. Every
-- statement uses IF NOT EXISTS / ON CONFLICT guards.

-- File-path columns for SOPs that are uploaded as PDFs rather than
-- linked. sop_file_path stores the path inside the private "sop-documents"
-- bucket; sop_file_name preserves the user-uploaded filename so the UI
-- can show "Brightwork-cut-N27RA.pdf" instead of the path. Both nullable;
-- an SOP can be a URL, a file, or neither (in which case the row simply
-- has no SOP attached).
ALTER TABLE services ADD COLUMN IF NOT EXISTS sop_file_path TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS sop_file_name TEXT;

ALTER TABLE aircraft_service_sops ADD COLUMN IF NOT EXISTS sop_file_path TEXT;
ALTER TABLE aircraft_service_sops ADD COLUMN IF NOT EXISTS sop_file_name TEXT;

-- Private storage bucket. Never expose a public URL — access is always
-- through server-generated signed URLs (short-lived for read surfaces,
-- up to 7 days for briefing email per Brett's spec).
INSERT INTO storage.buckets (id, name, public)
VALUES ('sop-documents', 'sop-documents', false)
ON CONFLICT (id) DO NOTHING;
