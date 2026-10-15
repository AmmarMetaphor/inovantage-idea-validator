-- 0005 Owner pilot: explicit non-Stripe orders, idempotent submissions.
--
-- Pilot orders are created by the owner from a password-protected page while
-- PILOT_MODE is on. They are never Stripe payments: source = 'pilot',
-- amount_minor = 0, no Stripe ids, and authorised_by = 'owner_pilot'.
-- Nothing in the earlier migrations is modified; this file only adds.

-- orders: where the order came from and who authorised fulfilment
alter table public.orders
  add column if not exists source text not null default 'stripe',
  add column if not exists authorised_by text;

alter table public.orders drop constraint if exists orders_source_check;
alter table public.orders
  add constraint orders_source_check check (source in ('stripe', 'pilot'));

alter table public.orders drop constraint if exists orders_authorised_by_check;
alter table public.orders
  add constraint orders_authorised_by_check
  check (authorised_by is null or authorised_by in ('stripe_webhook', 'checkout_return', 'owner_pilot'));

-- Pilot orders carry no charge; Stripe orders must still be positive.
alter table public.orders drop constraint if exists orders_amount_minor_check;
alter table public.orders
  add constraint orders_amount_minor_check
  check (amount_minor >= 0 and (source = 'pilot' or amount_minor > 0));

-- A Stripe order must never be marked paid without a payment intent;
-- a pilot order must never carry one.
alter table public.orders drop constraint if exists orders_payment_source_consistency;
alter table public.orders
  add constraint orders_payment_source_consistency
  check (
    (source = 'pilot' and stripe_payment_intent_id is null and stripe_checkout_session_id is null)
    or (source = 'stripe' and (status not in ('paid', 'fulfilled') or stripe_payment_intent_id is not null))
  );

create index if not exists orders_source_idx on public.orders (source);

-- submissions: idempotency key from the browser and origin flag
alter table public.submissions
  add column if not exists client_request_id text,
  add column if not exists source text not null default 'public';

alter table public.submissions drop constraint if exists submissions_source_check;
alter table public.submissions
  add constraint submissions_source_check check (source in ('public', 'pilot'));

create unique index if not exists submissions_client_request_id_idx
  on public.submissions (client_request_id) where client_request_id is not null;

-- access_tokens: tokens handed to the owner on the pilot page
alter table public.access_tokens drop constraint if exists access_tokens_issued_via_check;
alter table public.access_tokens
  add constraint access_tokens_issued_via_check
  check (issued_via in ('checkout_return', 'email', 'recovery', 'pilot'));

-- delivery_attempts: owner alerts are recorded too
alter table public.delivery_attempts drop constraint if exists delivery_attempts_kind_check;
alter table public.delivery_attempts
  add constraint delivery_attempts_kind_check
  check (kind in ('confirmation', 'report', 'recovery', 'owner_alert'));

-- Row level security is inherited by the altered tables; nothing to re-enable.
