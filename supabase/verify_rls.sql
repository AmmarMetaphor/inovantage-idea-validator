-- Run in the Supabase SQL editor. Every row must show rls_enabled = true,
-- rls_forced = true and policy_count = 0 for the ten application tables, and
-- the reports bucket must be private with no storage policies.

select
  c.relname                           as table_name,
  c.relrowsecurity                    as rls_enabled,
  c.relforcerowsecurity               as rls_forced,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policy_count,
  has_table_privilege('anon', c.oid, 'SELECT')          as anon_can_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_can_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'submissions','orders','jobs','research_sources','reports',
    'report_claims','access_tokens','webhook_events','delivery_attempts','rate_limits'
  )
order by c.relname;

select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'reports';

select policyname, cmd, roles from pg_policies where schemaname = 'storage' and tablename = 'objects';
