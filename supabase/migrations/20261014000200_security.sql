-- 0002 Security: row level security on every customer table, with NO policies,
-- so the anon and authenticated roles can never read or write directly.
-- Only the service role (used server-side in Netlify Functions) can access data.

do $$
declare t text;
begin
  foreach t in array array[
    'submissions','orders','jobs','research_sources','reports','report_claims',
    'access_tokens','webhook_events','delivery_attempts','rate_limits'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Belt and braces: future tables in public get no grants for anon/authenticated.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- Helper trigger must not be callable through the API.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
