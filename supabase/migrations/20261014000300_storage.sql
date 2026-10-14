-- 0003 Private storage bucket for rendered PDFs.
-- public = false means objects are only reachable with the service role or a
-- short-lived signed URL minted server-side. No storage policies are created,
-- so anon/authenticated clients cannot list, read or upload.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
