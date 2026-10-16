-- 0006 Two products (standard £17, detailed upgrade £35 additional) and
-- ongoing report access.
--
-- Adds only. Applied migrations 0001–0005 are untouched. Existing rows keep
-- working: every existing order becomes product = 'standard', every existing
-- report tier = 'standard', and preset access expiries are removed.

-- orders: which product, and for an upgrade, the standard order it extends
alter table public.orders
  add column if not exists product text not null default 'standard',
  add column if not exists parent_order_id uuid references public.orders(id) on delete set null;

alter table public.orders drop constraint if exists orders_product_check;
alter table public.orders
  add constraint orders_product_check check (product in ('standard', 'upgrade'));

alter table public.orders drop constraint if exists orders_upgrade_has_parent;
alter table public.orders
  add constraint orders_upgrade_has_parent
  check (product = 'standard' or parent_order_id is not null);

-- One order per submission *per product* (was: one per submission).
alter table public.orders drop constraint if exists orders_submission_id_key;
create unique index if not exists orders_submission_product_idx
  on public.orders (submission_id, product);
create index if not exists orders_parent_idx on public.orders (parent_order_id);

-- Ongoing access: no preset purchase-access expiry. The column stays for
-- explicit, per-order revocation or a future retention policy.
update public.orders set report_expires_at = null where report_expires_at is not null;

-- access_tokens: email-delivered links no longer expire by default
alter table public.access_tokens alter column expires_at drop not null;

-- reports: which tier the content is, schema version, rendered page count
alter table public.reports
  add column if not exists tier text not null default 'standard',
  add column if not exists schema_version integer not null default 1,
  add column if not exists page_count integer;

alter table public.reports drop constraint if exists reports_tier_check;
alter table public.reports
  add constraint reports_tier_check check (tier in ('standard', 'detailed'));

-- research_sources: provenance detail for statistics
alter table public.research_sources
  add column if not exists published_date text,
  add column if not exists geography text,
  add column if not exists unit text,
  add column if not exists period text,
  add column if not exists claim_type text;

alter table public.research_sources drop constraint if exists research_sources_claim_type_check;
alter table public.research_sources
  add constraint research_sources_claim_type_check
  check (claim_type is null or claim_type in ('historical', 'forecast', 'other'));

-- submissions: the eight-question schema is version 2; old rows stay version 1
alter table public.submissions alter column answers_version set default 2;

-- delivery_attempts: the detailed report has its own delivery kind
alter table public.delivery_attempts drop constraint if exists delivery_attempts_kind_check;
alter table public.delivery_attempts
  add constraint delivery_attempts_kind_check
  check (kind in ('confirmation', 'report', 'detailed_report', 'recovery', 'owner_alert'));

-- Row level security is inherited by the altered tables; nothing to re-enable.
