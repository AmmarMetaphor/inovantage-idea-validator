# Inovantage Idea Validator — project guide

This file documents the product requirements and the implementation conventions
for this repository. Read it before changing anything.

## Product

A customer submits a business idea plus their personal business circumstances,
pays once, and receives an evidence-based feasibility report by email with a
downloadable PDF. No customer account exists or is planned.

- **Audience:** first-time founders, existing business owners, early-stage startups.
- **Markets:** United Kingdom, United States, Australia. One report covers one
  idea in one primary market.
- **Price:** working price £24 per report, charged once, in GBP for all markets.
  Lives in `src/config/product.ts` (`PRICE`); never hard-code it in copy.
- **Delivery:** email with a link to a status page and a PDF attachment.
  Target turnaround is in `TURNAROUND` in the same file.
- **Report-link recovery:** a customer who lost the email enters their address
  on `/find-report`; the backend re-sends. The page never reveals report data.

## Pages (all implemented in this frontend)

| Route                  | Component                 | Purpose                                      |
| ---------------------- | ------------------------- | -------------------------------------------- |
| `/`                    | `LandingPage`             | Branded landing page, pricing, FAQ           |
| `/validate/:step`      | `QuestionnairePage`       | Six-step questionnaire (1–6)                 |
| `/review`              | `ReviewPage`              | Answer review, email confirmation, checkout start |
| `/checkout`            | `CheckoutPage`            | Simulated checkout (demo) / cancelled return |
| `/checkout/return`     | `CheckoutReturnPage`      | Live return from Stripe; polls server verification |
| `/report/:token`       | `ReportStatusPage`        | Processing status and PDF download (token-gated) |
| `/sample-report`       | `SampleReportPage`        | Illustrative sample report                   |
| `/find-report`         | `RecoverPage`             | Report-link recovery by email                |
| `/terms` `/privacy` `/refunds` | `legal/*`         | Draft legal pages, marked for owner review   |
| `/owner/pilot`         | `OwnerPilotPage`          | Owner-only pilot (server-gated, not linked)  |

## Questionnaire

Defined declaratively in `src/questionnaire/schema.ts`. Six steps:

1. Idea, industry, business stage, problem, offer.
2. Customer, B2B/B2C, country, region/city, service area, alternatives.
3. Price and currency, revenue model, competitors, differentiation.
4. Capital, hours per week, experience, team/assets, income objective,
   timeframe. **Conditional:** existing businesses (stage `trading-new` or
   `trading-established`) are also asked about revenue, costs, customers and
   expansion plans.
5. Start-up, fixed and per-sale costs, acquisition plan, evidence of demand.
6. Constraints, biggest concern, email, required acknowledgements.

Rules:

- Every numeric estimate is an `estimate` field with an "I don't know yet"
  option. Do not add numeric fields that forbid "unknown" without a reason.
- Required fields are validated per step in `validate.ts`; the error summary at
  the top of the step links to each field. Back/edit navigation is always
  available (stepper, Back button, Edit links on review).
- Customers cannot jump past the furthest step they have reached via the URL.
- The review page requires the email to be typed a second time.

## State and privacy

- Answers live in React state (`src/questionnaire/store.tsx`). **Nothing is
  written to `localStorage`.** Session-only persistence can be switched on with
  `VITE_DRAFT_STORAGE=session`; it uses `sessionStorage` for the current tab.
- After a simulated payment the demo keeps only a report reference, a masked
  email and timestamps in `sessionStorage`, never the answers.
- No analytics, tracking or third-party scripts are loaded. The page sets
  `referrer: no-referrer`, and `/report/*` and `/checkout/*` are served
  `noindex` + `no-store` so private links never leak.

## Demo mode

`VITE_DEMO_MODE` controls simulation. Anything other than the literal string
`"false"` means demo mode is **on**, so a fresh clone previews safely.

In demo mode:

- A banner at the top of every page says checkout and processing are simulated.
- `createCheckout` returns an internal `/checkout?report=DEMO-…` route with
  "Simulate successful payment" and "Simulate cancelled payment" buttons.
- The status page walks through paid → researching → compiling → ready over
  about 22 seconds and then states that no PDF was generated.
- Recovery requests succeed without sending anything.

Never show simulated output as if it were a real customer report. Any mock
content must be labelled as demo or illustrative in the UI.

## Content rules

- Do not invent testimonials, customer names, market statistics, success rates
  or guarantees. The landing page and sample report contain none.
- The sample report is for a made-up business and uses bracketed placeholders
  where a real report would cite sources. Keep the "Illustrative content, not
  research" notice.
- Legal pages are drafts. Keep the `DraftBanner` and the yellow `[placeholder]`
  marks until the owner and a legal adviser sign them off.
- Copy uses British English, plain language, and never promises outcomes.

## Design conventions

- All colours, type, spacing, radii, shadows and motion are tokens in
  `src/styles/tokens.css`. Components use the variables, never raw values.
- **Brand assets were not available.** The wordmark is text and every colour is
  provisional; swap them in `tokens.css` only.
- Fonts are system stacks (serif for headings, sans for body) so no third-party
  requests or layout shift occur.
- Motion is restrained and disabled under `prefers-reduced-motion`.
- Forms: 44px minimum control height, visible focus rings, labels tied to
  inputs, `fieldset`/`legend` for grouped choices, `aria-describedby` for help
  and errors, `role="alert"` on error summaries.
- Layout works from 360px up with a 16px side gutter and no horizontal scroll.

## Tech

- React 19, TypeScript (strict), Vite 7, React Router 7. No UI framework.
- Path alias `@/` → `src/` in the frontend only. Files the server also
  imports (`src/config/product.ts`, `src/questionnaire/*.ts`) must use
  relative imports and must not touch `import.meta.env`; browser flags live
  in `src/config/runtime.ts`.
- `npm run build` runs the build guard, `tsc -b` (app, node, server and
  tests) then `vite build`. `npm test` runs Vitest. All must pass before commit.
- Secrets never go in the repo. `.env.example` holds placeholders only; any
  `VITE_` variable is public in the bundle.

## Backend (Netlify Functions + Supabase + Stripe + Anthropic + Resend)

Read `docs/BACKEND.md` before touching `netlify/` or `supabase/`.

- **Layout.** `netlify/functions/*.ts` are thin entry points. All logic is in
  `netlify/lib/`: `handlers/` (pure functions over a `Deps` object), `db/`
  (`types.ts` interface, `supabase.ts` production, `memory.ts` tests),
  `payments.ts` (Stripe), `mailer.ts` (Resend), `research.ts` (Anthropic +
  stub), `pdf.ts`, `jobs.ts` (runner), `fulfil.ts` (payment verification).
- **Trust boundaries.** The browser never gets a Supabase key, never sets a
  price, and never triggers generation. Only a verified Stripe session
  (webhook, or server-side retrieval on return) can mark an order paid, and
  that path creates the job row before acknowledging. All customer-facing
  reads require a 256-bit access token (stored hashed, expiring) sent in a
  POST body.
- **Jobs.** `claim_job` is atomic; stages `confirm → research → compose →
  render → deliver` are idempotent and checkpointed; retries are bounded
  with backoff; the scheduled dispatcher recovers expired leases. A change
  to a stage must keep it safe to re-run.
- **Migrations.** Add a new file under `supabase/migrations/` with the next
  timestamp; never edit an applied one (0001–0004 are applied in
  production; 0005 adds pilot columns). Every new table gets RLS enabled and
  forced with no policies, and grants revoked from `anon`/`authenticated`.
- **Config.** All env reads go through `netlify/lib/env.ts`. Missing values
  throw `ConfigError` → HTTP 503 listing variable names (never values).
  `REPORT_GENERATOR=stub` and demo mode are refused in production.
- **Logging.** Use the logger in `netlify/lib/log.ts`; never `console.log`
  customer data. Tokens, emails, answers and report text are redacted by key.
- **Pilot.** `PILOT_MODE=true` enables owner-only pilot orders
  (`netlify/lib/handlers/owner.ts`): `orders.source='pilot'`, amount 0,
  `authorised_by='owner_pilot'`, no Stripe ids, same job pipeline. Delivery
  is restricted to `env.pilotAllowedEmails` at send time in `jobs.ts`.
  Never relax that check, never read the pilot password anywhere but
  `env.ts`, and never put pilot secrets in `VITE_` variables.
- **Idempotency.** Submissions carry `client_request_id`; orders are unique
  per submission; jobs unique per order; email stages check
  `delivery_attempts`. Keep all four when touching the flow.
- **Tests.** `tests/` cover forged/duplicate/concurrent payment events,
  unpaid and cross-customer access, link recovery, interrupted jobs,
  bounded retries, the owner session and pilot allowlist. Add a test for
  every new trust boundary.

## What remains for the owner

- Apply the migrations, create the Stripe product and webhook, set the
  environment variables, and switch `VITE_DEMO_MODE=false` in production.
- Legal review of terms, privacy and refund pages; final brand assets.
