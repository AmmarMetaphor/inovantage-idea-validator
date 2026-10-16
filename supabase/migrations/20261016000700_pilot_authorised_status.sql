-- 0007 Pilot orders are "authorised", never "paid".
--
-- Adds the 'authorised' order status (owner-authorised pilot fulfilment with
-- no payment) and an authorised_at timestamp. Existing pilot orders that were
-- recorded as 'paid' are moved to 'authorised' so progress pages never show
-- payment steps for them. Applied migrations are untouched; this only adds.

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending_payment', 'authorised', 'paid', 'fulfilled', 'failed', 'expired', 'refunded'));

alter table public.orders add column if not exists authorised_at timestamptz;

-- A Stripe order can never be 'authorised'; only pilot orders use it.
alter table public.orders drop constraint if exists orders_authorised_is_pilot;
alter table public.orders
  add constraint orders_authorised_is_pilot
  check (status <> 'authorised' or source = 'pilot');

-- Existing pilot orders: paid → authorised (fulfilled ones keep 'fulfilled').
update public.orders
   set status = 'authorised', authorised_at = coalesce(authorised_at, paid_at, created_at), paid_at = null
 where source = 'pilot' and status = 'paid';
