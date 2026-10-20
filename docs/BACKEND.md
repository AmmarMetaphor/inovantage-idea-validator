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

1. Create a project. Note the project URL and a **server** key
   (Project Settings → API keys). Supabase now issues `sb_secret_…` keys;
   the legacy `service_role` JWT also works. Put either in
   `SUPABASE_SERVICE_ROLE_KEY`. The public (`sb_publishable_…` / anon) key is
   never used by this code and is rejected if placed in that variable.
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
   | `20261015000500_pilot_orders.sql` | pilot columns on orders/submissions, idempotency index, extended check constraints (adds only) |
   | `20261016000600_products_and_access.sql` | `orders.product` / `parent_order_id` (one order per submission *per product*), `reports.tier` / `page_count`, source provenance columns, nullable token expiry, clears preset access expiries (adds only) |
   | `20261016000700_pilot_authorised_status.sql` | `orders.status = 'authorised'` for pilot orders (never `paid`), `authorised_at`, moves existing pilot rows from paid to authorised (adds only) |

3. Verify the lockdown two ways: run `supabase/verify_rls.sql` in the SQL
   editor (every table must show `rls_enabled`, `rls_forced`, zero policies,
   no anon/authenticated SELECT), and run
   `SUPABASE_URL=… SUPABASE_PUBLIC_KEY=sb_publishable_… node scripts/verify-rls.mjs`
   from your machine, which tries to read every table and the PDF bucket
   with a public key and must report every check as OK.

## 2. Stripe

Environment variables (exact names, all read in `netlify/lib/env.ts`):

| Variable | What it is |
| --- | --- |
| `STRIPE_SECRET_KEY` | Secret key (`sk_test_…` while testing; `sk_live_…` only at launch) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the webhook endpoint below (`whsec_…`) |
| `STRIPE_PRICE_ID_STANDARD` | Price ID of the £17 one-time Price (`price_…`) |
| `STRIPE_PRICE_ID_UPGRADE` | Price ID of the £34 one-time Price (`price_…`) |
| `APP_URL` | Public origin used for success/cancel URLs, e.g. `https://inovantage-idea-validator.netlify.app` (unset: `DEPLOY_PRIME_URL`, then `URL`) |

Prices live in `src/config/product.ts` (1700 and 3400 GBP); the browser
never sends an amount. The server re-reads each Price at checkout time and
refuses to create a session if its amount, currency, type (one-time) or
active flag differs.

### Dashboard setup (test mode)

1. **Products.** Products → add two products, each with one **one-time** GBP
   price:

   | Product name | Price | Variable for its Price ID | Server expects |
   | --- | --- | --- | --- |
   | Idea Validation Report | £17.00 | `STRIPE_PRICE_ID_STANDARD` | 1700 GBP |
   | Detailed Report Upgrade | £34.00 | `STRIPE_PRICE_ID_UPGRADE` | 3400 GBP |

   A Stripe Price is immutable. If a 3500 GBP Price exists from the earlier
   £35 configuration, create a new 3400 Price on the same Product, point
   `STRIPE_PRICE_ID_UPGRADE` at it and archive the old one. Until then the
   upgrade checkout is refused (`verifyPrice` mismatch); nothing is charged.

2. **Webhook.** Developers → Webhooks → **Add destination** (or "Add
   endpoint"):

   - Endpoint URL: `https://<your-site>/api/stripe-webhook`; for the
     production Netlify site that is
     `https://inovantage-idea-validator.netlify.app/api/stripe-webhook`
     (`netlify.toml` maps `/api/*` to the function `stripe-webhook`; the
     path is fixed, the host is whatever Netlify serves the site on, so a
     branch deploy needs its own endpoint while testing).
   - Events to send, exactly these four:
     `checkout.session.completed`,
     `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`,
     `checkout.session.expired`.
     Any other event is acknowledged and ignored.
   - **Payload style: snapshot** (the classic full-object payload). The
     handler reads `data.object.id` from the event; "thin" payloads do not
     carry it.
   - **API version:** the version pinned by the installed SDK. `GET
     /api/health` reports it under `stripe.apiVersion` (the SDK sets no
     override, so it is the SDK's own default). The handler only reads the
     session id from the event and re-fetches the session with the SDK, so a
     version mismatch on the endpoint does not break fulfilment, but keeping
     them equal avoids surprises in the dashboard's event viewer.
   - Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

3. **Payment methods.** Sessions are created with
   `payment_method_types: ['card']`, so no delayed-notification methods are
   offered and `payment_status` is `paid` on `checkout.session.completed`.
   The `async_payment_*` events are still handled for the day that changes.

4. **Local testing:** `stripe listen --forward-to localhost:8888/api/stripe-webhook`
   and use the printed `whsec_` as the local webhook secret. Test card
   `4242 4242 4242 4242`, any future date, any CVC.

### Checkout flow the code enforces

- `POST /api/create-checkout { submissionId }` creates the order (unique per
  submission and product) and a hosted Checkout Session (`mode=payment`)
  carrying the order id in `client_reference_id`, `metadata.order_id` and
  the payment intent metadata. The session expires after 60 minutes.
- **One open session per order** (`netlify/lib/checkout.ts`): a repeat
  request returns the existing open session's URL (`reused: true`); once it
  has expired a new session is created and the superseded one is expired at
  Stripe, so a stale URL can never be paid for an order that points at a
  different session.
- The upgrade (`POST /api/create-upgrade-checkout { token }`) requires a
  valid report access token (the owner of that report), a paid standard
  order for the same submission, and no existing paid upgrade order.
- `cancel_url` returns to `/checkout?status=cancelled` (`&upgrade=1` for the
  upgrade), where "Return to review" reopens the review page with the draft
  answers still in the browser session.
- `success_url` is `/checkout/return?session_id={CHECKOUT_SESSION_ID}`. The
  page shows "Confirming your payment" at once and polls
  `GET /api/checkout-result`, which never trusts the URL: the session is
  retrieved from Stripe server-side and run through the same verification as
  the webhook before anything is marked paid.

Fulfilment rules the code enforces (`netlify/lib/fulfil.ts`):

- Signature is verified on the raw request body (`req.text()`), never on parsed JSON.
- Every event is written to `webhook_events` (unique per provider + event id)
  before processing. Duplicates return 200 without side effects; a concurrent
  in-flight duplicate gets 409 so Stripe retries later.
- The session is re-read from Stripe and must be `mode=payment`,
  `payment_status=paid`, carry our order id in both `metadata` and
  `client_reference_id`, match the session id stored on that order, equal the
  order's amount and currency, and contain exactly one unit of the Price for
  the order's product (`STRIPE_PRICE_ID_STANDARD` or `STRIPE_PRICE_ID_UPGRADE`).
  An upgrade session is also rejected unless its parent standard order is paid.
- `checkout.session.completed` with `payment_status` other than `paid` is
  ignored (order stays pending); `checkout.session.async_payment_succeeded`
  fulfils it later. `checkout.session.expired` and
  `checkout.session.async_payment_failed` move a **pending** order to
  `expired` (the customer can start a new checkout) and never touch a paid
  order.
- The order flips to paid with a conditional update (only from
  `pending_payment`) and a unique payment-intent constraint; the submission
  becomes `paid`; the job row is created (unique per order) before the 200 is
  sent and the background worker is invoked. Report generation never runs
  inside the webhook. If anything fails, the event is marked `failed` and a
  500 makes Stripe retry.
- Emails are sent only by the job stages and checked against
  `delivery_attempts`, so duplicate events or a second worker never send a
  second confirmation or report email.
- If the customer closes the browser after paying, the webhook alone fulfils
  and the confirmation email carries the private link.

### PILOT_MODE and the public checkout

`PILOT_MODE` does not change the public checkout. A pilot order can only be
created through `POST /api/pilot-order` behind the owner-page cookie, and
`create-checkout` refuses any pilot submission. Public visitors always go
through Stripe. To remove the payment bypass for launch, set
`PILOT_MODE=false` (or delete it) and delete `PILOT_OWNER_PASSWORD` and
`PILOT_SESSION_SECRET`: `/owner/pilot` and the pilot endpoints then answer
503 and nothing can be fulfilled without a verified payment. `/api/health`
shows `pilot.enabled: false`.

### Launch checklist

1. Test mode: run one real test-card purchase of the standard report and
   one upgrade; check `webhook_events` shows `processed`, the order is
   `paid` then `fulfilled`, exactly one job, and the two emails.
2. Switch the dashboard to live mode, create the two live Prices, add the
   live webhook endpoint (same URL, same four events, snapshot payload),
   and set the live `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_ID_STANDARD`, `STRIPE_PRICE_ID_UPGRADE` in Netlify's
   production context only.
3. `PILOT_MODE=false`, `VITE_DEMO_MODE=false`, redeploy, open `/api/health`.

## 3. Anthropic

Set `ANTHROPIC_API_KEY`. The default model is `claude-opus-5-5`
(`ANTHROPIC_MODEL` overrides). Research uses the server-side web search tool
restricted to the customer's market; composition uses structured outputs
with **no tools** in the request.

**Generation in parts.** The API compiles `output_config.format` into a
grammar and rejects large ones with HTTP 400 "The compiled grammar is too
large". Two shapes failed live: the full application model
(`netlify/lib/report-schema.ts`, 72 properties, 15 object shapes, 8 nullable
unions; `req_011Cg69DBbcWEcjBbUimXPtJ`) and a single flat object with 62
properties over 5 shapes (`req_011Cg6CEUVVA1hXsnDuoXcHH`). The published
limits (24 optional, 16 union parameters) were not the binding constraint;
the internal limit tracks total property count. Composition therefore runs
several small **parallel** requests, each with one flat object as its format
(`netlify/lib/generation-schema.ts`, `GENERATION_SCHEMAS`): no nested
objects, no unions, no enums, no optionals, no `$defs`, at most 16
properties, arrays no deeper than `number[][]`, and **no tools**.

| Part | Properties | Content |
| --- | --- | --- |
| `standard.verdict` | 15 | title, summary, verdict, scores, SWOT, limitations, claims |
| `standard.finance` | 16 | financial inputs (parallel arrays), chart, claims |
| `standard.action` | 13 | risks, improvements, experiment, sources used, claims |
| `detailed.sections` ×5 | 14 | two sections each (2+2+2+2+1 of the nine), claims |
| `detailed.summary` | 16 | title, executive summary, inputs, sensitivity, sources, limitations, claims |

`mapStandardParts` / `mapDetailedParts` merge the parts into the application
model. Every business rule lives in that mapping, on the server:

- lengths and counts are clamped to the editorial limits (two-page PDF);
- labels (verdict, basis, claim kind, confidence) are normalised, with
  conservative fallbacks recorded in the mapping diagnostics;
- sources are cited **by research id** (`[n]` in the prompt) and resolved
  from `research_sources`; ids that do not exist are dropped, an "evidence"
  claim or chart point without a valid id is downgraded, and the URL, title,
  publisher, date, geography and period always come from the research row,
  never from the model;
- unknowns stay explicit: `finance_known=false` and `0` scores become
  `null`; nothing is filled in with invented values.

**Grammar fallback.** If the API still rejects one part's grammar as too
large, that part alone is regenerated once without `output_config.format`
(the schema is quoted in the prompt), the text is parsed and validated with
the same Zod schema, and an invalid answer is retried once with the
validation errors. The job then continues; `compose.grammar_fallback` is
logged and `jobs.checkpoint.compose_fallbacks` lists the parts, so the owner
can see it happened. Any other API rejection stays non-retryable (below).

`npm run schema:dump` prints every schema the SDK sends (add `--print` for
the documents) with size metrics; `npx tsx scripts/capture-compose-request.mts`
captures the exact request bodies through a fake fetch (model, format bytes
and property count, tool count, system and message sizes);
`tests/generation.test.ts` fails if a schema grows past 16 properties or
gains unions, enums, `$defs` or constraints.

**Request rejections are not retried.** A 400/401/403/404/413/422 from the
API (`classifyApiError` in `research.ts`) becomes `GenerationRequestError`:
the job dies on that attempt, the research checkpoint is kept, a sanitised
diagnostic (`stage`, `status`, `error_type`, `request_id`, 200 characters of
the API message, the deploy's `COMMIT_REF`/`DEPLOY_ID`, no prompt text) is
stored in `jobs.checkpoint.api_error`
and `jobs.last_error`, `reports.status` becomes `failed`, the order becomes
`failed` and the owner is alerted. Rate limits, 5xx and network errors keep
the normal backoff. A refusal is non-retryable too.

**Timings.** `jobs.checkpoint.timings` records wall-clock milliseconds and
run counts per stage (`confirm`, `research`, `compose`, `render`, `deliver`),
and the worker logs `job.stage_timing` per stage.

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

## Owner pilot (no Stripe)

See `docs/PILOT.md` for the owner checklist. In short: `PILOT_MODE=true`
plus `PILOT_OWNER_PASSWORD` and `PILOT_SESSION_SECRET` enable
`/owner/pilot`. Login is validated server-side with a constant-time compare
and rate limited (5 per 15 minutes per IP). The session is a signed, two-hour,
Secure/HttpOnly/SameSite=Strict cookie. A pilot order is written as
`orders.source = 'pilot'`, `amount_minor = 0`, `authorised_by = 'owner_pilot'`
with no Stripe ids, then runs the identical job pipeline. Every email for a
pilot order is checked against `PILOT_ALLOWED_EMAILS` (default
`support@metaphorconsultants.com`) at send time; anything else is refused and
the job is marked dead. Submissions carry a browser-generated
`clientRequestId`, so a retried request returns the existing submission, order
and job rather than creating duplicates.

## Products, entitlements and the upgrade

`orders` are unique per (`submission_id`, `product`). The standard order is
created at the first checkout; an upgrade order (`product = 'upgrade'`,
`parent_order_id` = the standard order) is created when the customer clicks
the upgrade button on their report page. Each paid order gets exactly one job
(`jobs` unique per order) and one report (`reports` unique per order, `tier`
standard or detailed). Any access token for either order of a submission
opens the same report page; `/api/report-content` and `/api/report-download`
take `tier` and return the detailed tier only when the upgrade order is paid
and its report exists. Nothing premium is ever sent for an unpaid upgrade;
the web page's "preview" is static illustrative markup.

## Report access and retention

- **Stable link.** The customer's link is `/report/<token>`; email-delivered
  tokens have `expires_at = null` (no expiry). Tokens minted on the checkout
  return page or by recovery expire (`TOKEN_TTL_DAYS`, `RECOVERY_TOKEN_TTL_DAYS`)
  because fresh ones can always be issued by recovery.
- **No purchase-access expiry.** `REPORT_ACCESS_DAYS` defaults to 0, so
  `orders.report_expires_at` is null; migration 0006 nulls existing values.
  Setting it to a positive number is an explicit policy decision.
- **Downloads.** The PDF stays in the private `reports` bucket. Each download
  click calls `/api/report-download`, which mints a fresh 120-second storage
  URL. No deadline is shown to the customer; repeat downloads always work.
- **Revocation.** `access_tokens.revoked_at` is honoured on every request.
  `scripts/delete-order.mjs <submission id> --revoke-only` revokes every token
  for a submission (recovery can re-issue); without the flag it deletes the
  submission, its orders, jobs, research, reports, claims, tokens and delivery
  records (cascade) and the PDF objects.
- **Retention.** There is no automatic deletion job. Data is kept while the
  report is available; deletion is on request via the script above.
- **No token logging.** Tokens travel in POST bodies, the logger redacts
  token-like strings, and the private routes are served no-referrer/noindex.

## Progress states

`/api/report-status` derives the stage from records, never timers.
Stripe orders: `confirming_payment` (order pending) → `payment_confirmed`
(job queued; `confirmationEmailSent` says whether the confirmation email went
out) → `researching` (a worker is running the research stage) → `writing`
(compose/render) → `ready` (PDF stored) → `email_sent` (a `delivery_attempts`
row of kind `report` with status `sent`, i.e. Resend accepted the request).
Pilot orders never show a payment step: `submission_received` →
`queued_for_research` → `researching` → … and their status is `authorised`.
Each tier also carries `job: { state, attempts, nextRetryAt }` where state is
`queued`, `running`, `retrying`, `failed` or `done`, so the page can say
"retrying" honestly. `failed` and `expired` are terminal. The page polls
every 15 s while anything is in progress; refreshing or reopening the link
resumes from the server state.

After a successful submission the browser navigates to the report page first
and clears the questionnaire draft there (`location.state.clearDraft`). The
review page's incomplete-answers guard must never run after submission:
React Router commits navigations in a transition, so clearing the draft
before navigating let the guard redirect to question 1.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/create-submission` | rate limit 10/h per IP | validate and store answers → `{ submissionId }` |
| POST | `/api/create-checkout` | 10/h per IP | create order + Stripe session → `{ checkoutUrl, orderRef }` |
| POST | `/api/stripe-webhook` | Stripe signature | fulfil paid sessions |
| GET | `/api/checkout-result?session_id=` | 60/10 min per IP | `{ state, reportPath }` after server-side verification |
| POST | `/api/report-status` `{ token }` | token, 120/10 min | minimal status |
| POST | `/api/report-content` `{ token, tier }` | token, 120/10 min | structured report + computed financials (detailed only when paid) |
| POST | `/api/report-download` `{ token, tier }` | token, 60/10 min | fresh short-lived storage URL for the PDF |
| POST | `/api/create-upgrade-checkout` `{ token }` | token, 10/10 min | upgrade order + Stripe session (pilot: owner session → pilot upgrade) |
| POST | `/api/recover-report` `{ email }` | 5/15 min per IP, 3/day per email | always `{ ok: true }`; emails the original order address only |
| POST | `/.netlify/functions/report-worker-background` | `Bearer WORKER_SECRET` | run one job |
| cron | `dispatch-jobs` | Netlify scheduler | recovery and dispatch every 5 minutes |
| GET | `/api/health` | none | configuration readiness (names only; no connectivity checks) |
| POST | `/api/owner-login` `{ password }` | PILOT_MODE, 5/15 min per IP | sets the owner session cookie |
| GET | `/api/owner-session` | PILOT_MODE | `{ authenticated, allowedEmails, generator, model }` |
| POST | `/api/owner-logout` | PILOT_MODE | clears the cookie |
| POST | `/api/pilot-order` `{ answers, clientRequestId }` | owner cookie, 10/h per IP | explicit pilot order → `{ reportPath, orderRef }` |

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
- The standard report must render to exactly two A4 pages. If it does not,
  the runner clears the draft and re-runs compose with a "tighten" hint (up
  to twice) before failing; `reports.page_count` records the result.
- To resume **one** dead job from its checkpoint after fixing the cause, see
  "Resuming one failed job" in `docs/PILOT.md`. Never bulk-reset jobs and
  never delete `research_sources`: the compose stage re-reads them.

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
