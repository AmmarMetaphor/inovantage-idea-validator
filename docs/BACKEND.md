# Backend: setup and operations

The backend is a set of Netlify Functions (TypeScript) over Supabase (Postgres
+ private storage), Stripe Checkout, the Anthropic API and Resend. The
browser never talks to Supabase, Stripe's API or Anthropic directly.

## Architecture

```
Browser ──POST /api/create-submission──▶ submissions (validated server-side)
        ──POST /api/create-checkout────▶ orders + Stripe Checkout Session (server-set Price)
        ──redirect to Stripe hosted checkout
Stripe  ──POST /api/stripe-webhook─────▶ verify signature on raw body
                                          ledger row (unique event id)
                                          re-read session from Stripe, verify paid/amount/currency/price/order
                                          mark order paid (unique payment intent)
                                          create job row  ◀── durable before 200 is returned
                                          kick worker (authenticated)
Browser ──GET /api/checkout-result─────▶ same verification via Stripe retrieval; mints access token
Worker  (report-worker-background, 15-min limit, Bearer WORKER_SECRET)
          claim job (atomic lease) → confirm email → research → compose → render PDF → deliver email
          checkpoint after each stage; bounded retries with backoff
Cron    (dispatch-jobs, every 5 min, 30-s limit)
          recover expired leases, expire abandoned checkouts, invoke worker for queued jobs
Browser ──POST /api/report-status / report-download / recover-report (token in body)
```

Everything a customer can reach is keyed by an unguessable 256-bit token that
is stored hashed. Order and submission ids are random UUIDs and are never
exposed; customers see an 8-character short reference only.

## 1. Supabase

1. Create a project. Note the project URL and the **service role** key
   (Project Settings → API). The anon key is not used.
2. Apply the migrations in order. With the Supabase CLI:

   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```

   Or paste each file from `supabase/migrations/` into the SQL editor in
   filename order:

   | File | Creates |
   | --- | --- |
   | `20261014000100_core_schema.sql` | submissions, orders, jobs, research_sources, reports, report_claims, access_tokens, webhook_events, delivery_attempts, rate_limits |
   | `20261014000200_security.sql` | RLS enabled and forced on every table, no policies, all grants revoked from `anon`/`authenticated` |
   | `20261014000300_storage.sql` | private `reports` bucket (PDF only, 20 MB cap) |
   | `20261014000400_functions.sql` | `claim_job`, `extend_job_lease`, `recover_stalled_jobs`, `consume_rate_limit`, `prune_rate_limits` (service role only) |

3. Verify the lockdown: with the anon key, `select * from orders` must fail.

## 2. Stripe

1. Products → add a product "Idea feasibility report" with a **one-time**
   price of **£24.00 (GBP)**. Copy the Price ID (`price_…`) into
   `STRIPE_PRICE_ID`. The server checks at checkout time that this price is
   2400 GBP; a mismatch is refused with a setup error.
2. Developers → Webhooks → add an endpoint:

   ```
   POST https://<your-site>/api/stripe-webhook
   ```

   Events: `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`.
   Copy the signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.
3. For local testing: `stripe listen --forward-to localhost:8888/api/stripe-webhook`
   and use the printed `whsec_` as the local webhook secret.

Fulfilment rules the code enforces:

- Signature is verified on the raw request body (`req.text()`), never on parsed JSON.
- Every event is written to `webhook_events` (unique per provider + event id)
  before processing. Duplicates return 200 without side effects; a concurrent
  in-flight duplicate gets 409 so Stripe retries later.
- The session is re-read from Stripe and must be `mode=payment`,
  `payment_status=paid`, carry our order id in both `metadata` and
  `client_reference_id`, match the session id stored on that order, equal the
  order's amount and currency, and contain exactly one unit of
  `STRIPE_PRICE_ID`.
- The order flips to paid with a conditional update (only from
  `pending_payment`) and a unique payment-intent constraint.
- The job row is created before the 200 is sent. If anything fails, the event
  is marked `failed` and a 500 makes Stripe retry.
- The browser's success redirect never fulfils by itself: `checkout-result`
  retrieves the session from Stripe server-side and runs the same checks.

## 3. Anthropic

Set `ANTHROPIC_API_KEY`. The default model is `claude-opus-5-5`
(`ANTHROPIC_MODEL` overrides). Research uses the server-side web search tool
restricted to the customer's market; composition uses structured outputs
against `netlify/lib/report-schema.ts`. A refusal is recorded as a
non-retryable failure and alerts the owner.

For staging without API spend, `REPORT_GENERATOR=stub` produces a clearly
labelled placeholder. It is refused when `CONTEXT=production`.

## 4. Resend

Verify your sending domain, create an API key, and set `RESEND_API_KEY` and
`EMAIL_FROM` (a verified sender). The report email attaches the PDF.

## 5. Netlify

Environment variables (Site configuration → Environment variables). Use
`.env.example` as the checklist. Required for production:

| Variable | Notes |
| --- | --- |
| `VITE_DEMO_MODE` | must be `false` in production; the build fails otherwise |
| `APP_URL` | public origin, e.g. `https://ideas.example.com`. Scope it per deploy context; unset, the code uses `DEPLOY_PRIME_URL` (this deploy) then `URL` (production) |
| `IP_HASH_SALT`, `WORKER_SECRET` | random; worker secret ≥ 32 chars |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | server only |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | |
| `ANTHROPIC_API_KEY` | `REPORT_GENERATOR` must be `anthropic` |
| `RESEND_API_KEY`, `EMAIL_FROM` | |

Optional: `EMAIL_REPLY_TO`, `OWNER_ALERT_EMAIL`, `ANTHROPIC_MODEL`,
`REPORT_ACCESS_DAYS` (90), `TOKEN_TTL_DAYS` (30), `RECOVERY_TOKEN_TTL_DAYS` (7).

Background functions and scheduled functions need a Netlify plan that
includes them. Check `GET /api/health` after deploying: it reports which
configuration groups are present (variable names only). It does **not** call
Supabase, Stripe, Anthropic or Resend, so `ready: true` means "configured",
not "connected"; the end-to-end test below is what proves connectivity. Any
endpoint that lacks its configuration returns
`503 { error: "not_configured", missing: [...] }` instead of pretending to work.

Runtime limits this design respects (verify against Netlify's current docs
before changing stage boundaries): synchronous functions must answer quickly
(the handlers do a handful of database calls and at most one Stripe call);
`report-worker-background` relies on the 15-minute background limit; the
dispatcher runs under the 30-second scheduled limit and only *invokes* workers.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/create-submission` | rate limit 10/h per IP | validate and store answers → `{ submissionId }` |
| POST | `/api/create-checkout` | 10/h per IP | create order + Stripe session → `{ checkoutUrl, orderRef }` |
| POST | `/api/stripe-webhook` | Stripe signature | fulfil paid sessions |
| GET | `/api/checkout-result?session_id=` | 60/10 min per IP | `{ state, reportPath }` after server-side verification |
| POST | `/api/report-status` `{ token }` | token, 120/10 min | minimal status |
| POST | `/api/report-download` `{ token }` | token, 30/10 min | 120-second signed PDF URL |
| POST | `/api/recover-report` `{ email }` | 5/15 min per IP, 3/day per email | always `{ ok: true }`; emails the original order address only |
| POST | `/.netlify/functions/report-worker-background` | `Bearer WORKER_SECRET` | run one job |
| cron | `dispatch-jobs` | Netlify scheduler | recovery and dispatch every 5 minutes |
| GET | `/api/health` | none | configuration readiness (names only) |

## Jobs: leases, checkpoints, retries

- `claim_job` is a single `UPDATE … RETURNING` guarded by status, due time,
  attempt count and lease expiry, so exactly one worker wins.
- The worker heartbeats `extend_job_lease` every 60 s; a worker that dies
  leaves an expired lease that the dispatcher resets to `queued`.
- Each stage checks the database before working (`delivery_attempts`,
  `research_sources`, `reports.content`, `reports.pdf_object_path`), so a
  retry after a crash in `deliver` never calls the model or renders again.
- Retries back off 1, 5, 15, 60, 180 minutes; after `max_attempts` (5) the
  job is `dead`, the order is `failed`, and `OWNER_ALERT_EMAIL` is notified.
- To re-run a dead job after fixing the cause:

  ```sql
  update jobs set status='queued', attempts=0, run_after=now(), last_error=null where id='<job id>';
  update orders set status='paid', failed_reason=null where id='<order id>';
  ```

## Privacy and logging

- Logs are JSON with key-based redaction (`netlify/lib/log.ts`): tokens,
  secrets, emails, answers and report text never appear.
- Access tokens are 32 random bytes; only `sha256` hashes are stored. Tokens
  travel in POST bodies, never query strings.
- `/report/*` and `/checkout/*` are served with `Referrer-Policy: no-referrer`,
  `X-Robots-Tag: noindex` and `Cache-Control: no-store`; the app also sets a
  no-referrer meta tag.
- PDFs live in the private `reports` bucket; downloads use 120-second signed
  URLs minted only for a valid token.
- Rate limits are per hashed IP (and per hashed email for recovery). The
  submission form carries a honeypot field.

## Tests

`npm test` runs Vitest against in-memory persistence with Stripe's real
signature algorithm:

- `tests/webhook.test.ts`: forged signatures, tampered amounts/products,
  cross-order metadata, unpaid sessions, duplicate and concurrent deliveries,
  retry after a failed attempt.
- `tests/access.test.ts`: unknown/expired/revoked tokens, unpaid orders,
  cross-customer isolation, download gating, recovery behaviour.
- `tests/jobs.test.ts`: stage checkpoints, interrupted compose, failed email
  retry without regeneration, lease exclusivity, stalled-lease recovery,
  bounded retries, worker auth.
- `tests/submission.test.ts`: body limits, server validation, unknown-key
  stripping, honeypot, server-owned price, setup errors, log redaction.
