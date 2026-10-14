# Netlify Functions (not yet implemented)

This directory is reserved for the server-side functions the frontend expects
once demo mode is switched off. None exist yet; the frontend simulates them in
demo mode. Planned functions and the paths the frontend calls:

| Frontend call                      | Function file (planned)     | Purpose                                                        |
| ---------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `POST /api/create-checkout`        | `create-checkout.ts`        | Store the submission, create a Stripe Checkout session, return its URL |
| `GET  /api/report-status?id=...`   | `report-status.ts`          | Return processing status and, when ready, a signed PDF link    |
| `POST /api/recover-report`         | `recover-report.ts`         | Email a fresh report link to the address on file               |
| `POST /api/stripe-webhook`         | `stripe-webhook.ts`         | Mark the order paid and start report generation                |

The `/api/*` path is rewritten to `/.netlify/functions/*` in `netlify.toml`.
Secrets belong in Netlify environment variables, never in this repository.
