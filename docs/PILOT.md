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
`pilot.ready: true`. `build.commit` is the git commit Netlify deployed
(`COMMIT_REF`): compare it with the commit you expect before running a pilot. `ready` (the full launch check) will be `false` because
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

### Resuming one failed job from its checkpoint

Use this after deploying a fix, for **one** job you have looked at. It keeps
the research checkpoint and sources, sends no email by itself (the
confirmation already in `delivery_attempts` is skipped by the runner), and
cannot start a duplicate run: `claim_job` only hands a job to one worker, and
the `where` clauses below refuse a job that is live or already finished.

1. Inspect the job and confirm it is the one you mean:

   ```sql
   select j.id, j.status, j.stage, j.attempts, j.max_attempts, j.lease_owner, j.lease_expires_at,
          j.checkpoint->>'research_done' as research_done,
          j.checkpoint->'api_error' as api_error,
          j.checkpoint->'timings' as timings,
          left(j.last_error, 200) as last_error,
          o.status as order_status, o.source, o.product, r.status as report_status
     from jobs j
     join orders o on o.id = j.order_id
     left join reports r on r.order_id = o.id
    where j.id = '<job id>';
   ```

   Expected for the grammar failure: `status = dead` (or `queued` with
   attempts near 5 on an old deploy), `stage = compose`,
   `research_done = true`, `order_status = failed`, `report_status = failed`
   or `generating`. `api_error.build.commit` (present from the second fix
   onwards) tells you which deploy produced the failure; `api_error.request_id`
   is the Anthropic request id for support.

   Do this only after `/api/health` shows `build.commit` equal to the commit
   carrying the fix. Re-queuing a job on the old deploy burns an attempt and
   repeats the same 400.

2. Put the order back to a fulfillable status. A pilot order goes back to
   `authorised`, a Stripe order to `paid`; the `where` guards keep the
   statement a no-op on anything else:

   ```sql
   -- pilot order
   update orders set status = 'authorised', failed_reason = null
    where id = (select order_id from jobs where id = '<job id>')
      and status = 'failed' and source = 'pilot' and authorised_by = 'owner_pilot';

   -- Stripe order (paid_at and stripe_payment_intent_id are already set)
   update orders set status = 'paid', failed_reason = null
    where id = (select order_id from jobs where id = '<job id>')
      and status = 'failed' and source <> 'pilot' and paid_at is not null;
   ```

3. Re-queue the job from its compose checkpoint. The research notes, sources
   and timings in `checkpoint` are kept; only the error record is cleared:

   ```sql
   update jobs
      set status = 'queued',
          attempts = 0,
          run_after = now(),
          last_error = null,
          finished_at = null,
          lease_owner = null,
          lease_expires_at = null,
          checkpoint = checkpoint - 'api_error'
    where id = '<job id>'
      and stage = 'compose'
      and status in ('dead', 'queued')
      and (lease_expires_at is null or lease_expires_at < now());
   ```

   If this updates 0 rows the job is running, finished, or not at the
   compose stage: stop and look again rather than forcing it.

4. Mark the report draft as regenerating so the status page shows progress:

   ```sql
   update reports set status = 'generating'
    where order_id = (select order_id from jobs where id = '<job id>')
      and status = 'failed';
   ```

5. The scheduled dispatcher picks the job up within five minutes
   (`dispatch.done` → `dispatched: 1`); the worker logs `job.claimed` with
   `stage: compose`, then `job.stage_timing` for `compose`, `render` and
   `deliver`. Research is not repeated. A `compose.grammar_fallback` line
   means a part was generated without a grammar (still validated); a
   second `job.request_rejected` means the fix did not take and the
   diagnostic in `checkpoint.api_error` is what to send to support.

### Measuring a pilot run

After a run finishes:

```sql
select j.checkpoint->'timings' as timings, j.started_at, j.finished_at,
       r.input_tokens, r.output_tokens, r.model, r.page_count
  from jobs j join reports r on r.order_id = j.order_id
 where j.id = '<job id>';
```

`timings.<stage>.ms` is wall-clock per stage (cumulative over retries, with
`runs` and `last_ms`). The five-minute target is met only if
`finished_at - started_at` for a single clean attempt is under five minutes;
the figures in this repository's tests come from the stub generator and say
nothing about live model latency.

## 8. After the pilot

Remove `PILOT_MODE` (or set it to anything but `true`) on every context before
the public launch. Pilot orders remain in the database clearly marked
`source = 'pilot'`, `amount_minor = 0`.
