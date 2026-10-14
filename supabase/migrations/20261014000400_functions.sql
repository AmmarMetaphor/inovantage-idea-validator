-- 0004 Server-side helper functions (service role only).

-- Atomic job claim. Succeeds only if the job is queued (or its lease has
-- expired), is due, and has attempts left. Exactly one caller can win.
create or replace function public.claim_job(p_job_id uuid, p_worker_id text, p_lease_seconds integer)
returns setof public.jobs
language sql
security definer
set search_path = public
as $$
  update public.jobs
     set status = 'running',
         lease_owner = p_worker_id,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         attempts = attempts + 1,
         started_at = coalesce(started_at, now()),
         updated_at = now()
   where id = p_job_id
     and attempts < max_attempts
     and run_after <= now()
     and (status = 'queued' or (status = 'running' and lease_expires_at < now()))
  returning *;
$$;

-- Extend a lease you still hold.
create or replace function public.extend_job_lease(p_job_id uuid, p_worker_id text, p_lease_seconds integer)
returns boolean
language sql
security definer
set search_path = public
as $$
  with upd as (
    update public.jobs
       set lease_expires_at = now() + make_interval(secs => p_lease_seconds),
           updated_at = now()
     where id = p_job_id and status = 'running' and lease_owner = p_worker_id
    returning 1
  )
  select exists (select 1 from upd);
$$;

-- Put stalled jobs (running past their lease) back in the queue, or mark them
-- dead when retries are exhausted. Called by the scheduled dispatcher.
create or replace function public.recover_stalled_jobs()
returns setof public.jobs
language sql
security definer
set search_path = public
as $$
  update public.jobs
     set status = case when attempts >= max_attempts then 'dead' else 'queued' end,
         lease_owner = null,
         lease_expires_at = null,
         last_error = coalesce(last_error, 'lease expired without completion'),
         finished_at = case when attempts >= max_attempts then now() else null end,
         updated_at = now()
   where status = 'running'
     and lease_expires_at is not null
     and lease_expires_at < now()
  returning *;
$$;

-- Fixed-window rate limiter. Returns whether the call is allowed and how many
-- calls remain in the window. One row per key; windows roll automatically.
create or replace function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
     set count = case when rl.window_start + make_interval(secs => p_window_seconds) <= now()
                      then 1 else rl.count + 1 end,
         window_start = case when rl.window_start + make_interval(secs => p_window_seconds) <= now()
                             then now() else rl.window_start end
  returning rl.count into v_count;

  return query select v_count <= p_limit, greatest(p_limit - v_count, 0);
end $$;

-- Housekeeping: drop rate-limit rows older than a day. Call from the dispatcher.
create or replace function public.prune_rate_limits()
returns integer
language sql
security definer
set search_path = public
as $$
  with del as (
    delete from public.rate_limits where window_start < now() - interval '1 day' returning 1
  )
  select count(*)::integer from del;
$$;

-- None of these may be invoked through the public API.
revoke execute on function public.claim_job(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.extend_job_lease(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.recover_stalled_jobs() from public, anon, authenticated;
revoke execute on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.prune_rate_limits() from public, anon, authenticated;
