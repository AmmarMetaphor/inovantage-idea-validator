# Inovantage Idea Validator

A pay-once business idea validation report. A customer answers eight questions
over three short screens, pays £17, and receives an evidence-based two-page
report (interactive web version and PDF) on a private link, with an optional
detailed report upgrade for £34 additional (£51 combined). No account required.
Markets: UK, US and Australia.

The frontend runs in a labelled **demo mode** out of the box (no backend
needed). The real backend lives in `netlify/` (Netlify Functions), with
Supabase for data and private PDF storage, Stripe Checkout for payment, the
Anthropic API for research and composition, and Resend for email. Setting it
up is documented step by step in [`docs/BACKEND.md`](docs/BACKEND.md).

## Preview it on your computer (beginner steps)

1. Install **Node.js 20 or newer** from <https://nodejs.org> (choose the LTS
   download). This also installs `npm`.
2. Download this repository (green **Code** button → **Download ZIP**, then
   unzip) or clone it with Git.
3. Open a terminal in the project folder:
   - Windows: open the folder in Explorer, click the address bar, type `cmd`,
     press Enter.
   - macOS: right-click the folder → **New Terminal at Folder** (or open
     Terminal and `cd` into it).
4. Install the dependencies (one-off, takes a minute):

   ```bash
   npm install
   ```

5. Start the preview:

   ```bash
   npm run dev
   ```

6. Open the address it prints, usually <http://localhost:5173>, in your browser.
   Resize the window narrow to check the mobile layout, or use your browser's
   device toolbar.
7. Stop the preview with `Ctrl + C` in the terminal.

The site starts in **demo mode**. You can walk the whole journey: fill the
questionnaire, review, "pay" with the simulated checkout, and watch the status
page progress. Nothing is charged, sent or stored anywhere but your browser tab.

## Scripts

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Local preview with hot reload                  |
| `npm run build`     | Type-check and build the production site to `dist/` |
| `npm run preview`   | Serve the built `dist/` folder locally         |
| `npm run typecheck` | Type-check frontend, functions and tests       |
| `npm test`          | Run the backend security and pipeline tests    |

## Configuration

Copy `.env.example` to `.env` to change settings locally. All values in the
example file are placeholders; never commit real keys. The file documents
every variable; the two that matter for a local preview are:

| Variable             | Default | Meaning                                                   |
| -------------------- | ------- | --------------------------------------------------------- |
| `VITE_DEMO_MODE`     | `true`  | Simulate checkout and processing. Only `"false"` turns it off, and the production build refuses to run unless it is `false`. |
| `VITE_DRAFT_STORAGE` | `session` | Keeps the draft in this tab across refreshes. `none` keeps it in memory only. localStorage is never used. |

Backend variables (Supabase, Stripe, Anthropic, Resend, worker secret) are
server-side only and are listed in `.env.example` and `docs/BACKEND.md`.

Product settings (price, markets, turnaround, support email) live in
`src/config/product.ts`. Design tokens live in `src/styles/tokens.css`.

## Deploying to Netlify

`netlify.toml` is ready: build command `npm run build`, publish `dist`,
`/api/*` rewritten to Netlify Functions, private-route headers, and an SPA
fallback so deep links such as `/report/<token>` work. Connect the repository
in Netlify, set the environment variables in the Netlify UI (never in the
repo), apply the Supabase migrations, and register the Stripe webhook at
`https://<your-site>/api/stripe-webhook`. Full checklist: `docs/BACKEND.md`.

Going live means setting `VITE_DEMO_MODE=false` in the production context.
The build fails on purpose if that is missing, so demo mode can never face a
paying customer.

## Project layout

```
src/
  components/      Layout, buttons, notices, form field renderer, stepper
  config/          product.ts (price, markets), runtime.ts (browser flags)
  lib/api.ts       API client; simulated in demo mode, live otherwise
  pages/           One file per route; legal/ holds the draft policies
  questionnaire/   schema (6 steps), validation, in-memory store, helpers
  styles/          tokens.css (design tokens), global, components, page styles
netlify/
  functions/       One file per endpoint (thin wrappers), worker, dispatcher
  lib/             env, logging, db (Supabase + in-memory), payments, mailer,
                   research (Anthropic + stub), pdf, jobs, fulfilment, handlers
supabase/migrations/  Versioned SQL: schema, RLS lockdown, storage, functions
tests/           Vitest suites for payment forgery, duplicates, access, jobs
docs/BACKEND.md  Setup, environment variables, endpoints, operations
```

## Demo mode versus live

- **Demo mode** (`VITE_DEMO_MODE` not `false`): checkout and report progress
  are simulated in the browser, labelled on every page, and no request leaves
  the browser. Nothing is stored except a short demo reference in the tab.
- **Live mode** (`VITE_DEMO_MODE=false`): the browser calls the Netlify
  Functions. Payment goes through Stripe's hosted checkout; the webhook (and
  only server-side verification) fulfils the order; a background worker
  researches, writes, renders a two-page PDF and emails the report; the web
  report, status and downloads are unlocked by an unguessable, hashed token
  from the email link that does not expire.

Still to be done by the owner before launch: apply the migrations and set the
environment variables (`docs/BACKEND.md`), review the draft legal pages, and
supply brand assets (colours in `src/styles/tokens.css` are provisional).

## Content principles

No invented testimonials, customers, market statistics or success rates. The
sample report is for a fictional business and is labelled illustrative
throughout. See `CLAUDE.md` for the full requirements and conventions.
