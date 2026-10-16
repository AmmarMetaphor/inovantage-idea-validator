# Owner pilot: checklist

Goal: run the real pipeline (questionnaire → Anthropic research → report →
PDF in private Supabase Storage → Resend email) for the owner only, without
Stripe. Stripe is added later.

Status of what has been verified: everything below has been checked locally
with unit tests and a production build. **No step has yet been run against
live Supabase, Anthropic or Resend accounts.** The end-to-end test in step 7
is the first real run.

## 1. New migration to run

Run this one file in the Supabase SQL editor (or `supabase db push`). It only
adds columns, an index and check constraints; it does not touch applied
migrations or RLS:

1. `supabase/migrations/20261015000500_pilot_orders.sql`
2. `supabase/migrations/20261016000600_products_and_access.sql`
3. `supabase/migrations/20261016000700_pilot_authorised_status.sql`

Then run `supabase/verify_rls.sql` and confirm every one of the ten tables
shows `rls_enabled = true`, `rls_forced = true`, `policy_count = 0`,
`anon_can_select = false`, `authenticated_can_select = false`, and that the
`reports` bucket shows `public = false` with no storage policies.

## 2. Generate the secrets privately

On your own computer, in a terminal. Do not paste the results anywhere except
the Netlify environment variable form.

```bash
openssl rand -hex 32    # → WORKER_SECRET
openssl rand -hex 32    # → PILOT_SESSION_SECRET
openssl rand -hex 16    # → IP_HASH_SALT
```

For `PILOT_OWNER_PASSWORD` use a password manager to generate at least 16
characters, or `openssl rand -base64 18`.

## 3. Netlify environment variables

Site configuration → Environment variables. Scope each to the deploy context
you are testing on ("Branch deploys" or "Deploy previews" for a test branch;
"Production" only when you intend the live site to run it).

| Name | Value | Notes |
| --- | --- | --- |
| `VITE_DEMO_MODE` | `false` | Public (compiled into the site). Without it the questionnaire never calls the server. |
| `APP_URL` | `https://<this deploy's address>` | The address of the deploy you test on. Used in emails and worker calls. |
| `IP_HASH_SALT` | generated | Secret |
| `WORKER_SECRET` | generated, ≥ 32 chars | Secret |
| `SUPABASE_URL` | `https://<ref>.supabase.co` | |
| `SUPABASE_SERVICE_ROLE_KEY` | your `sb_secret_…` key | Secret. Legacy `service_role` JWT also accepted; a publishable/anon key is rejected. |
| `ANTHROPIC_API_KEY` | key from the metaphorconsultants Console org | Secret |
| `REPORT_GENERATOR` | `anthropic` | Or leave unset (same default). Never `stub` for a real pilot. |
| `ANTHROPIC_MODEL` | leave unset | Default `claude-opus-5-5`. |
| `RESEND_API_KEY` | from Resend | Secret |
| `EMAIL_FROM` | `Inovantage Idea Validator <reports@your-verified-domain>` | Must be on a domain verified in Resend. |
| `PILOT_MODE` | `true` | Secret-side flag. Remove it to disable the pilot. |
| `PILOT_OWNER_PASSWORD` | generated, ≥ 12 chars | Secret. Never a `VITE_` variable. |
| `PILOT_SESSION_SECRET` | generated, ≥ 32 chars | Secret |
| `OWNER_ALERT_EMAIL` | `support@metaphorconsultants.com` | Optional: dead-job alerts. |

Not needed for the pilot: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRICE_ID`. Without them `/api/create-checkout` and
`/api/stripe-webhook` answer 503 `not_configured` and change nothing.

Delivery allowlist: `support@metaphorconsultants.com` is built in. Only set
`PILOT_ALLOWED_EMAILS` if that must change.

## 4. Branch and page

- Git branch for Netlify to deploy: `claude/nice-edison-rcf4lc`
- Owner test page: `https://<deploy>/owner/pilot` (not linked from the site,
  `noindex`, `no-store`).
- Private PDF bucket: `reports` (objects at `orders/<order id>/report-v1.pdf`).

## 5. Pre-flight

Open `https://<deploy>/api/health`. Expect `pilot.enabled: true` and
`pilot.ready: true`. `ready` (the full launch check) will be `false` because
Stripe is absent; that is correct for the pilot. The health check confirms
variable presence only, not that the services accept the keys.

Optional but recommended from your machine, using the **publishable** key:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLIC_KEY=sb_publishable_... node scripts/verify-rls.mjs
```

Every line must start with `OK`.

## 6. Run one pilot report

1. Go to `/owner/pilot`, enter the owner password. You get a two-hour session.
2. Click **Start a pilot report**. The real six-step questionnaire opens with
   `support@metaphorconsultants.com` pre-filled as the delivery address.
   Use a recognisable working name such as `Pilot 1 — mobile dog grooming`.
   The form is eight questions over three screens.
3. On the review page, confirm the email and click **Create pilot report (no
   payment)**. The server answers as soon as the order and job rows exist and
   the browser moves straight to `/report/<token>` in the same tab. The
   pilot timeline reads: Submission received → Queued for research →
   Researching → Writing your report → Report ready → Email sent. No payment
   step is shown and the order is recorded as `authorised`, never `paid`.
4. Expect two emails at the pilot address: an order confirmation (the page
   notes it separately), then the report with the two-page PDF attached and
   a private link. "Email sent" on the page means the report email was
   accepted by Resend. The email is a way back to the page, never a required
   step to reach it.
5. Confirm the link works with no account: open it in a private browser
   window, read the web report, then click **Download PDF**. Each click mints
   a fresh storage URL; there is no customer-facing deadline.
6. While still signed in on `/owner/pilot`, click **Get the detailed report**
   on the report page: for a pilot order this creates a pilot upgrade (no
   Stripe) and runs the detailed pipeline; a third email with the detailed PDF
   should follow.

## 7. Where to look if it fails

- **`/api/health`** shows 503 with `missing: [...]`: a variable is absent on
  this deploy context.
- **Owner page says pilot mode is off**: `PILOT_MODE` is not exactly `true`
  on the context you opened.
- **Netlify → Logs → Functions**, filter by function:
  - `pilot-order`: `pilot.order` with `order_id`, `job_id`, `job_created`.
  - `report-worker`: `job.claimed`, then `job.stage_start` /
    `job.stage_done` for `confirm`, `research`, `compose`, `render`,
    `deliver`, then `job.succeeded`. A `job.failed` line carries the error
    and `retry_at`. `PilotDeliveryBlocked` means the order's address was not
    on the allowlist.
  - `dispatch-jobs` every five minutes: `dispatch.done` with `recovered` and
    `dispatched` counts. If the worker was never kicked (for example a site
    password blocked the internal call), this is what picks the job up.
- **Supabase → Table editor** (service role, in the dashboard):

  ```sql
  select id, source, product, status, authorised_by, authorised_at, amount_minor, paid_at, fulfilled_at
    from orders order by created_at desc limit 3;   -- pilot rows: status authorised, paid_at null
  select status, stage, attempts, last_error, lease_expires_at
    from jobs order by created_at desc limit 3;
  select status, model, input_tokens, output_tokens, pdf_object_path, verdict
    from reports order by created_at desc limit 3;
  select kind, status, provider_message_id, error, created_at
    from delivery_attempts order by created_at desc limit 6;
  select count(*) as sources from research_sources
    where order_id = (select id from orders order by created_at desc limit 1);
  ```

- **Supabase → Storage → reports**: the PDF object for the order.
- **Resend → Emails**: both messages with status delivered; the
  `provider_message_id` in `delivery_attempts` matches.
- **Anthropic Console → Usage**: two requests (research with web search,
  composition) for the pilot run.

To re-run a dead job after fixing the cause:

```sql
update jobs set status = 'queued', attempts = 0, run_after = now(), last_error = null where id = '<job id>';
update orders set status = 'paid', failed_reason = null where id = '<order id>';
```

The dispatcher will pick it up within five minutes.

## 8. After the pilot

Remove `PILOT_MODE` (or set it to anything but `true`) on every context before
the public launch. Pilot orders remain in the database clearly marked
`source = 'pilot'`, `amount_minor = 0`.
