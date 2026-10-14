-- 0001 Core schema for the Inovantage Idea Validator backend.
-- Apply with: supabase db push   (or paste into the Supabase SQL editor in order)
--
-- Conventions
--  * All ids are random UUIDs (gen_random_uuid()) so nothing is guessable.
--  * Customer text (answers, reports) lives only in these tables and in the
--    private "reports" storage bucket. No table is readable by anon/authenticated.
--  * Timestamps are timestamptz in UTC.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- submissions: the questionnaire as submitted, before and after payment
-- ---------------------------------------------------------------------------
create table if not exists public.submissions (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  email           text not null,
  email_normalised text not null,
  market          text not null check (market in ('UK','US','AU')),
  currency        text not null check (currency in ('GBP','USD','AUD')),
  idea_name       text not null,
  answers         jsonb not null,
  answers_version integer not null default 1,
  consent_version text not null default 'draft-2026-10',
  ip_hash         text,
  user_agent_hash text,
  status          text not null default 'draft'
                  check (status in ('draft','ordered','paid','expired')),
  constraint submissions_answers_size check (pg_column_size(answers) <= 65536)
);
create index if not exists submissions_email_norm_idx on public.submissions (email_normalised);
create index if not exists submissions_created_idx on public.submissions (created_at);

-- ---------------------------------------------------------------------------
-- orders: one per submission; ties the submission to a Stripe payment
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id                          uuid primary key default gen_random_uuid(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  submission_id               uuid not null unique references public.submissions(id) on delete restrict,
  email                       text not null,
  email_normalised            text not null,
  status                      text not null default 'pending_payment'
                              check (status in ('pending_payment','paid','fulfilled','failed','expired','refunded')),
  amount_minor                integer not null check (amount_minor > 0),
  currency                    text not null,
  stripe_price_id             text,
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text unique,
  checkout_expires_at         timestamptz,
  paid_at                     timestamptz,
  fulfilled_at                timestamptz,
  failed_reason               text,
  -- After this moment status/download links stop working (recovery too).
  report_expires_at           timestamptz
);
create index if not exists orders_email_norm_idx on public.orders (email_normalised);
create index if not exists orders_status_idx on public.orders (status);

-- ---------------------------------------------------------------------------
-- jobs: durable background work with leases, checkpoints and bounded retries
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  type              text not null default 'report',
  status            text not null default 'queued'
                    check (status in ('queued','running','succeeded','failed','dead')),
  -- Pipeline position. Stages are idempotent; a retry resumes from here.
  stage             text not null default 'confirm'
                    check (stage in ('confirm','research','compose','render','deliver','done')),
  checkpoint        jsonb not null default '{}'::jsonb,
  attempts          integer not null default 0,
  max_attempts      integer not null default 5,
  run_after         timestamptz not null default now(),
  lease_owner       text,
  lease_expires_at  timestamptz,
  started_at        timestamptz,
  finished_at       timestamptz,
  last_error        text,
  constraint jobs_one_per_order_type unique (order_id, type)
);
create index if not exists jobs_runnable_idx on public.jobs (status, run_after);
create index if not exists jobs_lease_idx on public.jobs (status, lease_expires_at);

-- ---------------------------------------------------------------------------
-- research_sources: evidence gathered for an order
-- ---------------------------------------------------------------------------
create table if not exists public.research_sources (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  url           text not null,
  title         text,
  publisher     text,
  page_age      text,
  snippet       text,
  retrieved_at  timestamptz not null default now(),
  constraint research_sources_unique_per_order unique (order_id, url)
);
create index if not exists research_sources_order_idx on public.research_sources (order_id);

-- ---------------------------------------------------------------------------
-- reports: the generated report content and its PDF location
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  order_id        uuid not null unique references public.orders(id) on delete cascade,
  version         integer not null default 1,
  status          text not null default 'generating'
                  check (status in ('generating','generated','rendered','delivered','failed')),
  content         jsonb,
  verdict         text,
  model           text,
  input_tokens    integer,
  output_tokens   integer,
  generated_at    timestamptz,
  pdf_object_path text,
  pdf_bytes       integer,
  rendered_at     timestamptz,
  delivered_at    timestamptz
);

-- ---------------------------------------------------------------------------
-- report_claims: individual statements with their evidential basis
-- ---------------------------------------------------------------------------
create table if not exists public.report_claims (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  report_id   uuid not null references public.reports(id) on delete cascade,
  section_id  text not null,
  position    integer not null default 0,
  claim_text  text not null,
  kind        text not null check (kind in ('evidence','assumption','customer_input','calculation')),
  confidence  text not null default 'medium' check (confidence in ('high','medium','low')),
  source_urls text[] not null default '{}'
);
create index if not exists report_claims_report_idx on public.report_claims (report_id);

-- ---------------------------------------------------------------------------
-- access_tokens: hashed bearer tokens that unlock a report's status/download
-- ---------------------------------------------------------------------------
create table if not exists public.access_tokens (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  token_hash    text not null unique,
  purpose       text not null default 'report_access' check (purpose in ('report_access')),
  issued_via    text not null check (issued_via in ('checkout_return','email','recovery')),
  expires_at    timestamptz not null,
  last_used_at  timestamptz,
  use_count     integer not null default 0,
  revoked_at    timestamptz
);
create index if not exists access_tokens_order_idx on public.access_tokens (order_id);

-- ---------------------------------------------------------------------------
-- webhook_events: idempotency ledger for payment provider events
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_events (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null default 'stripe',
  event_id      text not null,
  event_type    text not null,
  payload_hash  text not null,
  status        text not null default 'received'
                check (status in ('received','processing','processed','ignored','rejected','failed')),
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  order_id      uuid references public.orders(id) on delete set null,
  error         text,
  constraint webhook_events_unique_event unique (provider, event_id)
);

-- ---------------------------------------------------------------------------
-- delivery_attempts: every email we try to send, and what happened
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_attempts (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  order_id             uuid not null references public.orders(id) on delete cascade,
  job_id               uuid references public.jobs(id) on delete set null,
  kind                 text not null check (kind in ('confirmation','report','recovery')),
  provider             text not null default 'resend',
  provider_message_id  text,
  status               text not null check (status in ('sent','failed')),
  error                text
);
create index if not exists delivery_attempts_order_kind_idx on public.delivery_attempts (order_id, kind, status);

-- ---------------------------------------------------------------------------
-- rate_limits: fixed-window counters keyed by hashed identity + route
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  count         integer not null default 0
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['submissions','orders','jobs','reports'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
