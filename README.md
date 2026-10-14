# Inovantage Idea Validator

Frontend for a pay-once business idea feasibility report. A customer answers a
six-step questionnaire about their idea and circumstances, pays £24, and
receives an evidence-based report by email with a PDF. No account required.
Markets: UK, US and Australia.

This is the **first frontend release**. Everything that needs a server
(payment, research, PDF, email) is simulated in demo mode and clearly labelled.
See "What is simulated" below.

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
| `npm run typecheck` | Type-check only                                |

## Configuration

Copy `.env.example` to `.env` to change settings locally. All values in the
example file are placeholders; never commit real keys.

| Variable                       | Default | Meaning                                                   |
| ------------------------------ | ------- | --------------------------------------------------------- |
| `VITE_DEMO_MODE`               | `true`  | Simulate checkout and processing. Only `"false"` turns it off. |
| `VITE_DRAFT_STORAGE`           | `none`  | `session` keeps questionnaire answers in this tab only. localStorage is never used. |
| `VITE_STRIPE_PUBLISHABLE_KEY`  | placeholder | Public key for a future payment integration.          |

Product settings (price, markets, turnaround, support email) live in
`src/config/product.ts`. Design tokens live in `src/styles/tokens.css`.

## Deploying to Netlify

`netlify.toml` is ready: build command `npm run build`, publish `dist`,
`/api/*` rewritten to Netlify Functions, and an SPA fallback so deep links such
as `/report/ABC123` work. Connect the repository in Netlify and it will build.
Set environment variables in the Netlify UI, not in the repo.

## Project layout

```
src/
  components/      Layout, buttons, notices, form field renderer, stepper
  config/          product.ts (price, markets, flags)
  lib/api.ts       API client; simulated in demo mode
  pages/           One file per route; legal/ holds the draft policies
  questionnaire/   schema (6 steps), validation, in-memory store, helpers
  styles/          tokens.css (design tokens), global, components, page styles
netlify/functions/ Reserved for the backend; README lists planned functions
```

## What is simulated (not yet built)

- **Payment.** The checkout page is a labelled simulation with "succeed" and
  "cancel" buttons. No payment provider is connected.
- **Report processing.** The status page advances on a timer in your browser.
  No research happens and no PDF is produced.
- **Email.** No confirmation, report or recovery email is sent.
- **Report lookup.** Demo references exist only in the current browser tab.
- **Legal pages.** Terms, privacy and refund pages are drafts with yellow
  placeholders for the owner and a legal adviser to complete.
- **Brand.** No brand assets were supplied; the wordmark is text and all
  colours are provisional (see `src/styles/tokens.css`).

## Content principles

No invented testimonials, customers, market statistics or success rates. The
sample report is for a fictional business and is labelled illustrative
throughout. See `CLAUDE.md` for the full requirements and conventions.
