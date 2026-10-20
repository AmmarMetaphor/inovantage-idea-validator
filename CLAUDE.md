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
- **Products:** `PRODUCTS` in `src/config/product.ts` is the single source of
  truth for UI and server: Idea Validation Report £17 (1700 GBP) and the
  Detailed Report Upgrade £34 **additional** (3400 GBP; £51 combined). Never
  hard-code prices in copy; always say the upgrade is additional and never
  imply £34 is a total. `UPGRADE_INCLUDES` lists what the upgrade adds.
- **Report:** header with the idea readiness score out of 100, source
  confidence and assessment coverage (two separate facts, see Scoring),
  strongest supported opportunity and next action; market and execution
  factor cards with bars; criteria radar; market chart (evidence only, else
  labelled scenario or data gap); financial scenarios computed in code;
  risks; the illustrated four-week journey (see Journey); recommendations
  (action, purpose, measure); the first test; sources and limitations;
  locked previews of the detailed sections; the consultation line with a
  clickable support@inovantage.co.uk.
- **Journey:** "Your first four weeks in action" (`src/config/journey.ts`):
  Week 1 Listen, 2 Select, 3 Test, 4 Learn, each with one action and one
  measure the model writes within editorial limits, and a caveat for
  approvals, safety or long sales cycles. It is a suggested plan, labelled
  `PLAN_CAVEAT`, never a launch schedule, and never promises sales, demand
  or a score change. The artwork is original programmatic SVG from
  `SCENES`, chosen by `sceneFamilyFor(industry, revenueModel)` from the
  validated submission metadata, never from model text; the model never
  outputs SVG, HTML or layout. Online the milestones are real buttons
  (`aria-expanded`/`aria-controls`, Enter and Space, visible focus, reduced
  motion respected); there is no completion tracking because nothing
  persists it securely. Reports without a validated `plan` omit the section.
- **Delivery:** a private report page (interactive web report + PDF download)
  and an email with the PDF attached. No turnaround promise anywhere: use
  `DELIVERY_COPY` ("We'll email you when your report is ready").
- **Report-link recovery:** a customer who lost the email enters their address
  on `/find-report`; the backend re-sends. The page never reveals report data.

## Pages (all implemented in this frontend)

| Route                  | Component                 | Purpose                                      |
| ---------------------- | ------------------------- | -------------------------------------------- |
| `/`                    | `LandingPage`             | Branded landing page, pricing, FAQ           |
| `/validate/:step`      | `QuestionnairePage`       | Eight questions over three steps (1–3)       |
| `/review`              | `ReviewPage`              | Answer review, email confirmation, checkout start |
| `/checkout`            | `CheckoutPage`            | Simulated checkout (demo) / cancelled return |
| `/checkout/return`     | `CheckoutReturnPage`      | Live return from Stripe; polls server verification |
| `/report/:token`       | `ReportStatusPage`        | Processing status and PDF download (token-gated) |
| `/sample-report`       | `SampleReportPage`        | Illustrative sample report                   |
| `/find-report`         | `RecoverPage`             | Report-link recovery by email                |
| `/terms` `/privacy` `/refunds` | `legal/*`         | Draft legal pages, marked for owner review   |
| `/owner/pilot`         | `OwnerPilotPage`          | Owner-only pilot (server-gated, not linked)  |

## Questionnaire

Defined declaratively in `src/questionnaire/schema.ts` (version 3): eight
numbered questions over three steps. Fields sharing a `question` number
render as one compact question. Required answers are the minimum the
research needs; everything else is optional or allows "Not sure yet".

1. Business idea (plus optional working name).
2. Who would buy it, and what problem it solves.
3. Industry (searchable combobox; typed values are kept as "Other").
4. Launch country (UK/US/AU), optional city or region.
5. What makes the approach different (optional).
6. Revenue model and optional intended price ("Not sure yet" allowed).
7. Resources: budget ("Not sure yet"), weekly time, experience, stage, optional progress note.
8. Email and the two acknowledgements.

`schema-v2.ts` and `schema-v1.ts` keep the earlier shapes so reports for
existing submissions (`submissions.answers_version` 2 or 1) can still be
built. Do not delete or edit them; `buildBrief` picks the schema by version.

Rules:

- Every numeric estimate is an `estimate` field with a "Not sure" option and
  the report lists unknowns as gaps. Do not add compulsory sub-questions.
- Required fields are validated per step in `validate.ts`; the error summary at
  the top of the step links to each field. Back/edit navigation is always
  available (stepper, Back button, Edit links on review).
- Customers cannot jump past the furthest step they have reached via the URL.
- The review page requires the email to be typed a second time.
- After a successful submission, navigate to the report page **before**
  clearing the draft; the report page clears it on mount
  (`location.state.clearDraft`). Clearing first re-renders the review page's
  guard and sends the user back to question 1 (React Router navigations are
  transitions). `npm run test:e2e` is the regression test.

## State and privacy

- Answers live in React state (`src/questionnaire/store.tsx`) and, by
  default, in `sessionStorage` for the current tab so a refresh keeps the
  draft (`VITE_DRAFT_STORAGE=none` disables). **Nothing is written to
  `localStorage`.**
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
- The status page shows the real stage names but does not simulate progress:
  a demo order stays at "Payment confirmed (demo: no processing)".
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
  that path creates the job row before acknowledging. Checkout sessions are
  card-only `mode=payment`, one open session per order
  (`netlify/lib/checkout.ts` reuses it and expires a superseded one); the
  webhook path is `/api/stripe-webhook` with the four
  `checkout.session.*` events and snapshot payloads (see `docs/BACKEND.md`). All customer-facing
  reads require a 256-bit access token (stored hashed, expiring) sent in a
  POST body.
- **Jobs.** `claim_job` is atomic; stages `confirm → research → compose →
  render → deliver` are idempotent and checkpointed; retries are bounded
  with backoff; the scheduled dispatcher recovers expired leases. A change
  to a stage must keep it safe to re-run. The standard PDF must be exactly
  two pages (`ReportTooLong` triggers a tighter re-compose).
- **Products.** Orders are unique per (submission, product); upgrade orders
  carry `parent_order_id` and are fulfilled only if the parent is paid. Any
  token for a submission's orders opens the same report page; premium
  content is returned only when the upgrade order is paid.
- **Scoring.** `src/config/scoring.ts` is the single scoring model: nine
  criteria (five market, four execution; higher always more favourable),
  published weights (market 10 each, execution 12.5 each), 0–100 criterion
  scores with a basis (`evidence` | `assumption` | `insufficient`), and the
  overall "Idea readiness score" as the weighted mean computed in code.
  Insufficient criteria are excluded, never zero; the overall score is
  withheld ("Assessment incomplete") below six criteria or 60% of the
  weight. No floors, inflation, remapping or purchase-driven adjustment,
  ever; a low score is framed constructively (`readinessFraming`, "What
  could strengthen this idea") under `SCORE_DISCLAIMER` ("A directional
  assessment of the idea in its current form, not a probability of business
  success."). Two separate facts sit beside the score: **source
  confidence** (`sourceConfidence`: how many retrievable sources and how
  well dated, attributed and located) and **assessment coverage**
  (`assessmentCoverage`: how many of the nine criteria rest on evidence,
  assumption or are not assessed). Never merge them into one label.
  `src/config/headline.ts` derives the header fields (band, sources,
  coverage, framing, strongest supported opportunity, next action) from
  report data for both the web report and the PDF; keep them reading the
  same fields so counts match online and in print. Labels and badges are
  laid out by measurement (flex-wrap online, `labelledChip` in `pdf.ts`),
  never at a fixed offset, so long labels wrap instead of overlapping.
- **Reports.** `netlify/lib/report-schema.ts` holds the Zod schemas with
  editorial limits (nine scorecard items, recommendations with action,
  purpose and measure); it is the application model and is **never sent to
  Anthropic**. Composition runs several small parallel requests, one flat
  `netlify/lib/generation-schema.ts` part each (≤ 16 properties, no nested
  objects/unions/enums/optionals, no tools) and merges them explicitly;
  keep `tests/generation.test.ts` passing (`npm run schema:dump` shows what
  is sent). A part whose grammar is still rejected is regenerated once
  without a grammar and validated; any other API 4xx is non-retryable
  (`GenerationRequestError`) with a sanitised diagnostic in the checkpoint; `finance.ts` computes every scenario figure in code;
  `pdf.ts` renders the two-page standard and flowing detailed PDFs. Never let
  the model write financial tables or statistics without a listed source.
- **Access.** Email-delivered tokens do not expire; no purchase-access
  expiry by default; downloads mint fresh storage URLs on every click with
  no customer-facing deadline. Revocation and deletion: `scripts/delete-order.mjs`.
- **Migrations.** Add a new file under `supabase/migrations/` with the next
  timestamp; never edit an applied one (0001–0005 are applied in
  production; 0006 adds products/access, 0007 the pilot `authorised` status). Every new table gets RLS enabled and
  forced with no policies, and grants revoked from `anon`/`authenticated`.
- **Config.** All env reads go through `netlify/lib/env.ts`. Missing values
  throw `ConfigError` → HTTP 503 listing variable names (never values).
  `REPORT_GENERATOR=stub` and demo mode are refused in production.
- **Logging.** Use the logger in `netlify/lib/log.ts`; never `console.log`
  customer data. Tokens, emails, answers and report text are redacted by key.
- **Pilot.** `PILOT_MODE=true` enables owner-only pilot orders
  (`netlify/lib/handlers/owner.ts`): `orders.source='pilot'`, amount 0,
  status `authorised` (never `paid`), `authorised_by='owner_pilot'`, no
  Stripe ids, same job pipeline. Pilot progress labels never mention payment. Delivery
  is restricted to `env.pilotAllowedEmails` at send time in `jobs.ts`.
  Never relax that check, never read the pilot password anywhere but
  `env.ts`, and never put pilot secrets in `VITE_` variables.
- **Idempotency.** Submissions carry `client_request_id`; orders are unique
  per submission; jobs unique per order; email stages check
  `delivery_attempts`. Keep all four when touching the flow.
- **Tests.** `tests/` cover forged/duplicate/concurrent payment events,
  unpaid and cross-customer access, link recovery, interrupted jobs,
  bounded retries, the owner session and pilot allowlist, standard and
  upgrade pricing, unpaid premium content, real progress states, the
  two-page guard, finance maths, the scoring model and the eight-question
  schema. `tests/e2e/screenshots.mjs` renders the key screens. Add a test
  for every new trust boundary. `npm run pdf:samples` renders inspection PDFs.

## What remains for the owner

- Apply the migrations, create the Stripe product and webhook, set the
  environment variables, and switch `VITE_DEMO_MODE=false` in production.
- Legal review of terms, privacy and refund pages; final brand assets.
