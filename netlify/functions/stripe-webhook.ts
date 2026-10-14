import { stripeWebhook } from '../lib/handlers/webhook';
import { netlifyFunction } from '../lib/function';

// Stripe → POST https://<site>/api/stripe-webhook
// The raw body is read with req.text() inside the handler; nothing parses it first.
export default netlifyFunction('stripe-webhook', (req, deps) => stripeWebhook(req, deps));
