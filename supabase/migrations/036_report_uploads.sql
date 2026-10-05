-- Manual report uploads (zero-install alternative to the HealthLink bridge).
-- GP/staff download a report anywhere, then drag-drop it into Cúram web:
--   - HL7 XML → same filing path as the bridge (labs / inbox / referral acks)
--   - PDFs, scans, letters → private storage bucket + inbox item
alter table inbox_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size int;

-- Private, EU-region project bucket. All object access goes through the
-- report-upload edge function (service role) — no client storage policies,
-- paths are namespaced <practice_id>/… and checked before serving.
insert into storage.buckets (id, name, public, file_size_limit)
values ('practice-documents', 'practice-documents', false, 26214400)
on conflict (id) do nothing;
